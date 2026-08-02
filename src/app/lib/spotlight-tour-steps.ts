export type SpotlightStep = {
  /** Matches `[data-tour="…"]` in the DOM. */
  target: string;
  title: string;
  body: string;
  /** Navigate here before highlighting (optional). */
  route?: string;
};

/** First tour: Orders production board. */
export const ORDERS_SPOTLIGHT_TOUR: SpotlightStep[] = [
  {
    target: "nav-orders",
    title: "Orders",
    body: "This is your production board. Open it to move orders from blanks → sewing → ship.",
  },
  {
    target: "orders-stages",
    title: "Pipeline stages",
    body: "Tap a stage to filter the list. Counts update as work moves through the floor.",
    route: "/order-flow",
  },
  {
    target: "orders-tabs",
    title: "Production vs risk",
    body: "Production is day-to-day fulfillment. Risk review holds orders that need a second look before you ship.",
    route: "/order-flow",
  },
  {
    target: "orders-table",
    title: "Order list",
    body: "Select orders, open details, and advance stages from here. This is where most of the work happens.",
    route: "/order-flow",
  },
];
