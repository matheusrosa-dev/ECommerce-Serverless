import { Context, DynamoDBStreamEvent } from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB } from "aws-sdk";
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection";
import * as AWSXRay from "aws-xray-sdk";

AWSXRay.captureAWS(require("aws-sdk"));

const eventsDdb = process.env.EVENTS_DDB!;
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6);

const ddbClient = new DynamoDB.DocumentClient();
const apigwManagementApi = new ApiGatewayManagementApi({
  endpoint: invoiceWsApiEndpoint,
});

const invoiceWSService = new InvoiceWSService(apigwManagementApi);

export async function handler(
  event: DynamoDBStreamEvent,
  context: Context
): Promise<void> {
  const promises: Promise<void>[] = [];

  event.Records.forEach((record) => {
    if (record.eventName === "INSERT") {
      if (record.dynamodb?.NewImage?.pk.S?.startsWith("#transaction")) {
        console.log("Invoice transaction event received");
      } else {
        console.log("Invoice event received");

        const promise = createEvent(
          record.dynamodb!.NewImage!,
          "INVOICE_CREATED"
        );

        promises.push(promise);
      }
    } else if (record.eventName === "REMOVE") {
      if (record.dynamodb?.OldImage?.pk.S === "#transaction") {
        console.log("Invoice transaction event received");
        const promise = processExpiredTransaction(record.dynamodb.OldImage!);

        promises.push(promise);
      }
    }
  });

  await Promise.all(promises);
}

async function processExpiredTransaction(invoiceTransactionImage: {
  [key: string]: DynamoDB.AttributeValue;
}): Promise<void> {
  const transactionId = invoiceTransactionImage.sk.S!;
  const connectionId = invoiceTransactionImage.connectionId.S!;

  console.log(
    `TransactionId: ${transactionId} - ConnectionId: ${connectionId}`
  );

  if (invoiceTransactionImage.transactionStatus.S === "INVOICE_PROCESSED") {
    console.log("Invoice processed");
  } else {
    console.log(
      `Invoice import failed - Status: ${invoiceTransactionImage.transactionStatus.S}`
    );

    await invoiceWSService.sendInvoiceStatus(
      transactionId,
      connectionId,
      "TIMEOUT"
    );

    await invoiceWSService.disconnectClient(connectionId);
  }
}

async function createEvent(
  invoiceImage: { [key: string]: DynamoDB.AttributeValue },
  eventType: string
) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 60 * 60); // 1 hora à frente do momento atual

  await ddbClient
    .put({
      TableName: eventsDdb,
      Item: {
        pk: `#invoice_${invoiceImage.sk.S}`, // #invoice_ABC-123
        sk: `${eventType}#${timestamp}`,
        ttl,
        email: invoiceImage.pk.S?.split("_")[1],
        createdAt: timestamp,
        info: {
          transactionId: invoiceImage.transactionId.S,
          productId: invoiceImage.productId.S,
          quantity: invoiceImage.quantity.N,
        },
      },
    })
    .promise();
}
