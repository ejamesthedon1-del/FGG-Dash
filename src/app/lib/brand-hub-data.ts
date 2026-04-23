/**
 * Canonical Brand Hub catalog for Future Garment Group.
 * Add new rows here to ship new brands; operators can layer local overrides via `brand-hub-storage`.
 */

export type BrandStatus = "Active" | "Pilot" | "Paused" | "Planning";

export type BrandQuickLink = {
  label: string;
  /** App paths (e.g. /sops) or https URLs */
  href: string;
};

export interface BrandNotes {
  handling?: string;
  packaging?: string;
  inserts?: string;
  presentation?: string;
  shipping?: string;
}

export interface BrandAssetFile {
  name: string;
  description?: string;
  /** Optional URL when hosted; empty = note-only */
  url?: string;
}

export interface BrandAssets {
  logoNote?: string;
  files?: BrandAssetFile[];
  visualRefs?: string;
  templates?: string;
}

export interface BrandOperationsNotes {
  sopExceptions?: string;
  workflows?: string;
  productCautions?: string;
  launchNotes?: string;
}

export interface BrandProfile {
  /** URL-safe slug used in routes */
  id: string;
  name: string;
  shortDescription: string;
  status: BrandStatus;
  /** One-line operator takeaway on the overview grid */
  primaryNotes?: string;
  positioningAudience?: string;
  brandNotes?: BrandNotes;
  brandAssets?: BrandAssets;
  operationsNotes?: BrandOperationsNotes;
  quickLinks?: BrandQuickLink[];
}

export const BRAND_CATALOG: BrandProfile[] = [
  {
    id: "sinners-testimony",
    name: "Sinners Testimony",
    shortDescription:
      "Street-rooted apparel with a bold voice — operators should match tone, packaging, and care level to the brand story.",
    status: "Active",
    primaryNotes:
      "Verify thank-you card and insert version before ship; packaging uses brand-specific stickers when stock allows.",
    positioningAudience:
      "Audience skews younger, values authenticity and message-driven drops. Treat customer comms as brand-forward, not generic retail.",
    brandNotes: {
      handling: "Fold and pack to minimize creasing on graphic-heavy tees; double-check size runs against launch sheet.",
      packaging: "Default poly + branded sticker; peak season may use alternate mailer — watch launch notes.",
      inserts: "Standard insert is the testimony card (vCurrent in asset list). Do not swap with other brands’ cards.",
      presentation: "Flat-lay references live in Brand Assets; keep hangtags facing forward in bin photos for B2B.",
      shipping: "Same carrier stack as group default unless a drop specifies expedited — see Operations for exceptions.",
    },
    brandAssets: {
      logoNote: "Primary lockup: horizontal wordmark on light backgrounds; stacked mark for square avatars.",
      files: [
        { name: "Logo usage (reference)", description: "Replace with final drive link when marketing publishes." },
        { name: "Packaging flat-lays", description: "Visual reference for pack-out consistency." },
      ],
      visualRefs: "Use approved mood boards only; do not pull customer IG into internal docs without permission.",
      templates: "Email macros live in support tooling — tag threads with brand for reporting.",
    },
    operationsNotes: {
      sopExceptions: "Returns window may differ during collab launches — check launch block below before quoting policy.",
      workflows: "New colorways require a quick SKU sanity check against the master grid before pick.",
      productCautions: "Certain dyes are hand-finished; flag QC tickets as “hand variance” instead of defect when within tolerance.",
      launchNotes: "No active limited drop — standard operating applies.",
    },
    quickLinks: [
      { label: "SOP hub (group procedures)", href: "/sops" },
      { label: "Brand Notes area in SOPs", href: "/sops" },
    ],
  },
  {
    id: "live-don",
    name: "Liv Don",
    shortDescription:
      "Performance-meets-lifestyle line with tighter drop cadence — prioritize speed, accuracy, and premium unboxing.",
    status: "Active",
    positioningAudience:
      "Fans of artist-led drops and limited runs; expect higher touch on social and post-purchase comms.",
    brandNotes: {
      handling: "Use gloves for light-colored pieces when configured in warehouse settings for this SKU class.",
      packaging: "Rigid mailer for outerwear over $X threshold — threshold posted in weekly ops brief.",
      inserts: "Thank-you card variant B for international; domestic uses variant A.",
      presentation: "Lookbook PDF is the source of truth for on-model color naming vs. product titles.",
      shipping: "Signature may be required for high-value bundles — carrier rules in checkout metadata.",
    },
    brandAssets: {
      logoNote: "Don script + LIV lockup; do not stretch or recolor outside approved palette.",
      files: [
        { name: "Lookbook / color naming", description: "Link when available from creative." },
        { name: "Pack-out diagram", description: "Tissue + ribbon steps for premium tier." },
      ],
      visualRefs: "Reference only from the shared drive — avoid screenshots from unreleased shoots.",
      templates: "Social response snippets tagged “LD” in the support macro library.",
    },
    operationsNotes: {
      sopExceptions: "Bundle splits: if one line item is delayed, follow partial ship SOP with LD customer messaging template.",
      workflows: "Pre-orders: do not merge pick waves until the “release to pick” flag is on the PO row.",
      productCautions: "Metallic prints — lower heat on any internal steam or touch-up steps.",
      launchNotes: "Watch for Friday drop traffic — staffing per escalation ladder in SOPs.",
    },
    quickLinks: [],
  },
];
