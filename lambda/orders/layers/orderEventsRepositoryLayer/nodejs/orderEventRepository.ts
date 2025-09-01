import { DocumentClient } from "aws-sdk/clients/dynamodb";

export interface IOrderEventDdb {
  pk: string;
  sk: string;
  ttl: number;
  email: string;
  createdAt: number;
  requestId: string;
  eventType: string;
  info: {
    orderId: string;
    productCodes: string[];
    messageId: string;
  };
}

export class OrderEventRepository {
  private ddbClient: DocumentClient;
  private eventsDdb: string;

  constructor(ddbClient: DocumentClient, eventsDdb: string) {
    this.ddbClient = ddbClient;
    this.eventsDdb = eventsDdb;
  }

  create(event: IOrderEventDdb) {
    return this.ddbClient
      .put({
        TableName: this.eventsDdb,
        Item: event,
      })
      .promise();
  }
}
