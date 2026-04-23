import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { supabase } from "@/lib/supabase/client";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Package,
  Palette,
  ClipboardList,
  Pencil,
  Plus,
  Trash2,
  LayoutDashboard,
  CheckCircle2,
  Circle,
  Folder,
  FileText,
  Upload,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { writeLocalAndSync } from "@/lib/synced-storage";
import { getBrandBySlug, saveBrandOverride } from "../lib/brand-hub-storage";
import type { BrandProfile, BrandQuickLink, BrandStatus } from "../lib/brand-hub-data";

/** Profile-page-only UI state (tasks, voice drafts, vault placeholders). Ready to swap for API later. */
const PROFILE_UI_STORAGE_KEY = "brand-hub-profile-ui-v1";

type BrandTask = { id: string; label: string; done: boolean };

type BrandVoiceLocal = {
  mission: string;
  tone: string;
  pillars: string;
  audience: string;
  keyPhrases: string;
  doSay: string;
  dontSay: string;
};

type ProfileUiBlob = {
  tasksBySlug?: Record<string, BrandTask[]>;
  voiceBySlug?: Record<string, BrandVoiceLocal>;
};

function loadProfileUi(): ProfileUiBlob {
  try {
    const raw = localStorage.getItem(PROFILE_UI_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as ProfileUiBlob;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function saveProfileUi(next: ProfileUiBlob): void {
  if (!writeLocalAndSync(PROFILE_UI_STORAGE_KEY, JSON.stringify(next))) {
    toast.error("Could not save layout data — storage may be full.");
  }
}

const DEFAULT_TASKS: BrandTask[] = [
  { id: "t1", label: "Launch new campaign", done: false },
  { id: "t2", label: "Approve creatives", done: false },
  { id: "t3", label: "Restock inventory", done: false },
  { id: "t4", label: "Update homepage banner", done: false },
  { id: "t5", label: "Review ad performance", done: false },
];

const CORE_VALUES = [
  "Quality",
  "Consistency",
  "Speed",
  "Culture",
  "Creativity",
  "Customer Experience",
] as const;

const CONTENT_VAULT_CATEGORIES = ["Videos", "Photos", "Ads", "Product Content", "UGC"] as const;

const FILE_FOLDERS = [
  { id: "logos", label: "Logos", hint: "SVG, PNG lockups" },
  { id: "decks", label: "Brand decks", hint: "PDF / Keynote" },
  { id: "sheets", label: "Product sheets", hint: "Specs & copy" },
  { id: "sops", label: "SOPs", hint: "Internal procedures" },
  { id: "contracts", label: "Contracts", hint: "Legal & partners" },
  { id: "creative", label: "Creative assets", hint: "Campaign files" },
] as const;

function statusStyles(status: BrandStatus): string {
  switch (status) {
    case "Active":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "Pilot":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "Paused":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "Planning":
      return "border-gray-200 bg-gray-50 text-gray-800";
    default:
      return "border-gray-200 bg-gray-50 text-gray-800";
  }
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <p className="rounded-md border border-dashed border-gray-200 bg-gray-50/60 px-3 py-4 text-sm text-gray-500">
      {label}
    </p>
  );
}

function NoteBlock({ title, body }: { title: string; body?: string }) {
  if (!body?.trim()) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{body.trim()}</p>
    </div>
  );
}

function cloneForEdit(b: BrandProfile): BrandProfile {
  return {
    ...b,
    brandNotes: { ...b.brandNotes },
    brandAssets: {
      ...b.brandAssets,
      files: [...(b.brandAssets?.files ?? [])],
    },
    operationsNotes: { ...b.operationsNotes },
    quickLinks: [...(b.quickLinks ?? [])],
  };
}

/** Mock KPIs — replace with Shopify (or other) API when wired. */
function mockKpisForBrand(slug: string) {
  const s = slug.length + (slug.charCodeAt(0) ?? 0);
  return {
    todayRevenue: `$${(8.2 + (s % 20) / 10).toFixed(1)}k`,
    monthRevenue: `$${(220 + (s % 80)).toFixed(0)}k`,
    ordersToday: 32 + (s % 24),
    conversion: `${(2.8 + (s % 15) / 10).toFixed(1)}%`,
    returningCustomers: `${(22 + (s % 12)).toFixed(0)}%`,
    topProduct: s % 2 === 0 ? "Core Hoodie — Black" : "Signature Tee — Bone",
  };
}

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-400">{sub}</p> : null}
    </div>
  );
}

