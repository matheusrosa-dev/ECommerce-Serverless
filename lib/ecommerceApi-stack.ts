import * as cdk from "aws-cdk-lib";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as apiGateway from "aws-cdk-lib/aws-apigateway";
import * as cwlogs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface IProps extends cdk.StackProps {
  productsFetchHandler: lambdaNodeJS.NodejsFunction;
  productsAdminHandler: lambdaNodeJS.NodejsFunction;
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
}
