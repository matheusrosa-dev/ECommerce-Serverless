import { DynamoDB, SNS } from "aws-sdk";
import { IOrder, OrderRepository } from "/opt/nodejs/ordersLayer";
import { IProduct, ProductRepository } from "/opt/nodejs/productsLayer";
import * as AWSXray from "aws-xray-sdk";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import {
  CarrierType,
  IOrderProductResponse,
  IOrderRequest,
  IOrderResponse,
  PaymentType,
  ShippingType,
} from "/opt/nodejs/ordersApiLayer";
import {
  IOrderEvent,
  IEnvelope,
  OrderEventType,
} from "/opt/nodejs/orderEventsLayer";
import { v4 as uuid } from "uuid";

AWSXray.captureAWS(require("aws-sdk"));

const ordersDdb = process.env.ORDERS_DDB!;
const productsDdb = process.env.PRODUCTS_DDB!;
const orderEventsTopicArn = process.env.ORDER_EVENTS_TOPIC_ARN!;

const ddbClient = new DynamoDB.DocumentClient();
const snsClient = new SNS();

const orderRepository = new OrderRepository(ddbClient, ordersDdb);
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

  if (event.httpMethod === "GET") {
    console.log("GET /orders");

    if (event.queryStringParameters) {
      const email = event.queryStringParameters!.email;
      const orderId = event.queryStringParameters!.orderId;

      if (email && orderId) {
        // get one order from an user
        try {
          const order = await orderRepository.findOne(email, orderId);

          return {
            statusCode: 200,
            body: JSON.stringify({
              data: buildOrderResponse(order),
            }),
          };
        } catch (error) {
          console.log((<Error>error).message);

          return {
            statusCode: 404,
            body: JSON.stringify({
              message: (<Error>error).message,
            }),
          };
        }
      }

      if (email) {
        // Get all orders from an user
        const orders = await orderRepository.findManyByEmail(email);

        return {
          statusCode: 200,
          body: JSON.stringify({
            data: {
              orders: orders.map(buildOrderResponse),
            },
          }),
        };
      }
    }

    // Get all orders
    const orders = await orderRepository.findAll();

    return {
      statusCode: 200,
      body: JSON.stringify({
        data: {
          orders: orders.map(buildOrderResponse),
        },
      }),
    };
  }

  if (event.httpMethod === "POST") {
    console.log("POST /orders");
    const orderRequest = JSON.parse(event.body!) as IOrderRequest;

    const products = await productRepository.findManyByIds(
      orderRequest.productIds
    );

    if (products.length !== orderRequest.productIds.length) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "Some product was not found",
        }),
      };
    }

    const order = buildOrder(orderRequest, products);

    const [created, eventResult] = await Promise.all([
      orderRepository.create(order),
      sendOrderEvent(order, OrderEventType.CREATED, lambdaRequestId),
    ]);

    console.log(
      `Order created event sent - OrderId: ${created.sk} - MessageId: ${eventResult.MessageId}`
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        data: buildOrderResponse(created),
      }),
    };
  }

  if (event.httpMethod === "DELETE") {
    console.log("DELETE /orders");

    const email = event.queryStringParameters!.email!;
    const orderId = event.queryStringParameters!.orderId!;

    try {
      const deleted = await orderRepository.delete(email, orderId);

      const eventResult = await sendOrderEvent(
        deleted,
        OrderEventType.DELETED,
        lambdaRequestId
      );
      console.log(
        `Order deleted event sent - OrderId: ${deleted.sk} - MessageId: ${eventResult.MessageId}`
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          data: buildOrderResponse(deleted),
        }),
      };
    } catch (error) {
      console.log((<Error>error).message);

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
    body: JSON.stringify({
      message: "Bad Request",
    }),
  };
}

function buildOrder(orderRequest: IOrderRequest, products: IProduct[]): IOrder {
  const { totalPrice, orderProducts } = products.reduce(
    (acc, cur) => ({
      totalPrice: acc.totalPrice + cur.price,
      orderProducts: [
        ...acc.orderProducts,
        {
          code: cur.code,
          price: cur.price,
        },
      ],
    }),

    { totalPrice: 0, orderProducts: [] as IOrderProductResponse[] }
  );

  const order: IOrder = {
    pk: orderRequest.email,
    sk: uuid(),
    createdAt: Date.now(),
    billing: {
      payment: orderRequest.payment,
      totalPrice,
    },
    shipping: {
      type: orderRequest.shipping.type,
      carrier: orderRequest.shipping.carrier,
    },
    products: orderProducts,
  };

  return order;
}

function buildOrderResponse(order: IOrder): IOrderResponse {
  const orderProducts: IOrderProductResponse[] =
    order.products?.map((product) => ({
      code: product.code,
      price: product.price,
    })) || [];

  const orderResponse: IOrderResponse = {
    email: order.pk,
    id: order.sk!,
    createdAt: order.createdAt!,
    products: orderProducts.length > 0 ? orderProducts : undefined,
    billing: {
      payment: order.billing.payment as PaymentType,
      totalPrice: order.billing.totalPrice,
    },
    shipping: {
      type: order.shipping.type as ShippingType,
      carrier: order.shipping.carrier as CarrierType,
    },
  };

  return orderResponse;
}

function sendOrderEvent(
  order: IOrder,
  eventType: OrderEventType,
  lambdaRequestId: string
) {
  const orderEvent: IOrderEvent = {
    email: order.pk,
    orderId: order.sk!,
    billing: order.billing,
    shipping: order.shipping,
    requestId: lambdaRequestId,
    productCodes: order.products?.map((product) => product.code) || [],
  };

  const envelope: IEnvelope = {
    eventType,
    data: JSON.stringify(orderEvent),
  };

  return snsClient
    .publish({
      TopicArn: orderEventsTopicArn,
      Message: JSON.stringify(envelope),
      MessageAttributes: {
        eventType: {
          DataType: "String",
          StringValue: eventType,
        },
      },
    })
    .promise();
}
