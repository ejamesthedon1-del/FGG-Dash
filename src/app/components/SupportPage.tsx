import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { ExternalLink, LifeBuoy, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  disconnectSupportGmail,
  fetchSupportGmailStatus,
  fetchSupportThreads,
  supportGmailConnectUrl,
  type SupportThread,
} from "../lib/support-gmail";
import { cn } from "./ui/utils";

function formatThreadDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
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

export function SupportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const status = await fetchSupportGmailStatus();
      setConfigured(status.configured);
      setConnected(status.connected);
      setEmail(status.email ?? null);
      setClientId(status.clientId ?? null);
      setRedirectUri(status.redirectUri ?? null);
      if (status.connected) {
        const data = await fetchSupportThreads(30);
        setThreads(data.threads || []);
        setEmail(data.email ?? status.email ?? null);
      } else {
        setThreads([]);
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

  const onDisconnect = async () => {
    try {
      await disconnectSupportGmail();
      setConnected(false);
      setEmail(null);
      setThreads([]);
      toast.message("Gmail disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
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
                ejames@futuregarmentgroup.com
              </span>
              . On Google’s screen choose that account or{" "}
              <span className="font-medium text-foreground">Use another account</span>
              . Incognito works if Chrome is stuck on personal Gmail. Read-only
              for now.
            </p>
            {redirectUri ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  If you see redirect_uri_mismatch
                </p>
                <p className="mt-1">
                  Google Cloud → Clients → the client whose ID ends with{" "}
                  <code className="text-[11px]">
                    {(clientId || "").slice(-28) || "…googleusercontent.com"}
                  </code>{" "}
                  → Authorized redirect URIs → add exactly:
                </p>
                <code className="mt-2 block break-all rounded bg-background px-2 py-1.5 text-[11px] text-foreground">
                  {redirectUri}
                </code>
              </div>
            ) : null}
            <Button type="button" size="sm" className="gap-1.5" asChild>
              <a href={supportGmailConnectUrl()}>
                <Mail className="size-3.5" />
                Connect Gmail
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!loading && connected ? (
        <Card className="gap-1">
          <CardHeader className="pb-0 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Inbox</CardTitle>
              <p className="text-sm text-muted-foreground">
                {email || "Connected"} · {threads.length} thread
                {threads.length === 1 ? "" : "s"}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            {error ? (
              <p className="mb-3 text-sm text-rose-700">{error}</p>
            ) : null}
            {threads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No recent inbox threads.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border">
                {threads.map((t) => (
                  <li key={t.id}>
                    <a
                      href={t.gmailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/50",
                        t.unread && "bg-brand-soft/40",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className={cn(
                              "truncate text-sm",
                              t.unread
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground",
                            )}
                          >
                            {t.subject}
                          </p>
                          {t.unread ? (
                            <Badge variant="default" className="text-[10px]">
                              Unread
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t.from}
                          {t.date ? ` · ${formatThreadDate(t.date)}` : ""}
                        </p>
                        {t.snippet ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {t.snippet}
                          </p>
                        ) : null}
                      </div>
                      <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
