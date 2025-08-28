import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { IProduct, ProductRepository } from "/opt/nodejs/productsLayer";
import { DynamoDB, Lambda } from "aws-sdk";
import {
  IProductEvent,
  ProductEventType,
} from "/opt/nodejs/productEventsLayer";
import AWSXray from "aws-xray-sdk";

AWSXray.captureAWS(require("aws-sdk"));

const productsDdb = process.env.PRODUCTS_DDB!;
const productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const lambdaClient = new Lambda();

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

    const product = JSON.parse(event.body!) as IProduct;
    const created = await productRepository.create(product);

    const response = await sendProductEvent(
      created,
      ProductEventType.CREATED,
      "teste@gmail.com",
      lambdaRequestId
    );

    console.log(response);

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
        const product = JSON.parse(event.body!) as IProduct;
        const updated = await productRepository.update(productId!, product);

        const response = await sendProductEvent(
          updated,
          ProductEventType.UPDATED,
          "teste2@gmail.com",
          lambdaRequestId
        );

        console.log(response);

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
        const deleted = await productRepository.delete(productId!);

        const response = await sendProductEvent(
          deleted,
          ProductEventType.DELETED,
          "teste3@gmail.com",
          lambdaRequestId
        );

        console.log(response);

        return {
          statusCode: 200,
          body: JSON.stringify({
            data: deleted,
          }),
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

function sendProductEvent(
  product: IProduct,
  eventType: ProductEventType,
  email: string,
  lambdaRequestId: string
) {
  const event: IProductEvent = {
    email,
    eventType,
    productCode: product.code,
    productId: product.id,
    productPrice: product.price,
    requestId: lambdaRequestId,
  };

  return lambdaClient
    .invoke({
      FunctionName: productEventsFunctionName,
      Payload: JSON.stringify(event),

      // Assíncrono
      InvocationType: "Event",

      // Sincrono
      // InvocationType: "RequestResponse",
    })
    .promise();
}
