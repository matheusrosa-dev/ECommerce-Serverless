import { Callback, Context } from "aws-lambda";
import { IProductEvent } from "/opt/nodejs/productEventsLayer";
import { DynamoDB } from "aws-sdk";
import * as AWSXray from "aws-xray-sdk";

AWSXray.captureAWS(require("aws-sdk"));

const eventsDdb = process.env.EVENTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();

export async function handler(
  event: IProductEvent,
  context: Context,
  callback: Callback
): Promise<void> {
  console.log(event);
  console.log(`Lambda RequestId: ${context.awsRequestId}`);

  await createEvent(event);

  callback(
    null,
    JSON.stringify({
      productEventCreated: true,
      message: "OK",
    })
  );
}

function createEvent(event: IProductEvent) {
  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 5 * 60); // 5 minutos à frente do momento atual

  return ddbClient
    .put({
      TableName: eventsDdb,
      Item: {
        pk: `#product_${event.productCode}`,
        sk: `${event.eventType}#${timestamp}`,
        email: event.email,
        createdAt: timestamp,
        requestId: event.requestId,
        eventType: event.eventType,
        info: {
          productId: event.productId,
          productPrice: event.productPrice,
        },
        ttl,
      },
    })
    .promise();
}