export function BrandHubDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandProfile | null>(null);
  const [tasks, setTasks] = useState<BrandTask[]>(DEFAULT_TASKS);
  const [voice, setVoice] = useState<BrandVoiceLocal>({
    mission: "",
    tone: "",
    pillars: "",
    audience: "",
    keyPhrases: "",
    doSay: "",
    dontSay: "",
  });
  const [newTaskLabel, setNewTaskLabel] = useState("");
  const voiceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadBrand = useCallback(() => {
    const b = getBrandBySlug(slug);
    if (!b) {
      toast.error("Brand not found");
      navigate("/brand-hub", { replace: true });
      return;
    }
    setBrand(b);
  }, [slug, navigate]);

  useEffect(() => {
    reloadBrand();
  }, [reloadBrand]);

  useEffect(() => {
    window.addEventListener("fgg-storage-sync", reloadBrand);
    return () => window.removeEventListener("fgg-storage-sync", reloadBrand);
  }, [reloadBrand]);

  useEffect(() => {
    if (!slug || !brand) return;
    const ui = loadProfileUi();
    const savedTasks = ui.tasksBySlug?.[slug];
    setTasks(savedTasks?.length ? savedTasks : DEFAULT_TASKS.map((t) => ({ ...t, id: `${slug}-${t.id}` })));
    const savedVoice = ui.voiceBySlug?.[slug];
    if (savedVoice) {
      setVoice(savedVoice);
    } else {
      setVoice({
        mission: "",
        tone: "",
        pillars: "",
        audience: brand.positioningAudience || "",
        keyPhrases: "",
        doSay: "",
        dontSay: "",
      });
    }
  }, [slug, brand]);

  const persistTasks = useCallback(
    (next: BrandTask[]) => {
      setTasks(next);
      if (!slug) return;
      const ui = loadProfileUi();
      saveProfileUi({
        ...ui,
        tasksBySlug: { ...ui.tasksBySlug, [slug]: next },
      });
    },
    [slug],
  );

  const persistVoice = useCallback((next: BrandVoiceLocal) => {
    setVoice(next);
    if (!slug) return;
    if (voiceSaveTimer.current) clearTimeout(voiceSaveTimer.current);
    voiceSaveTimer.current = setTimeout(() => {
      const ui = loadProfileUi();
      saveProfileUi({
        ...ui,
        voiceBySlug: { ...ui.voiceBySlug, [slug]: next },
      });
    }, 400);
  }, [slug]);

  useEffect(
    () => () => {
      if (voiceSaveTimer.current) clearTimeout(voiceSaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setIsAdmin(Boolean(data.session)));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAdmin(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  const startEdit = () => {
    if (!brand) return;
    setDraft(cloneForEdit(brand));
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
  };

  const saveEdit = () => {
    if (!draft || !slug) return;
    const notes = draft.brandNotes ?? {};
    const ops = draft.operationsNotes ?? {};
    const ast = draft.brandAssets ?? {};

    const patch: Partial<BrandProfile> = {
      name: draft.name.trim(),
      shortDescription: draft.shortDescription.trim(),
      status: draft.status,
      primaryNotes: draft.primaryNotes?.trim() || undefined,
      positioningAudience: draft.positioningAudience?.trim() || undefined,
      brandNotes: {
        handling: notes.handling?.trim() || undefined,
        packaging: notes.packaging?.trim() || undefined,
        inserts: notes.inserts?.trim() || undefined,
        presentation: notes.presentation?.trim() || undefined,
        shipping: notes.shipping?.trim() || undefined,
      },
      brandAssets: {
        logoNote: ast.logoNote?.trim() || undefined,
        files: ast.files?.length ? ast.files : undefined,
        visualRefs: ast.visualRefs?.trim() || undefined,
        templates: ast.templates?.trim() || undefined,
      },
      operationsNotes: {
        sopExceptions: ops.sopExceptions?.trim() || undefined,
        workflows: ops.workflows?.trim() || undefined,
        productCautions: ops.productCautions?.trim() || undefined,
        launchNotes: ops.launchNotes?.trim() || undefined,
      },
      quickLinks: draft.quickLinks?.filter((l) => l.label.trim() && l.href.trim()) ?? [],
    };

    try {
      saveBrandOverride(slug, patch);
    } catch {
      toast.error("Could not save — browser storage may be full.");
      return;
    }
    reloadBrand();
    setEditing(false);
    setDraft(null);
    toast.success("Brand profile saved for everyone on this device.");
  };

  const toggleTask = (id: string) => {
    persistTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const addTask = () => {
    const label = newTaskLabel.trim();
    if (!label) return;
    persistTasks([...tasks, { id: `task-${Date.now()}`, label, done: false }]);
    setNewTaskLabel("");
  };

  const removeTask = (id: string) => {
    persistTasks(tasks.filter((t) => t.id !== id));
  };

  const kpis = useMemo(() => (slug ? mockKpisForBrand(slug) : null), [slug]);

  if (!brand || !slug || !kpis) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500">Loading…</div>
    );
  }

  const display = editing && draft ? draft : brand;
  const notes = display.brandNotes;
  const assets = display.brandAssets;
  const ops = display.operationsNotes;
  const hasAssetsContent = Boolean(
    assets?.logoNote?.trim() ||
      (assets?.files && assets.files.length > 0) ||
      assets?.visualRefs?.trim() ||
      assets?.templates?.trim(),
  );

  const updateDraft = (partial: Partial<BrandProfile>) => {
    if (!draft) return;
    setDraft({ ...draft, ...partial });
  };

  const updateQuickLink = (index: number, field: keyof BrandQuickLink, value: string) => {
    if (!draft) return;
    const links = [...(draft.quickLinks ?? [])];
    links[index] = { ...links[index], [field]: value };
    setDraft({ ...draft, quickLinks: links });
  };

  const addQuickLink = () => {
    if (!draft) return;
    setDraft({ ...draft, quickLinks: [...(draft.quickLinks ?? []), { label: "", href: "/" }] });
  };

  const removeQuickLink = (index: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      quickLinks: (draft.quickLinks ?? []).filter((_, i) => i !== index),
    });
  };

  const onVaultDrop = (e: React.DragEvent, category: string) => {
    e.preventDefault();
    e.stopPropagation();
    toast.message("Upload queue", {
      description: `${category}: ${e.dataTransfer.files.length} file(s) dropped. Wire to storage or Shopify when ready.`,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <Button variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-gray-600" asChild>
            <Link to="/brand-hub">
              <ArrowLeft className="h-4 w-4" />
              All brands
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            {editing && draft ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
                <Label className="text-xs text-gray-500">Brand name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="text-lg font-semibold"
                />
              </div>
            ) : (
              <h2 className="text-2xl font-semibold text-gray-900">{display.name}</h2>
            )}
            {editing && draft ? (
              <Select value={draft.status} onValueChange={(v) => updateDraft({ status: v as BrandStatus })}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pilot">Pilot</SelectItem>
                  <SelectItem value="Paused">Paused</SelectItem>
                  <SelectItem value="Planning">Planning</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className={`font-medium ${statusStyles(display.status)}`}>
                {display.status}
              </Badge>
            )}
          </div>
          {editing && draft ? (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Short description</Label>
              <Textarea
                value={draft.shortDescription}
                onChange={(e) => updateDraft({ shortDescription: e.target.value })}
                rows={3}
                className="text-gray-700"
              />
            </div>
          ) : (
            <p className="max-w-3xl text-gray-600">{display.shortDescription}</p>
          )}
        </div>
        {isAdmin ? (
          <div className="flex shrink-0 gap-2">
            {editing ? (
              <>
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveEdit}>
                  Save changes
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" className="gap-2" onClick={startEdit}>
                <Pencil className="h-4 w-4" />
                Edit profile
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Top dashboard: KPIs + tasks */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle className="text-base">Brand dashboard</CardTitle>
                <CardDescription>Snapshot metrics (mock) — ready to connect to Shopify or your BI tool.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiTile label="Today revenue" value={kpis.todayRevenue} sub="vs. yesterday" />
              <KpiTile label="This month revenue" value={kpis.monthRevenue} sub="MTD" />
              <KpiTile label="Orders today" value={String(kpis.ordersToday)} sub="all channels" />
              <KpiTile label="Conversion rate" value={kpis.conversion} sub="storefront" />
              <KpiTile label="Returning customers" value={kpis.returningCustomers} sub="30-day window" />
              <KpiTile label="Top product" value={kpis.topProduct} sub="by units" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Brand tasks</CardTitle>
            <CardDescription>Checklist for this brand — stored on this device per brand.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className="group flex items-start gap-3 rounded-lg border border-transparent px-2 py-2 hover:border-gray-100 hover:bg-gray-50/80"
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(t.id)}
                    className="mt-0.5 shrink-0 text-gray-400 transition-colors hover:text-blue-600"
                    aria-label={t.done ? "Mark incomplete" : "Mark complete"}
                  >
                    {t.done ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>
                  <span
                    className={`min-w-0 flex-1 text-sm leading-snug ${
                      t.done ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {t.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeTask(t.id)}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove task"
                  >
                    <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-600" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
              <Input
                placeholder="Add a task…"
                value={newTaskLabel}
                onChange={(e) => setNewTaskLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
                className="flex-1"
              />
              <Button type="button" variant="secondary" size="sm" className="gap-1 shrink-0" onClick={addTask}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Quick access</p>
              {(display.quickLinks ?? []).length > 0 ? (
                <ul className="space-y-1.5">
                  {display.quickLinks!.map((link) => (
                    <li key={link.label + link.href}>
                      {link.href.startsWith("http") ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </a>
                      ) : (
                        <Link to={link.href} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline">
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">No links — admins can add them in Edit profile.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operations modules */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Brand operations</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4 text-blue-600" />
                Content vault
              </CardTitle>
              <CardDescription>Organize creative by type. Drops are local placeholders until cloud storage is wired.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CONTENT_VAULT_CATEGORIES.map((cat) => (
                  <div
                    key={cat}
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => onVaultDrop(e, cat)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toast.message("Upload", { description: `Open file picker for ${cat} when storage is connected.` });
                      }
                    }}
                    className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-3 py-4 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                  >
                    <Upload className="mb-2 h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-800">{cat}</span>
                    <span className="mt-1 text-xs text-gray-500">Drop files here</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Folder className="h-4 w-4 text-blue-600" />
                Files &amp; documents
              </CardTitle>
              <CardDescription>Folder-style map for internal assets — link out or attach when drive integration exists.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                {FILE_FOLDERS.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50/80"
                  >
                    <Folder className="h-5 w-5 shrink-0 text-amber-500/90" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{f.label}</p>
                      <p className="text-xs text-gray-500">{f.hint}</p>
                    </div>
                    <FileText className="h-4 w-4 shrink-0 text-gray-300" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                Brand voice &amp; messaging
              </CardTitle>
              <CardDescription>
                Editable working copy — saves automatically in this browser. Sync from admin “Positioning” when you formalize it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["mission", "Brand mission"],
                    ["tone", "Tone of voice"],
                    ["pillars", "Messaging pillars"],
                    ["audience", "Target audience"],
                    ["keyPhrases", "Key phrases"],
                    ["doSay", "Do say"],
                    ["dontSay", "Don’t say"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className={key === "mission" || key === "pillars" ? "sm:col-span-2" : ""}>
                    <Label className="text-xs text-gray-600">{label}</Label>
                    <Textarea
                      value={voice[key]}
                      onChange={(e) => persistVoice({ ...voice, [key]: e.target.value })}
                      rows={key === "mission" || key === "pillars" ? 3 : 2}
                      className="mt-1"
                      placeholder={`Add ${label.toLowerCase()}…`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Core values
              </CardTitle>
              <CardDescription>What this brand optimizes for — align campaigns and CX to these pillars.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {CORE_VALUES.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Admin catalog editor (unchanged capability) */}
      {editing && draft ? (
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Admin editor</CardTitle>
            <CardDescription>
              Signed-in admins only — updates are saved in this browser for all users of this app on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Primary notes (optional)</Label>
              <Textarea
                value={draft.primaryNotes ?? ""}
                onChange={(e) => updateDraft({ primaryNotes: e.target.value })}
                rows={2}
                placeholder="Leave empty to hide the primary notes block on the overview card."
              />
            </div>
            <div className="space-y-2">
              <Label>Positioning / audience</Label>
              <Textarea
                value={draft.positioningAudience ?? ""}
                onChange={(e) => updateDraft({ positioningAudience: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2 border-t border-blue-100 pt-4">
              <p className="text-sm font-medium text-gray-900">Brand notes</p>
              {(["handling", "packaging", "inserts", "presentation", "shipping"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="capitalize">{key === "inserts" ? "Inserts / thank-you" : key}</Label>
                  <Textarea
                    value={draft.brandNotes?.[key] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        brandNotes: { ...draft.brandNotes, [key]: e.target.value },
                      })
                    }
                    rows={2}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-blue-100 pt-4">
              <p className="text-sm font-medium text-gray-900">Brand assets</p>
              <div className="space-y-1">
                <Label>Logo note</Label>
                <Textarea
                  value={draft.brandAssets?.logoNote ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      brandAssets: { ...draft.brandAssets, logoNote: e.target.value },
                    })
                  }
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Visual references</Label>
                <Textarea
                  value={draft.brandAssets?.visualRefs ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      brandAssets: { ...draft.brandAssets, visualRefs: e.target.value },
                    })
                  }
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Templates</Label>
                <Textarea
                  value={draft.brandAssets?.templates ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      brandAssets: { ...draft.brandAssets, templates: e.target.value },
                    })
                  }
                  rows={2}
                />
              </div>
            </div>
            <div className="space-y-2 border-t border-blue-100 pt-4">
              <p className="text-sm font-medium text-gray-900">Operations notes</p>
              {(["sopExceptions", "workflows", "productCautions", "launchNotes"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-sm normal-case text-gray-700">
                    {key === "sopExceptions"
                      ? "SOP exceptions"
                      : key === "productCautions"
                        ? "Product cautions"
                        : key === "launchNotes"
                          ? "Launch notes"
                          : "Unique workflows"}
                  </Label>
                  <Textarea
                    value={draft.operationsNotes?.[key] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        operationsNotes: { ...draft.operationsNotes, [key]: e.target.value },
                      })
                    }
                    rows={2}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-3 border-t border-blue-100 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">Quick links</p>
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addQuickLink}>
                  <Plus className="h-4 w-4" />
                  Add link
                </Button>
              </div>
              <p className="text-xs text-gray-500">Use paths like /sops or full https URLs. Leave both empty on a row to skip.</p>
              {(draft.quickLinks ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">No quick links — add one or leave empty.</p>
              ) : (
                <ul className="space-y-2">
                  {(draft.quickLinks ?? []).map((link, i) => (
                    <li key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-2">
                      <div className="min-w-[8rem] flex-1 space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={link.label}
                          onChange={(e) => updateQuickLink(i, "label", e.target.value)}
                          placeholder="e.g. Drive folder"
                        />
                      </div>
                      <div className="min-w-[10rem] flex-[2] space-y-1">
                        <Label className="text-xs">URL or path</Label>
                        <Input
                          value={link.href}
                          onChange={(e) => updateQuickLink(i, "href", e.target.value)}
                          placeholder="/sops or https://…"
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeQuickLink(i)} aria-label="Remove link">
                        <Trash2 className="h-4 w-4 text-gray-500" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Reference: existing structured brand data */}
      <div className="border-t border-gray-200 pt-8">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Operational reference</h3>
        <div className="mx-auto max-w-4xl space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                  Brand overview
                </CardTitle>
                <CardDescription>From the canonical brand record.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Positioning / audience</h4>
                  {display.positioningAudience?.trim() ? (
                    <p className="mt-1 leading-relaxed text-gray-800">{display.positioningAudience}</p>
                  ) : (
                    <EmptyBlock label="No positioning notes yet." />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Primary notes</h4>
                  {display.primaryNotes?.trim() ? (
                    <p className="mt-1 leading-relaxed text-gray-800">{display.primaryNotes}</p>
                  ) : (
                    <EmptyBlock label="No primary notes for this brand." />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-blue-600" />
                  Brand notes
                </CardTitle>
                <CardDescription>Handling, packaging, inserts, presentation, and shipping nuances.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {notes && Object.values(notes).some((v) => typeof v === "string" && v.trim()) ? (
                  <div className="space-y-4">
                    <NoteBlock title="Handling" body={notes.handling} />
                    <NoteBlock title="Packaging" body={notes.packaging} />
                    <NoteBlock title="Inserts / thank-you" body={notes.inserts} />
                    <NoteBlock title="Product presentation" body={notes.presentation} />
                    <NoteBlock title="Shipping" body={notes.shipping} />
                  </div>
                ) : (
                  <EmptyBlock label="No brand-specific notes yet. Sign in as admin and use Edit profile to add them." />
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Palette className="h-4 w-4 text-blue-600" />
                  Brand assets
                </CardTitle>
                <CardDescription>Logos, files, visual references, and templates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {!hasAssetsContent ? (
                  <EmptyBlock label="No asset details yet — add logo notes, file links, or references when ready." />
                ) : (
                  <>
                    {assets?.logoNote?.trim() ? (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Logo</h4>
                        <p className="mt-1 leading-relaxed text-gray-800">{assets.logoNote}</p>
                      </div>
                    ) : null}
                    {assets?.files && assets.files.length > 0 ? (
                      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/50">
                        {assets.files.map((f, i) => (
                          <li key={`${f.name}-${i}`} className="px-3 py-2.5">
                            <p className="font-medium text-gray-900">{f.name}</p>
                            {f.description ? <p className="mt-0.5 text-xs text-gray-600">{f.description}</p> : null}
                            {f.url ? (
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <p className="mt-1 text-xs text-gray-400">URL not set — reference entry only.</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {assets?.visualRefs?.trim() ? (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Visual references</h4>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-gray-800">{assets.visualRefs}</p>
                      </div>
                    ) : null}
                    {assets?.templates?.trim() ? (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Templates</h4>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-gray-800">{assets.templates}</p>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Brand operations notes</CardTitle>
                <CardDescription>Exceptions to standard SOPs, unique flows, cautions, and launch context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {ops && Object.values(ops).some((v) => typeof v === "string" && v.trim()) ? (
                  <div className="space-y-4 text-sm">
                    <NoteBlock title="SOP exceptions" body={ops.sopExceptions} />
                    <NoteBlock title="Unique workflows" body={ops.workflows} />
                    <NoteBlock title="Product cautions" body={ops.productCautions} />
                    <NoteBlock title="Launch notes" body={ops.launchNotes} />
                  </div>
                ) : (
                  <EmptyBlock label="No operations exceptions captured yet." />
                )}
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
