import * as cdk from "aws-cdk-lib";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as apiGateway from "aws-cdk-lib/aws-apigateway";
import * as cwlogs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface IProps extends cdk.StackProps {
  productsFetchHandler: lambdaNodeJS.NodejsFunction;
  productsAdminHandler: lambdaNodeJS.NodejsFunction;
  ordersHandler: lambdaNodeJS.NodejsFunction;
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

    const productsResource = api.root.addResource("products");
    const productIdResource = productsResource.addResource("{productId}");

    // GET - /products
    productsResource.addMethod("GET", productsFetchIntegration);

    // GET - /products/{productId}
    productIdResource.addMethod("GET", productsFetchIntegration);

    // POST - /products
    productsResource.addMethod("POST", productsAdminIntegration);

    // PUT - /products/{productId}
    productIdResource.addMethod("PUT", productsAdminIntegration);

    // DELETE - /products/{productId}
    productIdResource.addMethod("DELETE", productsAdminIntegration);
  }

  private createOrdersService(
    props: Pick<IProps, "ordersHandler">,
    api: apiGateway.RestApi
  ) {
    const ordersIntegration = new apiGateway.LambdaIntegration(
      props.ordersHandler
    );

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
    ordersResource.addMethod("POST", ordersIntegration);

    // DELETE - /orders
    // DELETE - /orders?email=teste@email.com&orderId=123
    ordersResource.addMethod("DELETE", ordersIntegration, {
      requestParameters: {
        "method.request.querystring.email": true,
        "method.request.querystring.orderId": true,
      },
      requestValidator: deleteOrderValidator,
    });
  }
}
