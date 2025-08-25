import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import { DynamoDB } from "aws-sdk";
import AWSXray from "aws-xray-sdk";

AWSXray.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();
const productRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const lambdaRequestId = context.awsRequestId;
  const apiRequestId = event.requestContext.requestId;

  console.log(
    `API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`
  );

  if (event.resource === "/products") {
    console.log("POST /products");

    const product = JSON.parse(event.body!) as Product;
    const created = await productRepository.create(product);

    return {
      statusCode: 201,
      body: JSON.stringify({ data: created }),
    };
  }

  if (event.resource === "/products/{productId}") {
    const productId = event.pathParameters?.productId;

    if (event.httpMethod === "PUT") {
      console.log("PUT /products/{productId}");

      try {
        const product = JSON.parse(event.body!) as Product;
        const updated = await productRepository.update(productId!, product);

        return {
          statusCode: 200,
          body: JSON.stringify({ data: updated }),
        };
      } catch (ConditionalCheckFailedException) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            message: "Product not found",
          }),
        };
      }
    }

    if (event.httpMethod === "DELETE") {
      console.log("DELETE /products/{productId}");

      try {
        await productRepository.delete(productId!);

        return {
          statusCode: 204,
          body: "",
        };
      } catch (error) {
        console.error((<Error>error).message);

        return {
          statusCode: 404,
          body: JSON.stringify({
            message: (<Error>error).message,
          }),
        };
      }
    }
  }

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: "Bad Request",
    }),
  };
}
