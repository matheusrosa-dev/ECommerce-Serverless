export enum OrderEventType {
  CREATED = "ORDER_CREATED",
  DELETED = "ORDER_DELETED",
}

export interface IEnvelope {
  eventType: OrderEventType;
  data: string;
}

export interface IOrderEvent {
  email: string;
  orderId: string;
  shipping: {
    type: string;
    carrier: string;
  };
  billing: {
    payment: string;
    totalPrice: number;
  };
  productCodes: string[];
  requestId: string;
}
