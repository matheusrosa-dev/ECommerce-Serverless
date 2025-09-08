import { DynamoDB } from "aws-sdk";
import * as AWSXray from "aws-xray-sdk";
import {
  IOrderEventDdb,
  OrderEventRepository,
} from "/opt/nodejs/orderEventsRepositoryLayer";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";

AWSXray.captureAWS(require("aws-sdk"));

const eventsDdb = process.env.EVENTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();
const orderEventsRepository = new OrderEventRepository(ddbClient, eventsDdb);

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const email = event.queryStringParameters!.email!;
  const eventType = event.queryStringParameters!.eventType;

  if (!eventType) {
    const orderEvents = await orderEventsRepository.findManyByEmail(email);

    return {
      statusCode: 200,
      body: JSON.stringify({
        data: convertOrderEvents(orderEvents),
      }),
    };
  }

  const orderEvents = await orderEventsRepository.findManyByEmailAndEventType(
    email,
    eventType
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      data: convertOrderEvents(orderEvents),
    }),
  };
}

function convertOrderEvents(orderEvents: IOrderEventDdb[]) {
  return orderEvents.map((orderEvent) => {
    return {
      email: orderEvent.email,
      createdAt: orderEvent.createdAt,
      eventType: orderEvent.eventType,
      requestId: orderEvent.requestId,
      orderId: orderEvent.info.orderId,
      productCodes: orderEvent.info.productCodes,
    };
  });
}
