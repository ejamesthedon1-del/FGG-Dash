import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { SOPsStorage, type SOP } from "../lib/storage";
import {
  getNavStructure,
  addCategory,
  addMenuItem,
  getMenuItemLabel,
  type NavCategory,
} from "../lib/sop-nav-storage";
import { resolveSopNavPlacement } from "../lib/sop-structure";
import { FileTooLargeError, readFileAsPersistedDataUrl } from "../lib/file-data-url";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { ArrowLeft, ChevronDown, FileText } from "lucide-react";
import { toast } from "sonner";

export type SOPFormProps = {
  mode: "create" | "edit";
  initialSOP?: SOP;
};

export function SOPForm({ mode, initialSOP }: SOPFormProps) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [structure, setStructure] = useState<NavCategory[]>(() => getNavStructure());
  const refreshStructure = () => setStructure(getNavStructure());
  const [structureOpen, setStructureOpen] = useState(false);

  const initialStructure = useMemo(() => getNavStructure(), []);

  const placementSeed = useMemo(() => {
    if (mode === "edit" && initialSOP) {
      return resolveSopNavPlacement(initialSOP, initialStructure);
    }
    const prefillParams = new URLSearchParams(search);
    const prefillCategoryId = prefillParams.get("categoryId") ?? "";
    const prefillMenuItemId = prefillParams.get("menuItemId") ?? "";
    if (mode === "create" && (prefillCategoryId || prefillMenuItemId)) {
      const partial: SOP = {
        id: "__prefill__",
        title: "",
        description: "",
        createdAt: "",
        updatedAt: "",
        categoryId: prefillCategoryId || undefined,
        menuItemId: prefillMenuItemId || undefined,
      };
      return resolveSopNavPlacement(partial, initialStructure);
    }
    return null;
  }, [mode, initialSOP, search, initialStructure]);

  const defaultPlacement = useMemo(
    () => ({
      categoryId: initialStructure[0]?.id ?? "",
      menuItemId: initialStructure[0]?.items[0]?.id ?? "",
    }),
    [initialStructure],
  );

  const initialPlacement = placementSeed ?? defaultPlacement;

  const [categoryId, setCategoryId] = useState(initialPlacement.categoryId);
  const [menuItemId, setMenuItemId] = useState(initialPlacement.menuItemId);
  const [title, setTitle] = useState(
    mode === "edit" && initialSOP
      ? initialSOP.title
      : getMenuItemLabel(
          initialStructure,
          initialPlacement.categoryId,
          initialPlacement.menuItemId,
        ),
  );
  const [description, setDescription] = useState(initialSOP?.description ?? "");
  const [status, setStatus] = useState<SOP["status"]>(initialSOP?.status ?? "Active");
  const [tagsText, setTagsText] = useState((initialSOP?.tags ?? []).join(", "));
  const [pdfUrl, setPdfUrl] = useState<string | undefined>(initialSOP?.pdfUrl);
  const [pdfFileName, setPdfFileName] = useState<string | undefined>(initialSOP?.pdfFileName);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newMenuItemName, setNewMenuItemName] = useState("");

  const menuItemsForCategory = structure.find((c) => c.id === categoryId)?.items ?? [];

  useEffect(() => {
    if (mode !== "edit") return;
    const u = initialSOP?.pdfUrl;
    if (!u?.startsWith("blob:")) return;
    toast.warning(
      "This SOP’s PDF was saved with an older method that does not survive closing the browser. Please upload the PDF again — new uploads stay saved on this device.",
    );
    setPdfUrl(undefined);
    setPdfFileName(undefined);
  }, [mode, initialSOP?.id]);

  const handlePdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please choose a PDF file");
      return;
    }
    void (async () => {
      try {
        const dataUrl = await readFileAsPersistedDataUrl(file);
        setPdfUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return dataUrl;
        });
        setPdfFileName(file.name);
        toast.success("PDF embedded — it will persist when you leave and come back.");
      } catch (err) {
        if (err instanceof FileTooLargeError) {
          toast.error("That PDF is too large to store in the browser (max ~4 MB). Use a smaller file or host it elsewhere and paste a public link in the procedure body.");
          return;
        }
        toast.error("Could not read the PDF. Try another file.");
      }
    })();
  };

  const clearPdf = () => {
    if (pdfUrl?.startsWith("blob:")) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(undefined);
    setPdfFileName(undefined);
  };

  const onCategoryChange = (v: string) => {
    const latest = getNavStructure();
    setStructure(latest);
    setCategoryId(v);
    const first = latest.find((c) => c.id === v)?.items[0];
    setMenuItemId(first?.id ?? "");
    if (mode === "create" && first) setTitle(getMenuItemLabel(latest, v, first.id));
    if (mode === "create" && !first) setTitle("");
  };

  const onMenuChange = (id: string) => {
    const latest = getNavStructure();
    setStructure(latest);
    setMenuItemId(id);
    if (mode === "create") setTitle(getMenuItemLabel(latest, categoryId, id));
  };

  const handleAddCategory = () => {
    const cat = addCategory(newCategoryName);
    if (!cat) {
      toast.error("Enter a category name");
      return;
    }
    setNewCategoryName("");
    refreshStructure();
    setCategoryId(cat.id);
    setMenuItemId("");
    setTitle("");
    toast.success("Area added — add a section under it, then save.");
  };

  const handleAddMenuItem = () => {
    if (!categoryId) {
      toast.error("Select or create an area first");
      return;
    }
    const item = addMenuItem(categoryId, newMenuItemName);
    if (!item) {
      toast.error("Enter a section name");
      return;
    }
    setNewMenuItemName("");
    refreshStructure();
    setMenuItemId(item.id);
    if (mode === "create") setTitle(item.title);
    toast.success("Section added");
  };

  const handleSave = () => {
    if (!categoryId || !menuItemId) {
      toast.error("Choose an operational area and section (add one if needed)");
      return;
    }
    if (!title.trim()) {
      toast.error("Enter a procedure title");
      return;
    }
    if (!description.trim() && !pdfUrl) {
      toast.error("Add procedure text or attach a PDF");
      return;
    }
    if (pdfUrl?.startsWith("blob:")) {
      toast.error("Wait for the PDF to finish embedding, or remove and re-attach it.");
      return;
    }

    const now = new Date().toISOString();
    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8);

    if (mode === "create") {
      const sop: SOP = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: title.trim(),
        description: description.trim(),
        status,
        tags,
        categoryId,
        menuItemId,
        ...(pdfUrl ? { pdfUrl, pdfFileName } : {}),
        createdAt: now,
        updatedAt: now,
      };
      if (!SOPsStorage.saveSOP(sop)) {
        toast.error("Could not save — browser storage may be full. Remove a large PDF from another SOP or use a smaller file.");
        return;
      }
      toast.success("SOP created");
    } else if (initialSOP) {
      const sop: SOP = {
        ...initialSOP,
        title: title.trim(),
        description: description.trim(),
        status,
        tags,
        categoryId,
        menuItemId,
        pdfUrl,
        pdfFileName,
        updatedAt: now,
      };
      if (!SOPsStorage.saveSOP(sop)) {
        toast.error("Could not save — browser storage may be full. Try shortening text or using a smaller PDF.");
        return;
      }
      toast.success("SOP updated — placement saved to the new area if you moved it.");
    }

    navigate("/sops");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" onClick={() => navigate("/sops")} className="flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to SOPs
      </Button>

      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          {mode === "create" ? "Create procedure" : "Edit procedure"}
        </h2>
        <p className="mt-1 text-gray-600">
          {mode === "create"
            ? "Title, placement, and body — save sends it live in the hub for this device."
            : "Change title, move between areas or sections, refresh the body or PDF, then save."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Procedure details</CardTitle>
          <CardDescription>
            Placement controls where operators find this document. Tags and status help them prioritize what to read
            first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="sop-title">Title *</Label>
            {mode === "create" && (
              <p className="text-xs text-gray-500">Suggested from the section name; edit freely.</p>
            )}
            <Input
              id="sop-title"
              placeholder="e.g. High-risk order review checklist"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Operational area *</Label>
              <p className="text-xs text-gray-500">Top-level category in the SOP hub.</p>
              <Select value={categoryId || undefined} onValueChange={onCategoryChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose area" />
                </SelectTrigger>
                <SelectContent>
                  {structure.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section (subcategory) *</Label>
              <p className="text-xs text-gray-500">Subgroup within the area — pick or add below.</p>
              <Select
                value={menuItemId || undefined}
                onValueChange={onMenuChange}
                disabled={menuItemsForCategory.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      menuItemsForCategory.length === 0 ? "Add a section below" : "Choose section"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {menuItemsForCategory.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status ?? "Active"} onValueChange={(value) => setStatus(value as SOP["status"])}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Needs Update">Needs Update</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sop-tags">Tags</Label>
              <Input
                id="sop-tags"
                placeholder="e.g. shipping, weekend, tier-2"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
              <p className="text-xs text-gray-500">Comma-separated; used for search in the hub.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sop-body">Procedure body {pdfUrl ? "(optional if PDF attached)" : "*"}</Label>
            <Textarea
              id="sop-body"
              placeholder="Steps, policy notes, links, and context operators need on the floor…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="min-h-[180px] font-[system-ui] text-[15px] leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <Label>Attach PDF (optional)</Label>
            <p className="text-xs text-gray-500">
              Embedded in this browser so it still opens after you close the tab (keep files under ~4 MB).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                id="sop-pdf"
                accept="application/pdf"
                onChange={handlePdf}
                className="hidden"
              />
              <label htmlFor="sop-pdf">
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-4 py-3 text-sm hover:border-blue-500 hover:bg-blue-50">
                  <FileText className="h-4 w-4 text-blue-600" />
                  {pdfFileName ?? "Choose PDF"}
                </span>
              </label>
              {pdfUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={clearPdf}>
                  Remove PDF
                </Button>
              )}
            </div>
          </div>

          <Collapsible open={structureOpen} onOpenChange={setStructureOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between gap-2 font-normal">
                <span className="text-sm font-medium text-gray-900">Add new area or section</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${structureOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-4">
                <p className="text-xs text-gray-600">
                  Rarely needed — the default Future Garment library already includes the main areas and sections.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-gray-600">New operational area</Label>
                    <Input
                      placeholder="e.g. Wholesale partners"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={handleAddCategory}>
                    Add area
                  </Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-gray-600">New section under selected area</Label>
                    <Input
                      placeholder="e.g. Partner onboarding"
                      value={newMenuItemName}
                      onChange={(e) => setNewMenuItemName(e.target.value)}
                      disabled={!categoryId}
                    />
                  </div>
                  <Button type="button" variant="secondary" onClick={handleAddMenuItem} disabled={!categoryId}>
                    Add section
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSave} className="flex-1">
          {mode === "create" ? "Save procedure" : "Save changes"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/sops")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
