/**
 * Training Center — canonical module catalog for Future Garment Group.
 * Add modules here to ship new content; optional `training-center-storage` overrides merge at runtime.
 */

export const TRAINING_MODULE_CATEGORIES = [
  "Company Basics",
  "Dashboard Training",
  "SOP Training",
  "Fulfillment Training",
  "Customer Support Training",
  "Store Operations Training",
  "Brand Training",
  "Escalation Training",
] as const;

export type TrainingModuleCategory = (typeof TRAINING_MODULE_CATEGORIES)[number];

/** Editorial / rollout state for the module itself */
export type TrainingModulePublishStatus = "Draft" | "Published" | "Needs Refresh";

export type TrainingModulePriority = "High" | "Medium" | "Low";

export type TrainingProgressStatus = "not_started" | "in_progress" | "completed";

export type TrainingLink = {
  label: string;
  href: string;
  external?: boolean;
};

export interface TrainingModule {
  id: string;
  title: string;
  category: TrainingModuleCategory;
  shortDescription: string;
  status: TrainingModulePublishStatus;
  priority: TrainingModulePriority;
  /** Rough ETA in minutes for planning */
  estimatedMinutes: number;
  learningObjective: string;
  /** Main written training body (plain text; safe for employees) */
  content: string;
  linkedSops: TrainingLink[];
  linkedResources: TrainingLink[];
  notesTakeaways?: string;
}

/** Suggested order for new hires — ids must exist in `TRAINING_MODULE_CATALOG`. */
export const RECOMMENDED_LEARNING_PATH: string[] = [
  "welcome-start-here",
  "dashboard-basics",
  "daily-tasks-sop-orientation",
  "sop-hub-navigation",
  "brand-hub-essentials",
  "role-specific-next-steps",
];

