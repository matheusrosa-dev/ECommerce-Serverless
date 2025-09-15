import { DocumentClient } from "aws-sdk/clients/dynamodb";

export enum InvoiceTransactionStatus {
  GENERATED = "URL_GENERATED",
  RECEIVED = "INVOICE_RECEIVED",
  PROCESSED = "INVOICE_PROCESSED",
  TIMEOUT = "TIMEOUT",
  CANCELLED = "CANCELLED",
  NON_VALID_INVOICE_NUMBER = "NON_VALID_INVOICE_NUMBER",
  NOT_FOUND = "NOT_FOUND",
}

export interface IInvoiceTransaction {
  pk: string;
  sk: string;
  ttl: number;
  requestId: string;
  timestamp: number;
  expiresIn: number;
  connectionId: string;
  endpoint: string;
  transactionStatus: InvoiceTransactionStatus;
}

export class InvoiceTransactionRepository {
  private ddbClient: DocumentClient;
  private invoiceTransactionDdb: string;

  constructor(ddbClient: DocumentClient, invoiceTransactionDdb: string) {
    this.ddbClient = ddbClient;
    this.invoiceTransactionDdb = invoiceTransactionDdb;
  }

  async create(
    invoiceTransaction: IInvoiceTransaction
  ): Promise<IInvoiceTransaction> {
    await this.ddbClient
      .put({
        TableName: this.invoiceTransactionDdb,
        Item: invoiceTransaction,
      })
      .promise();

    return invoiceTransaction;
  }

  async findByKey(key: string): Promise<IInvoiceTransaction> {
    const data = await this.ddbClient
      .get({
        TableName: this.invoiceTransactionDdb,
        Key: {
          pk: "#transaction",
          sk: key,
        },
      })
      .promise();

    if (!data.Item) {
      throw new Error("Invoice transaction not found");
    }

    return data.Item as IInvoiceTransaction;
  }

  async updateInvoiceTransaction(
    key: string,
    status: InvoiceTransactionStatus
  ): Promise<boolean> {
    try {
      await this.ddbClient
        .update({
          TableName: this.invoiceTransactionDdb,
          Key: {
            pk: "#transaction",
            sk: key,
          },
          ConditionExpression: "attribute_exists(pk)",
          UpdateExpression: "SET transactionStatus = :transactionStatus",
          ExpressionAttributeValues: {
            ":transactionStatus": status,
          },
        })
        .promise();

      return true;
    } catch (ConditionalCheckFailedException) {
      console.error(ConditionalCheckFailedException);
      return false;
    }
  }
}
