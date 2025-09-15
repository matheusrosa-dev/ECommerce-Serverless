import { Context, S3Event, S3EventRecord } from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB, S3 } from "aws-sdk";
import * as AWSXRay from "aws-xray-sdk";
import {
  InvoiceTransactionRepository,
  InvoiceTransactionStatus,
} from "/opt/nodejs/invoiceTransaction";
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection";
import { IInvoiceFile, InvoiceRepository } from "/opt/nodejs/invoiceRepository";

AWSXRay.captureAWS(require("aws-sdk"));

const invoicesDdb = process.env.INVOICE_DDB!;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6);

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const apigwManagementApi = new ApiGatewayManagementApi({
  endpoint: invoiceWsApiEndpoint,
});

const invoiceTransactionRepository = new InvoiceTransactionRepository(
  ddbClient,
  invoicesDdb
);
const invoiceWSService = new InvoiceWSService(apigwManagementApi);
const invoiceRepository = new InvoiceRepository(ddbClient, invoicesDdb);

export async function handler(event: S3Event, context: Context): Promise<void> {
  console.log(event);

  await Promise.all(
    event.Records.map((record) => {
      return processRecord(record);
    })
  );
}

async function processRecord(record: S3EventRecord) {
  const key = record.s3.object.key;

  try {
    const invoiceTransaction = await invoiceTransactionRepository.findByKey(
      key
    );

    if (
      invoiceTransaction.transactionStatus !==
      InvoiceTransactionStatus.GENERATED
    ) {
      await invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        invoiceTransaction.transactionStatus
      );
      console.log("Non valid transaction status");
      return;
    }

    const object = await s3Client
      .getObject({
        Key: key,
        Bucket: record.s3.bucket.name,
      })
      .promise();

    await Promise.all([
      invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        InvoiceTransactionStatus.RECEIVED
      ),
      invoiceTransactionRepository.updateInvoiceTransaction(
        key,
        InvoiceTransactionStatus.RECEIVED
      ),
    ]);

    const invoice = JSON.parse(object.Body!.toString("utf-8")) as IInvoiceFile;
    console.log(invoice);

    if (invoice.invoiceNumber.length < 5) {
      await Promise.all([
        invoiceWSService.sendInvoiceStatus(
          key,
          invoiceTransaction.connectionId,
          InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER
        ),

        invoiceTransactionRepository.updateInvoiceTransaction(
          key,
          InvoiceTransactionStatus.NON_VALID_INVOICE_NUMBER
        ),
      ]);
      console.log("Invoice number too long");

      await invoiceWSService.disconnectClient(invoiceTransaction.connectionId);
      return;
    }

    await Promise.all([
      invoiceRepository.create({
        pk: `#invoice_${invoice.customerName}`,
        sk: invoice.invoiceNumber,
        ttl: 0,
        totalValue: invoice.totalValue,
        productId: invoice.productId,
        quantity: invoice.quantity,
        transactionId: key,
        createdAt: Date.now(),
      }),

      s3Client
        .deleteObject({
          Key: key,
          Bucket: record.s3.bucket.name,
        })
        .promise(),

      invoiceTransactionRepository.updateInvoiceTransaction(
        key,
        InvoiceTransactionStatus.PROCESSED
      ),

      invoiceWSService.sendInvoiceStatus(
        key,
        invoiceTransaction.connectionId,
        InvoiceTransactionStatus.PROCESSED
      ),
    ]);
  } catch (error) {
    console.log((<Error>error).message);
  }
}
