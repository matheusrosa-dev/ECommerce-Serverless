import * as cdk from "aws-cdk-lib";
import * as apiGatewayV2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apiGatewayV2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct } from "constructs";
import * as ssm from "aws-cdk-lib/aws-ssm";

export class InvoiceWSApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const invoiceTransactionLayerArn =
      ssm.StringParameter.valueForStringParameter(
        this,
        "InvoiceTransactionLayerVersionArn"
      );
    const invoiceTransactionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "InvoiceTransactionLayer",
      invoiceTransactionLayerArn
    );

    const invoiceLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "InvoiceRepositoryLayerVersionArn"
    );
    const invoiceLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "InvoiceRepositoryLayer",
      invoiceLayerArn
    );

    const invoiceWSConnectionLayerArn =
      ssm.StringParameter.valueForStringParameter(
        this,
        "InvoiceWSConnectionLayerVersionArn"
      );
    const invoiceWSConnectionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "InvoiceWSConnectionLayer",
      invoiceWSConnectionLayerArn
    );

    // Invoice and invoice transactions DDB
    const invoicesDdb = new dynamodb.Table(this, "InvoicesDdb", {
      tableName: "invoices",
      billingMode: dynamodb.BillingMode.PROVISIONED,
      writeCapacity: 1,
      readCapacity: 1,
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Invoice bucket
    const bucket = new s3.Bucket(this, "InvoiceBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          enabled: true,
          expiration: cdk.Duration.days(1),
        },
      ],
    });

    // WebSocket connection handler
    const connectionHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "InvoiceConnectionFunction",
      {
        functionName: "InvoiceConnectionFunction",
        entry: "lambda/invoices/invoiceConnectionFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        tracing: lambda.Tracing.ACTIVE,
      }
    );

    // WebSocket disconnection handler
    const disconnectionHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "InvoiceDisconnectionFunction",
      {
        functionName: "InvoiceDisconnectionFunction",
        entry: "lambda/invoices/invoiceDisconnectionFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        tracing: lambda.Tracing.ACTIVE,
      }
    );

    // WebSocket API
    const webSocketApi = new apiGatewayV2.WebSocketApi(this, "InvoiceWSApi", {
      apiName: "InvoiceWSApi",
      connectRouteOptions: {
        integration: new apiGatewayV2Integrations.WebSocketLambdaIntegration(
          "ConnectionHandler",
          connectionHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apiGatewayV2Integrations.WebSocketLambdaIntegration(
          "DisconnectionHandler",
          disconnectionHandler
        ),
      },
    });

    const stage = "prod";
    const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`;
    new apiGatewayV2.WebSocketStage(this, "InvoiceWSApiStage", {
      webSocketApi,
      stageName: stage,
      autoDeploy: true,
    });

    // Invoice URL handler
    const getUrlHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "InvoiceGetUrlFunction",
      {
        functionName: "InvoiceGetUrlFunction",
        entry: "lambda/invoices/invoiceGetUrlFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
        environment: {
          INVOICE_DDB: invoicesDdb.tableName,
          BUCKET_NAME: bucket.bucketName,
          INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
        },
        tracing: lambda.Tracing.ACTIVE,
      }
    );

    const invoicesDdbWriteTransactionPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [invoicesDdb.tableArn],
      conditions: {
        ["ForAllValues:StringLike"]: {
          "dynamodb:LeadingKeys": ["#transaction"],
        },
      },
    });
    const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:PutObject"],
      resources: [`${bucket.bucketArn}/*`],
    });

    getUrlHandler.addToRolePolicy(invoicesDdbWriteTransactionPolicy);
    getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy);
    webSocketApi.grantManageConnections(getUrlHandler);

    // Invoice import handler
    const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "InvoiceImportFunction",
      {
        functionName: "InvoiceImportFunction",
        entry: "lambda/invoices/invoiceImportFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        layers: [
          invoiceTransactionLayer,
          invoiceWSConnectionLayer,
          invoiceLayer,
        ],
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        environment: {
          INVOICE_DDB: invoicesDdb.tableName,
          INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
        },
        tracing: lambda.Tracing.ACTIVE,
      }
    );
    invoicesDdb.grantReadWriteData(invoiceImportHandler);
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(invoiceImportHandler)
    );
    const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:DeleteObject", "s3:GetObject"],
      resources: [`${bucket.bucketArn}/*`],
    });
    invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy);
    webSocketApi.grantManageConnections(invoiceImportHandler);

    // Cancel import handler
    const cancelImportHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "CancelImportFunction",
      {
        functionName: "CancelImportFunction",
        entry: "lambda/invoices/cancelImportFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        environment: {
          INVOICE_DDB: invoicesDdb.tableName,
          INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
        },
        tracing: lambda.Tracing.ACTIVE,
      }
    );
    const invoicesDdbReadWriteTransactionPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:UpdateItem", "dynamodb:GetItem"],
      resources: [invoicesDdb.tableArn],
      conditions: {
        ["ForAllValues:StringLike"]: {
          "dynamodb:LeadingKeys": ["#transaction"],
        },
      },
    });
    cancelImportHandler.addToRolePolicy(invoicesDdbReadWriteTransactionPolicy);
    webSocketApi.grantManageConnections(cancelImportHandler);

    // WebSocket API routes
    webSocketApi.addRoute("getImportUrl", {
      integration: new apiGatewayV2Integrations.WebSocketLambdaIntegration(
        "GetUrlHandler",
        getUrlHandler
      ),
    });

    webSocketApi.addRoute("cancelImport", {
      integration: new apiGatewayV2Integrations.WebSocketLambdaIntegration(
        "CancelImportHandler",
        cancelImportHandler
      ),
    });
  }
}
