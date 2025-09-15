import { DocumentClient } from "aws-sdk/clients/dynamodb";

export interface IInvoiceFile {
  customerName: string;
  invoiceNumber: string;
  totalValue: number;
  productId: string;
  quantity: number;
}

export interface IInvoice {
  pk: string;
  sk: string;
  totalValue: number;
  productId: string;
  quantity: number;
  transactionId: string;
  ttl: number;
  createdAt: number;
}

export class InvoiceRepository {
  private ddbClient: DocumentClient;
  private invoicesDdb: string;

  constructor(ddbClient: DocumentClient, invoicesDdb: string) {
    this.ddbClient = ddbClient;
    this.invoicesDdb = invoicesDdb;
  }

  async create(invoice: IInvoice): Promise<IInvoice> {
    await this.ddbClient
      .put({
        TableName: this.invoicesDdb,
        Item: invoice,
      })
      .promise();

    return invoice;
  }
}
