import { apiUrl } from "./api-base";
import type { IgScheduleBrand } from "./instagram-schedule-storage";

export type IgConnectionStatus = {
  configured: boolean;
  connected: boolean;
  brand: string;
  username: string | null;
  igUserId: string | null;
  pageId: string | null;
  redirectUri?: string | null;
  error?: string | null;
};

export function instagramConnectUrl(
  brand: IgScheduleBrand,
  opts?: { switchAccount?: boolean },
): string {
  const q = new URLSearchParams({ brand });
  if (opts?.switchAccount) q.set("switch", "1");
  return apiUrl(`/api/instagram/connect?${q}`);
}

export async function fetchInstagramStatus(
  brand: IgScheduleBrand,
): Promise<IgConnectionStatus> {
  const res = await fetch(
    apiUrl(`/api/instagram/status?brand=${encodeURIComponent(brand)}`),
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Could not load Instagram status");
  }
  return (await res.json()) as IgConnectionStatus;
}

export async function disconnectInstagram(
  brand: IgScheduleBrand,
): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/instagram/disconnect?brand=${encodeURIComponent(brand)}`),
    { method: "POST" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Could not disconnect Instagram");
  }
}

export type IgPublishPayload = {
  brand: IgScheduleBrand;
  caption: string;
  imageUrl: string;
  kind?: "feed" | "story";
};

export type IgPublishResult = {
  ok: boolean;
  mediaId?: string;
  error?: string;
};

export async function publishInstagramPost(
  payload: IgPublishPayload,
): Promise<IgPublishResult> {
  const res = await fetch(apiUrl("/api/instagram/publish"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as IgPublishResult & {
    detail?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error:
        data.error ||
        data.detail ||
        (typeof data.detail === "string" ? data.detail : null) ||
        `Publish failed (${res.status})`,
    };
  }
  return data;
}
