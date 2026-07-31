import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  ExternalLink,
  LifeBuoy,
  Loader2,
  Mail,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import {
  disconnectSupportGmail,
  fetchSupportGmailStatus,
  fetchSupportThread,
  fetchSupportThreads,
  previewSupportAutoReply,
  sendSupportAutoReplyTestToSelf,
  supportGmailConnectUrl,
  type SupportAutoReplyResult,
  type SupportThread,
  type SupportThreadDetail,
} from "../lib/support-gmail";
import { cn } from "./ui/utils";

type InboxFilter = "all" | "unread";

function formatThreadDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

function htmlToReadableText(html: string): string {
  return html
    .replace(/\r\n/g, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function messageBody(text: string, html: string, snippet: string): string {
  const plain = (text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (plain) return plain;
  const fromHtml = html ? htmlToReadableText(html) : "";
  if (fromHtml) return fromHtml;
  return (snippet || "").trim();
}

function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      name: (match[1] || "").replace(/^"|"$/g, "").trim() || match[2],
      email: match[2].trim(),
    };
  }
  if (from.includes("@")) return { name: from.split("@")[0] || from, email: from };
  return { name: from || "Unknown", email: "" };
}

/** Shopify contact-form notification emails — not customizable in Shopify admin. */
type ShopifyContactSubmission = {
  name: string;
  email: string;
  phone: string;
  message: string;
  extras: { label: string; value: string }[];
};

const SHOPIFY_CONTACT_LABELS = new Set([
  "name",
  "email",
  "phone",
  "body",
  "message",
  "subject",
  "country code",
  "id",
  "order number",
  "order #",
]);

function normalizeContactLabel(line: string): string {
  return line.replace(/:$/, "").trim().toLowerCase();
}

