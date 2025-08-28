import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { ProductRepository } from "/opt/nodejs/productsLayer";
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
  const method = event.httpMethod;

  console.log(
    `API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`
  );

  if (event.resource === "/products") {
    if (method === "GET") {
      console.log("GET /products");

      const products = await productRepository.findAll();

      return {
        statusCode: 200,
        body: JSON.stringify({
          data: {
            products,
          },
        }),
      };
    }
  }

  if (event.resource === "/products/{productId}") {
    const productId = event.pathParameters?.productId!;
    console.log("GET /products/{productId}");

    try {
      const product = await productRepository.findOne(productId);

      return {
        statusCode: 200,
        body: JSON.stringify({ data: product }),
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

  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Bad Request" }),
  };
}
