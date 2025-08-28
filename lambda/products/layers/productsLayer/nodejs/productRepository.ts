import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { v4 as uuid } from "uuid";

export interface IProduct {
  id: string;
  productName: string;
  code: string;
  price: number;
  model: string;
  productUrl: string;
}

export class ProductRepository {
  private ddbClient: DocumentClient;
  private productsDdb: string;

  constructor(ddbClient: DocumentClient, productsDdb: string) {
    this.ddbClient = ddbClient;
    this.productsDdb = productsDdb;
  }

  async findAll(): Promise<IProduct[]> {
    const data = await this.ddbClient
      .scan({
        TableName: this.productsDdb,
      })
      .promise();

    return data.Items as IProduct[];
  }

  async findOne(productId: string): Promise<IProduct> {
    const data = await this.ddbClient
      .get({
        TableName: this.productsDdb,
        Key: {
          id: productId,
        },
      })
      .promise();

    if (!data.Item) {
      throw new Error("Product not found");
    }

    return data.Item as IProduct;
  }

  async create(product: IProduct): Promise<IProduct> {
    product.id = uuid();

    await this.ddbClient
      .put({
        TableName: this.productsDdb,
        Item: product,
      })
      .promise();

    return product;
  }

  async delete(productId: string): Promise<IProduct> {
    const data = await this.ddbClient
      .delete({
        TableName: this.productsDdb,
        Key: {
          id: productId,
        },
        ReturnValues: "ALL_OLD",
      })
      .promise();

    if (!data.Attributes) {
      throw new Error("Product not found");
    }

    return data.Attributes as IProduct;
  }

  async update(productId: string, product: IProduct): Promise<IProduct> {
    const data = await this.ddbClient
      .update({
        TableName: this.productsDdb,
        Key: {
          id: productId,
        },
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "UPDATED_NEW",
        UpdateExpression:
          "SET productName = :productName, code = :code, price = :price, model = :model, productUrl = :productUrl",
        ExpressionAttributeValues: {
          ":productName": product.productName,
          ":code": product.code,
          ":price": product.price,
          ":model": product.model,
          ":productUrl": product.productUrl,
        },
      })
      .promise();

    data.Attributes!.id = productId;

    return data.Attributes as IProduct;
  }

  async findManyByIds(productIds: string[]): Promise<IProduct[]> {
    const keys = productIds.map((id) => ({ id }));

    const data = await this.ddbClient
      .batchGet({
        RequestItems: {
          [this.productsDdb]: {
            Keys: keys,
          },
        },
      })
      .promise();

    return data.Responses![this.productsDdb] as IProduct[];
  }
}