function parseShopifyContactForm(text: string): ShopifyContactSubmission | null {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return null;

  const looksLikeShopify =
    /online store'?s? contact form/i.test(raw) ||
    (/^name:?$/im.test(raw) && /^email:?$/im.test(raw) && /^(body|message):?$/im.test(raw));
  if (!looksLikeShopify) return null;

  const lines = raw.split("\n");
  const fields = new Map<string, string>();
  let i = 0;
  while (i < lines.length) {
    const label = normalizeContactLabel(lines[i] || "");
    if (!SHOPIFY_CONTACT_LABELS.has(label)) {
      i += 1;
      continue;
    }
    i += 1;
    const valueLines: string[] = [];
    while (i < lines.length) {
      const next = (lines[i] || "").trim();
      if (SHOPIFY_CONTACT_LABELS.has(normalizeContactLabel(next)) && next !== "") break;
      if (next || valueLines.length) valueLines.push(lines[i] ?? "");
      i += 1;
    }
    const value = valueLines.join("\n").trim();
    if (value) fields.set(label, value);
  }

  const name = fields.get("name") || "";
  const email = fields.get("email") || "";
  const phone = fields.get("phone") || "";
  const message = fields.get("body") || fields.get("message") || "";
  if (!name && !email && !message) return null;

  const skip = new Set(["name", "email", "phone", "body", "message"]);
  const extras: { label: string; value: string }[] = [];
  for (const [label, value] of fields) {
    if (skip.has(label) || label === "id") continue;
    extras.push({
      label: label.replace(/\b\w/g, (c) => c.toUpperCase()),
      value,
    });
  }

  return { name, email, phone, message, extras };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function ShopifyContactBody({ data }: { data: ShopifyContactSubmission }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Store contact form
      </p>
      {data.message ? (
        <p className="whitespace-pre-wrap text-pretty text-[15px] leading-relaxed text-foreground">
          {data.message}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">(No message)</p>
      )}
      <dl className="grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
        {data.name ? (
          <div>
            <dt className="text-[11px] text-muted-foreground">Name</dt>
            <dd className="font-medium text-foreground">{data.name}</dd>
          </div>
        ) : null}
        {data.email ? (
          <div>
            <dt className="text-[11px] text-muted-foreground">Email</dt>
            <dd className="break-all font-medium text-foreground">{data.email}</dd>
          </div>
        ) : null}
        {data.phone ? (
          <div>
            <dt className="text-[11px] text-muted-foreground">Phone</dt>
            <dd className="font-medium text-foreground">{data.phone}</dd>
          </div>
        ) : null}
        {data.extras.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
            <dd className="font-medium text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SupportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [autoReplyLive, setAutoReplyLive] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [preview, setPreview] = useState<SupportAutoReplyResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const status = await fetchSupportGmailStatus();
      setConfigured(status.configured);
      setConnected(status.connected);
      setCanSend(Boolean(status.canSend));
      setAutoReplyLive(Boolean(status.autoReplyLive));
      setEmail(status.email ?? null);
      setClientId(status.clientId ?? null);
      setRedirectUri(status.redirectUri ?? null);
      if (status.connected) {
        const data = await fetchSupportThreads(30);
        setThreads(data.threads || []);
        setEmail(data.email ?? status.email ?? null);
      } else {
        setThreads([]);
        setSelectedId(null);
        setDetail(null);
        setPreview(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load Support";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const flag = searchParams.get("gmail");
    if (!flag) return;
    if (flag === "connected") {
      toast.success("Gmail connected");
      void load({ soft: true });
    } else if (flag === "error") {
      toast.error(
        `Gmail connect failed${
          searchParams.get("reason") ? `: ${searchParams.get("reason")}` : ""
        }`,
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete("gmail");
    next.delete("reason");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, load]);

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "unread" && !t.unread) return false;
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        t.from.toLowerCase().includes(q) ||
        t.snippet.toLowerCase().includes(q)
      );
    });
  }, [threads, query, filter]);

  const openThread = async (threadId: string) => {
    setSelectedId(threadId);
    setDetail(null);
    setPreview(null);
    setDetailLoading(true);
    try {
      const data = await fetchSupportThread(threadId);
      setDetail(data);
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t)),
      );
      try {
        const draft = await previewSupportAutoReply(threadId);
        setPreview(draft);
      } catch {
        setPreview(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open thread");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const onPreview = async () => {
    if (!selectedId) return;
    setPreviewLoading(true);
    try {
      const draft = await previewSupportAutoReply(selectedId);
      setPreview(draft);
      if (draft.reason === "dry_run") {
        toast.success("Draft ready — nothing sent to the customer");
      } else if (draft.reason === "not_status_inquiry") {
        toast.message("Not treated as an order-status ask");
      } else {
        toast.message(draft.reason || "Preview done");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const onSendTestToSelf = async () => {
    if (!selectedId) return;
    if (!canSend) {
      toast.error("Reconnect Gmail with Send permission first");
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await sendSupportAutoReplyTestToSelf(selectedId);
      if (result.sent) {
        toast.success(`Test email sent to ${email || "your Support inbox"}`);
        setPreview(result);
      } else {
        toast.error(result.detail || result.reason || "Test send failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const onDisconnect = async () => {
    try {
      await disconnectSupportGmail();
      setConnected(false);
      setCanSend(false);
      setEmail(null);
      setThreads([]);
      setSelectedId(null);
      setDetail(null);
      toast.message("Gmail disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    }
  };

  const selectedListItem = threads.find((t) => t.id === selectedId) ?? null;
  const latestMessage = detail?.messages?.[detail.messages.length - 1];
  const latestBody = latestMessage
    ? messageBody(
        latestMessage.bodyText,
        latestMessage.bodyHtml,
        latestMessage.snippet,
      )
    : "";
  const shopifyContact = latestBody
    ? parseShopifyContactForm(latestBody)
    : null;
  const mailer = parseFrom(
    latestMessage?.from || selectedListItem?.from || "",
  );
  const contact = shopifyContact
    ? {
        name: shopifyContact.name || mailer.name,
        email: shopifyContact.email || mailer.email,
      }
    : mailer;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gray-950">
            <LifeBuoy className="size-6 text-muted-foreground" />
            Support
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer emails from your connected Gmail inbox.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={refreshing}
                onClick={() => void load({ soft: true })}
              >
                {refreshing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onDisconnect()}
              >
                Disconnect
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : null}

      {!loading && connected && !canSend ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="text-sm">
              <p className="font-medium text-foreground">
                Reconnect Gmail to enable auto-replies
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Disconnect, then connect again and approve{" "}
                <span className="font-medium text-foreground">Send email</span>{" "}
                for order status updates.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onDisconnect()}
              >
                Disconnect
              </Button>
              <Button type="button" size="sm" asChild>
                <a href={supportGmailConnectUrl({ switchAccount: true })}>
                  Reconnect
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && connected ? (
        <p className="text-xs text-muted-foreground">
          {autoReplyLive
            ? "Live auto-replies are ON — status asks can email customers."
            : "Test mode: nothing is emailed to customers. Open a thread to preview the draft, or send a test to your Support inbox."}
        </p>
      ) : null}

      {!loading && !configured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gmail not configured</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Set <code className="text-xs">GMAIL_CLIENT_ID</code> and{" "}
            <code className="text-xs">GMAIL_CLIENT_SECRET</code> on the backend,
            enable Gmail API, then restart the API.
          </CardContent>
        </Card>
      ) : null}

      {!loading && configured && !connected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect Gmail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect{" "}
              <span className="font-medium text-foreground">
                orders@futuregarmentgroup.com
              </span>
              . On Google’s screen choose that account or{" "}
              <span className="font-medium text-foreground">Use another account</span>
              .
            </p>
            {redirectUri ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  If you see redirect_uri_mismatch
                </p>
                <p className="mt-1">
                  Add this redirect URI to the OAuth client ending in{" "}
                  <code className="text-[11px]">
                    {(clientId || "").slice(-28) || "…googleusercontent.com"}
                  </code>
                  :
                </p>
                <code className="mt-2 block break-all rounded bg-background px-2 py-1.5 text-[11px] text-foreground">
                  {redirectUri}
                </code>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="gap-1.5" asChild>
                <a href={supportGmailConnectUrl()}>
                  <Mail className="size-3.5" />
                  Connect Gmail
                </a>
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={supportGmailConnectUrl({ switchAccount: true })}>
                  Use a different Google account
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && connected ? (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background lg:grid-cols-[260px_minmax(0,1fr)_240px]">
          {/* Inbox list */}
          <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
            <div className="space-y-2 border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search inbox…"
                  className="pl-7"
                  aria-label="Search inbox"
                />
              </div>
              <Tabs
                value={filter}
                onValueChange={(v) => setFilter(v as InboxFilter)}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="all" className="flex-1">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="unread" className="flex-1">
                    Unread
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="truncate text-[11px] text-muted-foreground">
                {email} · {filteredThreads.length} shown
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {error ? (
                <p className="p-3 text-sm text-rose-700">{error}</p>
              ) : null}
              {filteredThreads.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No threads match.
                </p>
              ) : (
                <ul>
                  {filteredThreads.map((t) => {
                    const who = parseFrom(t.from);
                    const shopifyPreview = parseShopifyContactForm(t.snippet);
                    const listName = shopifyPreview?.name || who.name;
                    const listSnippet =
                      shopifyPreview?.message ||
                      shopifyPreview?.email ||
                      t.snippet;
                    const active = t.id === selectedId;
                    return (
                      <li key={t.id} className="border-b border-border">
                        <button
                          type="button"
                          onClick={() => void openThread(t.id)}
                          className={cn(
                            "flex w-full gap-2.5 px-3 py-3 text-left transition-colors hover:bg-muted/50",
                            active && "bg-muted",
                            t.unread && !active && "bg-brand-soft/30",
                          )}
                        >
                          <div
                            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                            aria-hidden
                          >
                            {initials(listName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={cn(
                                  "truncate text-sm",
                                  t.unread
                                    ? "font-semibold text-foreground"
                                    : "font-medium text-foreground",
                                )}
                              >
                                {listName}
                              </p>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {formatThreadDate(t.date)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-foreground/90">
                              {t.subject}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                              {listSnippet}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {t.unread ? (
                                <Badge variant="default" className="text-[10px]">
                                  New
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                  Read
                                </Badge>
                              )}
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <Mail className="size-2.5" />
                                Gmail
                              </Badge>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Thread */}
          <section className="flex min-h-[320px] min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
            {!selectedId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <Mail className="size-8 opacity-40" />
                <p>Select a conversation</p>
              </div>
            ) : (
              <>
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-base font-semibold text-pretty text-foreground">
                    {detail?.subject || selectedListItem?.subject || "Thread"}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {selectedListItem?.unread || detail?.messages.some((m) => m.unread) ? (
                      <Badge variant="default" className="text-[10px]">
                        New
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Read
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      #support
                    </Badge>
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {detailLoading ? (
                    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading thread…
                    </div>
                  ) : null}
                  {!detailLoading && detail
                    ? detail.messages.map((m) => {
                        const who = parseFrom(m.from);
                        const body = messageBody(m.bodyText, m.bodyHtml, m.snippet);
                        const shopify = parseShopifyContactForm(body);
                        const displayName = shopify?.name || who.name;
                        const displayEmail = shopify?.email || who.email || m.from;
                        return (
                          <article
                            key={m.id || `${m.from}-${m.date}`}
                            className="rounded-md border border-border p-4"
                          >
                            <div className="mb-3 flex items-start gap-2.5">
                              <div
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                                aria-hidden
                              >
                                {initials(displayName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <p className="text-sm font-medium text-foreground">
                                    {displayName}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {formatThreadDate(m.date)}
                                  </p>
                                </div>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {displayEmail}
                                  {shopify
                                    ? " · via Shopify contact form"
                                    : m.to
                                      ? ` · to ${m.to}`
                                      : ""}
                                </p>
                              </div>
                            </div>
                            <div className="text-[15px] leading-relaxed text-foreground">
                              {shopify ? (
                                <ShopifyContactBody data={shopify} />
                              ) : body ? (
                                <p className="whitespace-pre-wrap text-pretty">{body}</p>
                              ) : (
                                <p className="text-muted-foreground">(No message body)</p>
                              )}
                            </div>
                          </article>
                        );
                      })
                    : null}
                </div>
              </>
            )}
          </section>

          {/* Details */}
          <aside className="flex min-h-0 flex-col overflow-y-auto">
            {!selectedId ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Thread details appear here
              </div>
            ) : (
              <div className="space-y-4 p-4">
                <div className="flex flex-col items-center text-center">
                  <div
                    className="flex size-14 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
                    aria-hidden
                  >
                    {initials(contact.name)}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {contact.name}
                  </p>
                  {contact.email ? (
                    <p className="mt-0.5 break-all text-xs text-muted-foreground">
                      {contact.email}
                    </p>
                  ) : null}
                  {shopifyContact?.phone ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {shopifyContact.phone}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Thread details
                  </p>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Status</span>
                    {selectedListItem?.unread ? (
                      <Badge variant="default">New</Badge>
                    ) : (
                      <Badge variant="secondary">Read</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Source</span>
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Mail className="size-3.5" />
                      {shopifyContact ? "Shopify form" : "Gmail"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Last activity</span>
                    <span className="font-medium">
                      {formatRelative(
                        latestMessage?.date || selectedListItem?.date || "",
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Messages</span>
                    <span className="font-medium tabular-nums">
                      {detail?.messages.length ??
                        selectedListItem?.messageCount ??
                        "—"}
                    </span>
                  </div>
                </div>

                {detail?.gmailUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    asChild
                  >
                    <a
                      href={detail.gmailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                      Open in Gmail
                    </a>
                  </Button>
                ) : null}

                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Auto-reply preview
                  </p>
                  {!autoReplyLive ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Test mode — no customer emails
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px]">
                      Live
                    </Badge>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={previewLoading || !selectedId}
                      onClick={() => void onPreview()}
                    >
                      {previewLoading ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      Preview draft
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        previewLoading ||
                        !selectedId ||
                        !canSend ||
                        preview?.reason !== "dry_run"
                      }
                      onClick={() => void onSendTestToSelf()}
                    >
                      Email test to me
                    </Button>
                  </div>
                  {preview ? (
                    <div className="space-y-2 text-xs">
                      <p className="text-muted-foreground">
                        {preview.reason === "dry_run"
                          ? `Would send to ${preview.wouldSendTo || preview.customerEmail}`
                          : preview.reason === "sent_to_self"
                            ? `Test sent to ${preview.wouldSendTo}`
                            : `Status: ${preview.reason}`}
                      </p>
                      {preview.orderName ? (
                        <p>
                          Order{" "}
                          <span className="font-medium">{preview.orderName}</span>
                          {preview.stage ? ` · ${preview.stage}` : ""}
                        </p>
                      ) : null}
                      {preview.draftBody ? (
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-foreground">
                          {preview.draftBody}
                        </pre>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Open a thread to see what would auto-reply.
                    </p>
                  )}
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Inbox: {email || "connected"}.
                  {autoReplyLive
                    ? " Live auto-replies are enabled on the server."
                    : " Keep SUPPORT_AUTO_REPLY_LIVE unset/false until you’re ready."}
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
