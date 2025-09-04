import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambdaEventSource from "aws-cdk-lib/aws-lambda-event-sources";

interface IProps extends cdk.StackProps {
  productsDdb: dynamodb.Table;
  eventsDdb: dynamodb.Table;
}

export class OrdersAppStack extends cdk.Stack {
  readonly ordersHandler: lambdaNodeJS.NodejsFunction;

  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id, props);

    const ordersDdb = new dynamodb.Table(this, "OrdersDdb", {
      tableName: "orders",
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    const productsLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "ProductsLayerVersionArn"
    );
    const productsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "ProductsLayerVersionArn",
      productsLayerArn
    );

    const ordersLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "OrdersLayerVersionArn"
    );
    const ordersLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrdersLayerVersionArn",
      ordersLayerArn
    );

    const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "OrdersApiLayerVersionArn"
    );
    const ordersApiLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrdersApiLayerVersionArn",
      ordersApiLayerArn
    );

    const orderEventsLayerArn = ssm.StringParameter.valueForStringParameter(
      this,
      "OrderEventsLayerVersionArn"
    );
    const orderEventsLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrderEventsLayerVersionArn",
      orderEventsLayerArn
    );

    const orderEventsRepositoryLayerArn =
      ssm.StringParameter.valueForStringParameter(
        this,
        "OrderEventsRepositoryLayerVersionArn"
      );
    const orderEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "OrderEventsRepositoryLayerVersionArn",
      orderEventsRepositoryLayerArn
    );

    const ordersTopic = new sns.Topic(this, "OrderEventsTopic", {
      displayName: "Order events topic",
      topicName: "order-events",
    });

    this.ordersHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrdersFunction",
      {
        functionName: "OrdersFunction",
        entry: "lambda/orders/ordersFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        environment: {
          PRODUCTS_DDB: props.productsDdb.tableName,
          ORDERS_DDB: ordersDdb.tableName,
          ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
        },
        layers: [productsLayer, ordersLayer, ordersApiLayer, orderEventsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    const orderEventsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrderEventsFunction",
      {
        functionName: "OrderEventsFunction",
        entry: "lambda/orders/orderEventsFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        environment: {
          EVENTS_DDB: props.eventsDdb.tableName,
        },
        layers: [orderEventsLayer, orderEventsRepositoryLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    const billingHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "BillingFunction",
      {
        functionName: "BillingFunction",
        entry: "lambda/orders/billingFunction.ts",
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
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    const orderEmailsHandler = new lambdaNodeJS.NodejsFunction(
      this,
      "OrderEmailsFunction",
      {
        functionName: "OrderEmailsFunction",
        entry: "lambda/orders/orderEmailsFunction.ts",
        handler: "handler",
        memorySize: 512,
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(5),
        bundling: {
          minify: true,
          sourceMap: false,
          nodeModules: ["aws-xray-sdk-core"],
        },
        layers: [orderEventsLayer],
        tracing: lambda.Tracing.ACTIVE,
        insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      }
    );

    const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
      queueName: "order-events-dlq",
      retentionPeriod: cdk.Duration.days(10),
      enforceSSL: false,
      encryption: sqs.QueueEncryption.UNENCRYPTED,
    });
    const orderEventsQueue = new sqs.Queue(this, "OrderEventsQueue", {
      queueName: "order-events",
      enforceSSL: false,
      encryption: sqs.QueueEncryption.UNENCRYPTED,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: orderEventsDlq,
      },
    });

    ordersDdb.grantReadWriteData(this.ordersHandler);
    props.productsDdb.grantReadData(this.ordersHandler);

    ordersTopic.addSubscription(
      new subs.LambdaSubscription(orderEventsHandler)
    );
    ordersTopic.addSubscription(
      new subs.LambdaSubscription(billingHandler, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ["ORDER_CREATED"],
          }),
        },
      })
    );
    ordersTopic.addSubscription(
      new subs.SqsSubscription(orderEventsQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ["ORDER_CREATED"],
          }),
        },
      })
    );

    ordersTopic.grantPublish(this.ordersHandler);
    const eventsDdbPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [props.eventsDdb.tableArn],
      conditions: {
        ["ForAllValues:StringLike"]: {
          "dynamodb:LeadingKeys": ["#order_*"],
        },
      },
    });

    const orderEmailSesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });

    orderEventsHandler.addToRolePolicy(eventsDdbPolicy);
    orderEventsQueue.grantConsumeMessages(orderEmailsHandler);
    orderEmailsHandler.addToRolePolicy(orderEmailSesPolicy);
    orderEmailsHandler.addEventSource(
      new lambdaEventSource.SqsEventSource(orderEventsQueue, {
        batchSize: 5,
        enabled: true,
        maxBatchingWindow: cdk.Duration.minutes(1),
      })
    );
  }
}