export const TRAINING_MODULE_CATALOG: TrainingModule[] = [
  {
    id: "welcome-start-here",
    title: "Start Here — Welcome to FGG",
    category: "Company Basics",
    shortDescription: "Orientation: what this dashboard is for, how to use it, and what to complete first.",
    status: "Published",
    priority: "High",
    estimatedMinutes: 20,
    learningObjective:
      "You will know where to begin as a new hire, how sections of the knowledge base fit together, and the required reading order.",
    content: `Welcome to the Future Garment Group internal operating system. This dashboard pulls together training systems, standard procedures (SOPs), brand context, and your mission — so you are not hunting across tools on day one.

How to use the dashboard:
• Use the left sidebar to jump between All Systems (department training tracks), SOPs (how work gets done), Brand Hub (line-specific rules), Training Center (you are here), and Our Mission.
• Prefer the Training Center “Recommended path” below as your default sequence unless your manager assigns a different track.
• When in doubt, SOPs are the source of truth for process; Brand Hub adds nuance by brand; Training Center explains how to navigate both.

First steps for new hires:
1. Complete this module and mark it complete when you have read it.
2. Finish “Dashboard basics” next.
3. Follow the recommended path through SOP orientation and Brand Hub essentials before role-specific modules.

Required training order is suggested in the Recommended Learning Path on the Training Center home page — your lead may add role-specific modules after that baseline.`,
    linkedSops: [{ label: "Open SOP hub", href: "/sops" }],
    linkedResources: [{ label: "Brand Hub", href: "/brand-hub" }],
    notesTakeaways: "Bookmark SOPs and Brand Hub — you will live in them daily.",
  },
  {
    id: "dashboard-basics",
    title: "Learn Dashboard Basics",
    category: "Dashboard Training",
    shortDescription: "Navigation, where content lives, and how training vs SOPs vs systems relate.",
    status: "Published",
    priority: "High",
    estimatedMinutes: 15,
    learningObjective: "Navigate the app confidently and know which area to open for a given question.",
    content: `All Systems lists structured training “systems” your team may curate by department. They often contain videos, links, and documents.

SOPs hold procedural truth: fulfillment steps, support macros, returns rules, and escalations. Use search and the area → section drill-down to find the right document.

Brand Hub describes how each customer-facing brand should be handled — packaging, inserts, tone, and operational exceptions.

Training Center (this section) is your map: ordered learning, module metadata, and simple progress so you and your manager can see what is done.`,
    linkedSops: [{ label: "SOP hub", href: "/sops" }],
    linkedResources: [
      { label: "All Systems (home)", href: "/" },
      { label: "Brand Hub", href: "/brand-hub" },
    ],
    notesTakeaways: "If you are looking for “how do I do X?”, start with SOPs; if “how is brand Y different?”, use Brand Hub.",
  },
  {
    id: "daily-tasks-sop-orientation",
    title: "Review Daily Tasks (SOP orientation)",
    category: "SOP Training",
    shortDescription: "Connect recurring shift work to the SOP library — especially Daily Tasks and Start Here areas.",
    status: "Published",
    priority: "High",
    estimatedMinutes: 25,
    learningObjective: "Locate daily checklists and understand how SOP status and tags guide what to read first.",
    content: `In the SOP hub, open Start Here for expectations, then Daily Tasks for shift rhythm. Procedures may be Active, Draft, or Needs Update — prioritize Active for live operations; Needs Update means leadership is aware content is stale.

Use hub search when you know a keyword but not the exact section. Tags like “weekend” or “returns” help scanning.

Your manager may point you to specific sections (e.g. Fulfillment → Pick & pack). Complete those reads after you understand navigation.`,
    linkedSops: [
      { label: "SOP hub — start in Start Here & Daily Tasks", href: "/sops" },
    ],
    linkedResources: [],
    notesTakeaways: "Draft SOPs are not for customer-facing promises until promoted to Active.",
  },
  {
    id: "sop-hub-navigation",
    title: "Study SOP Categories",
    category: "SOP Training",
    shortDescription: "Deeper tour of operational areas: fulfillment, support, returns, inventory, fraud, escalations.",
    status: "Published",
    priority: "Medium",
    estimatedMinutes: 35,
    learningObjective: "Pick the right operational area for a scenario and know when to escalate.",
    content: `Walk each top-level area once at a skimming level, then deep-read the sections that match your role.

Fulfillment and Inventory matter for warehouse and receiving. Customer Support and Returns & Refunds matter for CX. Fraud & Risk Review and Escalations matter for everyone when signals fire.

When you open a section, use filters and status badges to focus on Active procedures first.`,
    linkedSops: [{ label: "SOP hub", href: "/sops" }],
    linkedResources: [],
  },
  {
    id: "fulfillment-101",
    title: "Fulfillment Training — Foundations",
    category: "Fulfillment Training",
    shortDescription: "Pick, pack, shipping labels, and quality habits before you touch live volume.",
    status: "Published",
    priority: "High",
    estimatedMinutes: 45,
    learningObjective: "Align day-one warehouse behavior with group SOPs and brand-specific pack notes.",
    content: `Pair this module with the Fulfillment and Inventory areas inside SOPs. Pay attention to any brand-specific packaging notes in Brand Hub for lines you will ship.

If a pick sheet conflicts with an SOP, stop and escalate — never guess on address or SKU substitutions.`,
    linkedSops: [{ label: "SOP hub — Fulfillment", href: "/sops" }],
    linkedResources: [{ label: "Brand Hub (packaging context)", href: "/brand-hub" }],
  },
  {
    id: "customer-support-101",
    title: "Customer Support Training — Foundations",
    category: "Customer Support Training",
    shortDescription: "Tone, templates, tickets, and when to hand off — grounded in SOPs.",
    status: "Published",
    priority: "High",
    estimatedMinutes: 40,
    learningObjective: "Handle inbound requests consistently and route edge cases correctly.",
    content: `Read Customer Support and Escalations sections in SOPs. Brand Hub informs voice and exceptions for each line.

Document what you promised in the ticket thread; the next shift should be able to continue without context loss.`,
    linkedSops: [{ label: "SOP hub", href: "/sops" }],
    linkedResources: [{ label: "Brand Hub", href: "/brand-hub" }],
  },
  {
    id: "store-ops-101",
    title: "Store Operations Training",
    category: "Store Operations Training",
    shortDescription: "Admin, listings, and promos — aligned with Store Operations SOPs.",
    status: "Published",
    priority: "Medium",
    estimatedMinutes: 30,
    learningObjective: "Know where storefront procedures live and when to loop merchandising or leadership.",
    content: `Use the Store Operations area in the SOP hub for day-to-day ecommerce operations. Cross-check launches with Brand Hub notes when a drop is brand-specific.`,
    linkedSops: [{ label: "SOP hub", href: "/sops" }],
    linkedResources: [],
  },
  {
    id: "brand-hub-essentials",
    title: "Review Brand Notes",
    category: "Brand Training",
    shortDescription: "Why Brand Hub exists and how to use it beside SOPs.",
    status: "Published",
    priority: "High",
    estimatedMinutes: 25,
    learningObjective: "Explain how two brands differ operationally and where to find their asset and handling notes.",
    content: `Open Brand Hub and read each brand profile you will touch. Compare packaging, inserts, and operations notes.

SOPs remain default process; Brand Hub documents intentional deviations and creative constraints.`,
    linkedSops: [{ label: "SOP hub — Brand Notes area", href: "/sops" }],
    linkedResources: [{ label: "Brand Hub", href: "/brand-hub" }],
    notesTakeaways: "Never assume two brands pack the same way.",
  },
  {
    id: "escalation-101",
    title: "Escalation Training",
    category: "Escalation Training",
    shortDescription: "Tiering, when to pause, and how to document for the next owner.",
    status: "Published",
    priority: "High",
    estimatedMinutes: 20,
    learningObjective: "Recognize escalation-worthy events and follow the ladder in SOPs.",
    content: `Read Escalations and Fraud & Risk Review in the SOP hub. Escalate early on safety, legal, or revenue-at-risk issues rather than improvising.

Include timestamps, order IDs, and customer-visible promises when you escalate.`,
    linkedSops: [{ label: "SOP hub", href: "/sops" }],
    linkedResources: [],
  },
  {
    id: "role-specific-next-steps",
    title: "Complete Role-Specific Training",
    category: "Company Basics",
    shortDescription: "Placeholder for tracks your manager assigns — link to All Systems or custom modules later.",
    status: "Published",
    priority: "Medium",
    estimatedMinutes: 60,
    learningObjective: "Finish department-specific systems your lead assigns and confirm completion here.",
    content: `After the baseline path, your manager may assign training systems under All Systems or additional modules as they are published.

Mark this module In progress while you are finishing assigned items, then Completed when your lead signs off (informally for now — full approvals can be layered on later).`,
    linkedSops: [{ label: "SOP hub (ongoing reference)", href: "/sops" }],
    linkedResources: [{ label: "All Systems", href: "/" }],
    notesTakeaways: "Progress in this app is per-device for now — still useful for self-tracking and 1:1s.",
  },
];
