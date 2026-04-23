/** Future Garment Group — top-level SOP areas and default sections (subcategories). */

import type { SOP } from "./storage";

export interface SOPMenuItemDef {
  id: string;
  title: string;
}

export interface SOPCategoryDef {
  id: string;
  title: string;
  items: SOPMenuItemDef[];
}

/** Canonical library shape — seeded into local nav storage for new installs / migrations. */
export const SOP_NAV_STRUCTURE: SOPCategoryDef[] = [
  {
    id: "start-here",
    title: "Start Here",
    items: [
      { id: "welcome-how-to-use", title: "Welcome & how to use this library" },
      { id: "key-contacts-links", title: "Key contacts & important links" },
    ],
  },
  {
    id: "daily-tasks",
    title: "Daily Tasks",
    items: [
      { id: "shift-open-close", title: "Shift open / close checklist" },
      { id: "daily-operator-checklist", title: "Daily operator checklist" },
    ],
  },
  {
    id: "fulfillment",
    title: "Fulfillment",
    items: [
      { id: "pick-pack", title: "Pick & pack" },
      { id: "shipping-labels", title: "Shipping & labels" },
    ],
  },
  {
    id: "customer-support",
    title: "Customer Support",
    items: [
      { id: "inbound-requests", title: "Inbound requests (email / tickets)" },
      { id: "templates-tone", title: "Response templates & tone" },
    ],
  },
  {
    id: "returns-refunds",
    title: "Returns & Refunds",
    items: [
      { id: "return-intake", title: "Return intake & RMA" },
      { id: "refund-processing", title: "Refund processing" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    items: [
      { id: "receiving-stock", title: "Receiving & putaway" },
      { id: "counts-adjustments", title: "Counts & adjustments" },
    ],
  },
  {
    id: "store-operations",
    title: "Store Operations",
    items: [
      { id: "store-admin-basics", title: "Store admin & listings" },
      { id: "promos-merch", title: "Promotions & merchandising" },
    ],
  },
  {
    id: "fraud-risk-review",
    title: "Fraud & Risk Review",
    items: [
      { id: "review-queue", title: "Order review queue" },
      { id: "chargebacks-disputes", title: "Chargebacks & disputes" },
    ],
  },
  {
    id: "escalations",
    title: "Escalations",
    items: [
      { id: "tier-two-path", title: "Tier 2 escalation path" },
      { id: "leadership-escalation", title: "Leadership escalation" },
    ],
  },
  {
    id: "brand-notes",
    title: "Brand Notes",
    items: [
      { id: "brand-voice", title: "Brand voice & positioning" },
      { id: "campaign-notes", title: "Campaign & launch notes" },
    ],
  },
];

export const SOP_LEGACY_CATEGORY_ID = "start-here";
export const SOP_LEGACY_MENU_ITEM_ID = "welcome-how-to-use";

/** Short context for operators browsing the hub (shown on category cards). */
export const SOP_CATEGORY_BLURBS: Record<string, string> = {
  "start-here": "Orientation, expectations, and where to go first.",
  "daily-tasks": "Recurring work every shift should cover.",
  fulfillment: "Warehouse flow from order to outbound.",
  "customer-support": "How we talk to customers and resolve issues.",
  "returns-refunds": "Returns intake, approvals, and money back.",
  inventory: "Stock accuracy, receiving, and adjustments.",
  "store-operations": "Shopify and storefront day-to-day operations.",
  "fraud-risk-review": "Protecting revenue and reviewing risky orders.",
  escalations: "When to hand off and who owns the next step.",
  "brand-notes": "Creative and brand standards for customer-facing work.",
};

/** Remap old nav category IDs (pre–FGG library) into the new tree so existing SOPs stay findable. */
export const SOP_LEGACY_CATEGORY_ROUTE: Record<string, { categoryId: string; menuItemId: string }> = {
  "order-fulfilment": { categoryId: "fulfillment", menuItemId: "pick-pack" },
  "customer-service": { categoryId: "customer-support", menuItemId: "inbound-requests" },
  "shopify-store-operations": { categoryId: "store-operations", menuItemId: "store-admin-basics" },
  production: { categoryId: "daily-tasks", menuItemId: "shift-open-close" },
  "marketing-operations": { categoryId: "brand-notes", menuItemId: "brand-voice" },
  /** Older single bucket before Returns & Refunds was split out */
  returns: { categoryId: "returns-refunds", menuItemId: "return-intake" },
};

export function getCategoryBlurb(categoryId: string): string {
  return SOP_CATEGORY_BLURBS[categoryId] ?? "";
}

export function menuAccordionValue(categoryId: string, menuItemId: string): string {
  return `${categoryId}__${menuItemId}`;
}

export function getCategoryTitle(categoryId: string): string {
  return SOP_NAV_STRUCTURE.find((c) => c.id === categoryId)?.title ?? categoryId;
}

export function getMenuItemTitle(categoryId: string, menuItemId: string): string {
  const cat = SOP_NAV_STRUCTURE.find((c) => c.id === categoryId);
  return cat?.items.find((i) => i.id === menuItemId)?.title ?? menuItemId;
}

/** Older saved SOPs without placement map under Start Here. */
export function withSopPlacement(sop: SOP): SOP & { categoryId: string; menuItemId: string } {
  return {
    ...sop,
    categoryId: sop.categoryId ?? SOP_LEGACY_CATEGORY_ID,
    menuItemId: sop.menuItemId ?? SOP_LEGACY_MENU_ITEM_ID,
  };
}

/**
 * Resolve placement against the *live* nav structure (handles legacy category IDs
 * and orphaned menu item IDs after library updates).
 */
export function resolveSopNavPlacement(
  sop: SOP,
  structure: { id: string; items: { id: string }[] }[],
): { categoryId: string; menuItemId: string } {
  const base = withSopPlacement(sop);
  let { categoryId, menuItemId } = base;

  const routed = SOP_LEGACY_CATEGORY_ROUTE[categoryId];
  if (routed) {
    categoryId = routed.categoryId;
    menuItemId = routed.menuItemId;
  }

  const cat = structure.find((c) => c.id === categoryId);
  if (!cat || cat.items.length === 0) {
    const fallback = structure[0];
    return {
      categoryId: fallback?.id ?? categoryId,
      menuItemId: fallback?.items[0]?.id ?? menuItemId,
    };
  }

  if (!cat.items.some((i) => i.id === menuItemId)) {
    return { categoryId, menuItemId: cat.items[0].id };
  }

  return { categoryId, menuItemId };
}
