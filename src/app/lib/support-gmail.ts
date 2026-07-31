import { apiUrl } from "./api-base";

export type SupportGmailStatus = {
  configured: boolean;
  connected: boolean;
  email?: string | null;
};

export type SupportThread = {
  id: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
  messageCount: number;
  gmailUrl: string;
};

export type SupportThreadsResponse = {
  connected: boolean;
  email?: string | null;
  threads: SupportThread[];
};

export function supportGmailConnectUrl(): string {
  return apiUrl("/api/support/gmail/connect");
}

export async function fetchSupportGmailStatus(): Promise<SupportGmailStatus> {
  const res = await fetch(apiUrl("/api/support/gmail/status"));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Status failed (${res.status})`);
  }
  return (await res.json()) as SupportGmailStatus;
}

export async function fetchSupportThreads(
  max = 30,
): Promise<SupportThreadsResponse> {
  const res = await fetch(apiUrl(`/api/support/gmail/threads?max=${max}`));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Threads failed (${res.status})`);
  }
  return (await res.json()) as SupportThreadsResponse;
}

export async function disconnectSupportGmail(): Promise<void> {
  const res = await fetch(apiUrl("/api/support/gmail/disconnect"), {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Disconnect failed (${res.status})`);
  }
}
