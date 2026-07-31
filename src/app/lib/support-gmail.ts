import { apiUrl } from "./api-base";

export type SupportGmailStatus = {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  clientId?: string | null;
  redirectUri?: string | null;
  canSend?: boolean;
  autoReplyEnabled?: boolean;
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

export function supportGmailConnectUrl(opts?: { switchAccount?: boolean }): string {
  const q = opts?.switchAccount ? "?switch=1" : "";
  return apiUrl(`/api/support/gmail/connect${q}`);
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

export type SupportThreadMessage = {
  id?: string;
  from: string;
  to: string;
  replyTo?: string;
  messageIdHeader?: string;
  subject: string;
  date: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  unread: boolean;
};

export type SupportThreadDetail = {
  id: string;
  subject: string;
  messages: SupportThreadMessage[];
  gmailUrl: string;
  email?: string | null;
};

export async function fetchSupportThread(
  threadId: string,
): Promise<SupportThreadDetail> {
  const res = await fetch(
    apiUrl(`/api/support/gmail/threads/${encodeURIComponent(threadId)}`),
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Thread failed (${res.status})`);
  }
  return (await res.json()) as SupportThreadDetail;
}

export type SupportAutoReplyRunResult = {
  ok: boolean;
  reason?: string;
  processed: number;
  sent: number;
  results?: Array<{
    threadId: string;
    sent: boolean;
    reason?: string;
    orderName?: string;
    stage?: string;
    customerEmail?: string;
  }>;
};

export async function runSupportAutoReplies(
  max = 20,
): Promise<SupportAutoReplyRunResult> {
  const res = await fetch(
    apiUrl(`/api/support/gmail/auto-reply/run?max=${max}`),
    { method: "POST" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Auto-reply failed (${res.status})`);
  }
  return (await res.json()) as SupportAutoReplyRunResult;
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
