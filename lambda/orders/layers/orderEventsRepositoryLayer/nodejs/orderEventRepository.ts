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

  async findManyByEmail(email: string) {
    const data = await this.ddbClient
      .query({
        TableName: this.eventsDdb,
        IndexName: "emailIndex",
        KeyConditionExpression: "email = :email AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":email": email,
          ":prefix": "ORDER_",
        },
      })
      .promise();

    return data.Items as IOrderEventDdb[];
  }

  async findManyByEmailAndEventType(email: string, eventType: string) {
    const data = await this.ddbClient
      .query({
        TableName: this.eventsDdb,
        IndexName: "emailIndex",
        KeyConditionExpression: "email = :email AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":email": email,
          ":prefix": eventType,
        },
      })
      .promise();

    return data.Items as IOrderEventDdb[];
  }
}
