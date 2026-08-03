import { apiUrl } from "./api-base";

export type KlaviyoStatus = {
  configured: boolean;
  revision?: string;
};

export type KlaviyoAccount = {
  id?: string;
  name?: string | boolean | null;
  industry?: string | null;
  timezone?: string | null;
  preferredCurrency?: string | null;
  publicApiKey?: string | null;
  defaultSenderEmail?: string | null;
  websiteUrl?: string | null;
};

export type KlaviyoCampaign = {
  id: string;
  name?: string | null;
  status?: string | null;
  archived?: boolean;
  channel?: string;
  createdAt?: string | null;
  scheduledAt?: string | null;
  sendTime?: string | null;
  updatedAt?: string | null;
};

export type KlaviyoFlow = {
  id: string;
  name?: string | null;
  status?: string | null;
  archived?: boolean;
  triggerType?: string | null;
  created?: string | null;
  updated?: string | null;
};

export type KlaviyoList = {
  id: string;
  name?: string | null;
  created?: string | null;
  updated?: string | null;
  profileCount?: number | null;
};

export type KlaviyoSegment = {
  id: string;
  name?: string | null;
  created?: string | null;
  updated?: string | null;
  isActive?: boolean | null;
  isProcessing?: boolean | null;
};

export type KlaviyoTemplate = {
  id: string;
  name?: string | null;
  editorType?: string | null;
  html?: string | null;
  text?: string | null;
  created?: string | null;
  updated?: string | null;
};

export type KlaviyoOverview = {
  configured: boolean;
  account: KlaviyoAccount | null;
  counts: {
    lists?: number;
    flows?: number;
    liveFlows?: number;
    recentCampaigns?: number;
    draftOrScheduledCampaigns?: number;
  };
  recentCampaigns?: KlaviyoCampaign[];
  flows?: KlaviyoFlow[];
  lists?: KlaviyoList[];
};

export type ScheduleEmailCampaignInput = {
  name: string;
  templateId: string;
  listId?: string;
  segmentId?: string;
  subject: string;
  previewText?: string;
  sendAt: string;
  fromEmail?: string;
  fromLabel?: string;
  replyToEmail?: string;
};

export type CreateSimpleFlowInput = {
  preset: "welcome" | "abandoned_cart" | "post_purchase";
  name?: string;
  templateId: string;
  subject: string;
  previewText?: string;
  listId?: string;
  delayHours?: number;
  fromEmail?: string;
  fromLabel?: string;
};

export type SendSmsCampaignInput = {
  name: string;
  body: string;
  listId?: string;
  segmentId?: string;
  sendNow?: boolean;
  sendAt?: string;
  confirm?: boolean;
  shortenLinks?: boolean;
  addOrgPrefix?: boolean;
  addOptOutLanguage?: boolean;
};

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
    detail?: string;
  };
  if (!res.ok) {
    const detail =
      typeof data.detail === "string" ? data.detail : `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data;
}

export async function fetchKlaviyoStatus(): Promise<KlaviyoStatus> {
  const res = await fetch(apiUrl("/api/klaviyo/status"));
  return readJson(res);
}

export async function fetchKlaviyoOverview(): Promise<KlaviyoOverview> {
  const res = await fetch(apiUrl("/api/klaviyo/overview"));
  return readJson(res);
}

export async function fetchKlaviyoCampaigns(
  limit = 25,
  channel: "email" | "sms" | "all" = "email",
): Promise<{ campaigns: KlaviyoCampaign[] }> {
  const res = await fetch(
    apiUrl(
      `/api/klaviyo/campaigns?limit=${encodeURIComponent(String(limit))}&channel=${encodeURIComponent(channel)}`,
    ),
  );
  return readJson(res);
}

export async function fetchKlaviyoFlows(
  limit = 50,
): Promise<{ flows: KlaviyoFlow[] }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/flows?limit=${encodeURIComponent(String(limit))}`),
  );
  return readJson(res);
}

export async function setKlaviyoFlowStatus(
  flowId: string,
  status: "live" | "manual" | "draft",
): Promise<{ ok: boolean; id: string; status: string }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/flows/${encodeURIComponent(flowId)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  return readJson(res);
}

export async function fetchKlaviyoLists(
  limit = 50,
): Promise<{ lists: KlaviyoList[] }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/lists?limit=${encodeURIComponent(String(limit))}`),
  );
  return readJson(res);
}

export async function fetchKlaviyoSegments(
  limit = 50,
): Promise<{ segments: KlaviyoSegment[] }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/segments?limit=${encodeURIComponent(String(limit))}`),
  );
  return readJson(res);
}

export async function fetchKlaviyoTemplates(
  limit = 50,
): Promise<{ templates: KlaviyoTemplate[] }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/templates?limit=${encodeURIComponent(String(limit))}`),
  );
  return readJson(res);
}

export async function fetchKlaviyoTemplate(
  templateId: string,
): Promise<{ template: KlaviyoTemplate }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/templates/${encodeURIComponent(templateId)}`),
  );
  return readJson(res);
}

export async function createKlaviyoTemplate(input: {
  name: string;
  html?: string;
  text?: string;
}): Promise<{ template: KlaviyoTemplate }> {
  const res = await fetch(apiUrl("/api/klaviyo/templates"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export async function updateKlaviyoTemplate(
  templateId: string,
  input: { name?: string; html?: string; text?: string },
): Promise<{ template: KlaviyoTemplate }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/templates/${encodeURIComponent(templateId)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return readJson(res);
}

export async function deleteKlaviyoTemplate(
  templateId: string,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/templates/${encodeURIComponent(templateId)}`),
    { method: "DELETE" },
  );
  return readJson(res);
}

export async function scheduleKlaviyoCampaign(
  input: ScheduleEmailCampaignInput,
): Promise<{
  ok: boolean;
  campaignId: string;
  messageId: string;
  sendAt: string;
}> {
  const res = await fetch(apiUrl("/api/klaviyo/campaigns/schedule"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export async function createKlaviyoSimpleFlow(
  input: CreateSimpleFlowInput,
): Promise<{ ok: boolean; flow: KlaviyoFlow; preset: string }> {
  const res = await fetch(apiUrl("/api/klaviyo/flows/simple"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export async function sendKlaviyoSmsCampaign(
  input: SendSmsCampaignInput,
): Promise<{
  ok: boolean;
  campaignId: string;
  channel: string;
  sendNow: boolean;
  sendAt: string | null;
}> {
  const res = await fetch(apiUrl("/api/klaviyo/campaigns/sms"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(res);
}
