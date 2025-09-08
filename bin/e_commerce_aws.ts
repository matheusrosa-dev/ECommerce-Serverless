#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ProductsAppStack } from "../lib/productsApp-stack";
import { ECommerceApiStack } from "../lib/ecommerceApi-stack";
import { ProductsAppLayersStack } from "../lib/productsAppLayers-stack";
import { EventsDdbStack } from "../lib/eventsDdb-stack";
import { OrdersAppStack } from "../lib/ordersApp-stack";
import { OrdersAppLayersStack } from "../lib/ordersAppLayers-stack";
import "dotenv/config";

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_ACCOUNT,
  region: process.env.CDK_REGION,
};

const tags = {
  cost: "ECommerce",
  team: "Matheus",
};

const eventsDdbStack = new EventsDdbStack(app, "EventsDdb", {
  tags,
  env,
});

const productsAppLayersStack = new ProductsAppLayersStack(
  app,
  "ProductsAppLayers",
  {
    tags,
    env,
  }
);

const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  tags,
  env,
  eventsDdb: eventsDdbStack.table,
});
productsAppStack.addDependency(eventsDdbStack);
productsAppStack.addDependency(productsAppLayersStack);

const ordersAppLayersStack = new OrdersAppLayersStack(app, "OrdersAppLayers", {
  tags,
  env,
});

const ordersAppStack = new OrdersAppStack(app, "OrdersApp", {
  tags,
  env,
  productsDdb: productsAppStack.productsDdb,
  eventsDdb: eventsDdbStack.table,
});
ordersAppStack.addDependency(productsAppStack);
ordersAppStack.addDependency(ordersAppLayersStack);
ordersAppStack.addDependency(eventsDdbStack);

const eCommerceApiStack = new ECommerceApiStack(app, "ECommerceApiStack", {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  ordersHandler: ordersAppStack.ordersHandler,
  orderEventsFetchHandler: ordersAppStack.orderEventsFetchHandler,
  tags,
  env,
});

eCommerceApiStack.addDependency(productsAppStack);
eCommerceApiStack.addDependency(ordersAppStack);
