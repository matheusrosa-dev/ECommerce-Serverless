import { Context, SNSMessage, SQSEvent } from "aws-lambda";
import * as AWSXray from "aws-xray-sdk";
import { IEnvelope, IOrderEvent } from "/opt/nodejs/orderEventsLayer";
import { SES } from "aws-sdk";

AWSXray.captureAWS(require("aws-sdk"));

const sesClient = new SES();

export async function handler(
  event: SQSEvent,
  context: Context
): Promise<void> {
  await Promise.all(
    event.Records.map((record) => {
      const body = JSON.parse(record.body) as SNSMessage;
      return sendOrderEmail(body);
    })
  );
}

function sendOrderEmail(body: SNSMessage) {
  const envelope = JSON.parse(body.Message) as IEnvelope;
  const event = JSON.parse(envelope.data) as IOrderEvent;

  return sesClient
    .sendEmail({
      Destination: {
        ToAddresses: [event.email],
      },
      Message: {
        Body: {
          Text: {
            Charset: "UTF-8",
            Data: `Recebemos seu pedido de número ${event.orderId}, no valor de R$ ${event.billing.totalPrice}.`,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: "Recebemos seu pedido!",
        },
      },
      Source: "matheuslipknot11@gmail.com",
      ReplyToAddresses: ["matheuslipknot11@gmail.com"],
    })
    .promise();
}
