import { DocumentClient } from "aws-sdk/clients/dynamodb";

export interface IOrderProduct {
  code: string;
  price: number;
}

export interface IOrder {
  pk: string;
  sk: string;
  createdAt: number;
  shipping: {
    type: "URGENT" | "ECONOMIC";
    carrier: "CORREIOS" | "FEDEX";
  };
  billing: {
    payment: "CASH" | "DEBIT_CARD" | "CREDIT_CARD";
    totalPrice: number;
  };
  products?: IOrderProduct[];
}

export class OrderRepository {
  private ddbClient: DocumentClient;
  private ordersDdb: string;

  constructor(ddbClient: DocumentClient, ordersDdb: string) {
    this.ddbClient = ddbClient;
    this.ordersDdb = ordersDdb;
  }

  async create(order: IOrder): Promise<IOrder> {
    await this.ddbClient
      .put({
        TableName: this.ordersDdb,
        Item: order,
      })
      .promise();

    return order;
  }

  async findAll(): Promise<IOrder[]> {
    const data = await this.ddbClient
      .scan({
        TableName: this.ordersDdb,
        ProjectionExpression: "pk, sk, createdAt, shipping, billing",
      })
      .promise();

    return data.Items as IOrder[];
  }

  async findManyByEmail(email: string): Promise<IOrder[]> {
    const data = await this.ddbClient
      .query({
        TableName: this.ordersDdb,
        KeyConditionExpression: "pk = :email",
        ProjectionExpression: "pk, sk, createdAt, shipping, billing",
        ExpressionAttributeValues: {
          ":email": email,
        },
      })
      .promise();

    return data.Items as IOrder[];
  }

  async findOne(email: string, orderId: string): Promise<IOrder> {
    const data = await this.ddbClient
      .get({
        TableName: this.ordersDdb,
        Key: {
          pk: email,
          sk: orderId,
        },
      })
      .promise();

    if (!data.Item) {
      throw new Error("Order not found");
    }

    return data.Item as IOrder;
  }

  async delete(email: string, orderId: string): Promise<IOrder> {
    const data = await this.ddbClient
      .delete({
        TableName: this.ordersDdb,
        Key: {
          pk: email,
          sk: orderId,
        },
        ReturnValues: "ALL_OLD",
      })
      .promise();

    if (!data.Attributes) {
      throw new Error("Order not found");
    }

    return data.Attributes as IOrder;
  }
}
