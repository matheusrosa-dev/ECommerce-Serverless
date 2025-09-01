import { DynamoDB } from "aws-sdk";
import * as AWSXray from "aws-xray-sdk";
import {
  IOrderEventDdb,
  OrderEventRepository,
} from "/opt/nodejs/orderEventsRepositoryLayer";
import { Context, SNSEvent, SNSMessage } from "aws-lambda";
import { IEnvelope, IOrderEvent } from "/opt/nodejs/orderEventsLayer";

AWSXray.captureAWS(require("aws-sdk"));

const eventsDdb = process.env.EVENTS_DDB!;
const ddbClient = new DynamoDB.DocumentClient();
const orderEventsRepository = new OrderEventRepository(ddbClient, eventsDdb);

export async function handler(
  event: SNSEvent,
  context: Context
): Promise<void> {
  await Promise.all(event.Records.map((record) => createEvent(record.Sns)));
}

function createEvent(body: SNSMessage) {
  const envelope = JSON.parse(body.Message) as IEnvelope;
  const event = JSON.parse(envelope.data) as IOrderEvent;

  console.log(`Order event - MessageId: ${body.MessageId}`);

  const timestamp = Date.now();
  const ttl = ~~(timestamp / 1000 + 5 * 60); // 5 minutos à frente do momento atual
  const orderEventDdb: IOrderEventDdb = {
    pk: `#order_${event.orderId}`,
    sk: `${envelope.eventType}#${timestamp}`,
    ttl,
    email: event.email,
    createdAt: timestamp,
    requestId: event.requestId,
    eventType: envelope.eventType,
    info: {
      orderId: event.orderId,
      productCodes: event.productCodes,
      messageId: body.MessageId,
    },
  };

  return orderEventsRepository.create(orderEventDdb);
}
