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
): Promise<{ campaigns: KlaviyoCampaign[] }> {
  const res = await fetch(
    apiUrl(`/api/klaviyo/campaigns?limit=${encodeURIComponent(String(limit))}`),
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
