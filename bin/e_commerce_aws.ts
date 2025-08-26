#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ProductsAppStack } from "../lib/productsApp-stack";
import { ECommerceApiStack } from "../lib/ecommerceApi-stack";
import { ProductsAppLayersStack } from "../lib/productsAppLayers-stack";
import { EventsDdbStack } from "../lib/eventsDdb-stack";

const app = new cdk.App();

const env: cdk.Environment = {
  account: "REMOVIDO",
  region: "REMOVIDO",
};

const tags = {
  cost: "ECommerce",
  team: "SiecolaCode",
};

const productsAppLayersStack = new ProductsAppLayersStack(
  app,
  "ProductsAppLayers",
  {
    tags,
    env,
  }
);

const eventsDdbStack = new EventsDdbStack(app, "EventsDdb", {
  tags,
  env,
});

const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  tags,
  env,
  eventsDdb: eventsDdbStack.table,
});

const eCommerceApiStack = new ECommerceApiStack(app, "ECommerceApiStack", {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  tags,
  env,
});

productsAppStack.addDependency(eventsDdbStack);
productsAppStack.addDependency(productsAppLayersStack);
eCommerceApiStack.addDependency(productsAppStack);
