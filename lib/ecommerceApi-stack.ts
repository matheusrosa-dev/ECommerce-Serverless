import * as cdk from "aws-cdk-lib";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as apiGateway from "aws-cdk-lib/aws-apigateway";
import * as cwlogs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface IProps extends cdk.StackProps {
  productsFetchHandler: lambdaNodeJS.NodejsFunction;
  productsAdminHandler: lambdaNodeJS.NodejsFunction;
  ordersHandler: lambdaNodeJS.NodejsFunction;
  orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;
}

export class ECommerceApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs");

    const api = new apiGateway.RestApi(this, "ECommerceApi", {
      restApiName: "ECommerceApi",
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new apiGateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apiGateway.AccessLogFormat.jsonWithStandardFields(),
      },
    });

    this.createProductsService(props, api);
    this.createOrdersService(props, api);
  }

  private createProductsService(
    props: Pick<IProps, "productsFetchHandler" | "productsAdminHandler">,
    api: apiGateway.RestApi
  ) {
    const productsFetchIntegration = new apiGateway.LambdaIntegration(
      props.productsFetchHandler
    );
    const productsAdminIntegration = new apiGateway.LambdaIntegration(
      props.productsAdminHandler
    );

    const createUpdateProductValidator = new apiGateway.RequestValidator(
      this,
      "CreateUpdateProductValidator",
      {
        restApi: api,
        requestValidatorName: "CreateUpdateProductValidator",
        validateRequestBody: true,
      }
    );
    const createUpdateProductModel = new apiGateway.Model(
      this,
      "CreateUpdateProductModel",
      {
        modelName: "CreateUpdateProductModel",
        restApi: api,
        schema: {
          type: apiGateway.JsonSchemaType.OBJECT,
          properties: {
            productName: {
              type: apiGateway.JsonSchemaType.STRING,
            },
            code: {
              type: apiGateway.JsonSchemaType.STRING,
            },
            model: {
              type: apiGateway.JsonSchemaType.STRING,
            },
            productUrl: {
              type: apiGateway.JsonSchemaType.STRING,
            },
            price: {
              type: apiGateway.JsonSchemaType.NUMBER,
            },
          },
          required: ["productName", "code"],
        },
      }
    );

    const productsResource = api.root.addResource("products");
    const productIdResource = productsResource.addResource("{productId}");

    // GET - /products
    productsResource.addMethod("GET", productsFetchIntegration);

    // GET - /products/{productId}
    productIdResource.addMethod("GET", productsFetchIntegration);

    // POST - /products
    productsResource.addMethod("POST", productsAdminIntegration, {
      requestValidator: createUpdateProductValidator,
      requestModels: {
        "application/json": createUpdateProductModel,
      },
    });

    // PUT - /products/{productId}
    productIdResource.addMethod("PUT", productsAdminIntegration, {
      requestValidator: createUpdateProductValidator,
      requestModels: {
        "application/json": createUpdateProductModel,
      },
    });

    // DELETE - /products/{productId}
    productIdResource.addMethod("DELETE", productsAdminIntegration);
  }

  private createOrdersService(
    props: Pick<IProps, "ordersHandler" | "orderEventsFetchHandler">,
    api: apiGateway.RestApi
  ) {
    const ordersIntegration = new apiGateway.LambdaIntegration(
      props.ordersHandler
    );
    const orderEventsFetchIntegration = new apiGateway.LambdaIntegration(
      props.orderEventsFetchHandler
    );

    const createOrderValidator = new apiGateway.RequestValidator(
      this,
      "CreateOrderValidator",
      {
        restApi: api,
        requestValidatorName: "CreateOrderValidator",
        validateRequestBody: true,
      }
    );

    const createOrderModel = new apiGateway.Model(this, "CreateOrderModel", {
      modelName: "CreateOrderModel",
      restApi: api,
      schema: {
        type: apiGateway.JsonSchemaType.OBJECT,
        properties: {
          email: {
            type: apiGateway.JsonSchemaType.STRING,
          },
          productIds: {
            type: apiGateway.JsonSchemaType.ARRAY,
            minItems: 1,
            items: {
              type: apiGateway.JsonSchemaType.STRING,
            },
          },
          payment: {
            type: apiGateway.JsonSchemaType.STRING,
            enum: ["CASH", "DEBIT_CARD", "CREDIT_CARD"],
          },
        },
        required: ["email", "productIds", "payment"],
      },
    });

    const ordersResource = api.root.addResource("orders");

    const deleteOrderValidator = new apiGateway.RequestValidator(
      this,
      "DeleteOrderValidator",
      {
        restApi: api,
        requestValidatorName: "DeleteOrderValidator",
        validateRequestParameters: true,
      }
    );

    // GET - /orders?email=teste@email.com&orderId=123
    ordersResource.addMethod("GET", ordersIntegration);

    // POST - /orders
    ordersResource.addMethod("POST", ordersIntegration, {
      requestValidator: createOrderValidator,
      requestModels: {
        "application/json": createOrderModel,
      },
    });

    // DELETE - /orders
    // DELETE - /orders?email=teste@email.com&orderId=123
    ordersResource.addMethod("DELETE", ordersIntegration, {
      requestParameters: {
        "method.request.querystring.email": true,
        "method.request.querystring.orderId": true,
      },
      requestValidator: deleteOrderValidator,
    });

    const orderEventsResource = ordersResource.addResource("events");

    const orderEventsFetchValidator = new apiGateway.RequestValidator(
      this,
      "OrderEventsFetchValidator",
      {
        restApi: api,
        requestValidatorName: "OrderEventsFetchValidator",
        validateRequestParameters: true,
      }
    );

    // GET - /orders/events?email=teste@email.com
    // GET - /orders/events?email=teste@email.com&eventType=ORDER_CREATED
    orderEventsResource.addMethod("GET", orderEventsFetchIntegration, {
      requestParameters: {
        "method.request.querystring.email": true,
        "method.request.querystring.eventType": false,
      },
      requestValidator: orderEventsFetchValidator,
    });
  }
}
