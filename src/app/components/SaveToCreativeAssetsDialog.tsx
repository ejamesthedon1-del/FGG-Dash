"use client";

import * as React from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { apiUrl } from "../lib/api-base";
import {
  addImages,
  formatBytes,
  listAssetFolders,
  loadCreativeAssets,
  saveCreativeAssets,
} from "../lib/creative-assets-storage";
import { hostCreativeAssetsOnShopify } from "../lib/creative-assets-shopify";

const LAST_FOLDER_KEY = "fgg.mockups-last-assets-folder.v1";
const ROOT_FOLDER_VALUE = "__root__";
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrls: string[];
  defaultName?: string;
};

async function urlToStoredImage(
  url: string,
  filename: string,
): Promise<{ name: string; src: string; sizeLabel: string }> {
  // data: already usable
  if (url.startsWith("data:")) {
    const approx = Math.round((url.length * 3) / 4);
    if (approx > MAX_IMAGE_BYTES) {
      throw new Error(`${filename} is too large for Creative Assets (max ~2.5 MB)`);
    }
    return { name: filename, src: url, sizeLabel: formatBytes(approx) };
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > MAX_IMAGE_BYTES) {
        throw new Error(
          `${filename} is too large for Creative Assets (max ~2.5 MB)`,
        );
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
        reader.readAsDataURL(blob);
      });
      if (dataUrl.startsWith("data:")) {
        return {
          name: filename,
          src: dataUrl,
          sizeLabel: formatBytes(blob.size),
        };
      }
    }
  } catch {
    /* fall through to backend proxy */
  }

  const proxy = await fetch(
    apiUrl(`/api/mockups/fetch-image?url=${encodeURIComponent(url)}`),
  );
  if (!proxy.ok) {
    let detail = proxy.statusText;
    try {
      const body = (await proxy.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Could not download ${filename}`);
  }
  const body = (await proxy.json()) as { dataUrl?: string; byteLength?: number };
  if (!body.dataUrl?.startsWith("data:")) {
    throw new Error(`Could not encode ${filename}`);
  }
  if ((body.byteLength || 0) > MAX_IMAGE_BYTES) {
    throw new Error(`${filename} is too large for Creative Assets (max ~2.5 MB)`);
  }
  return {
    name: filename,
    src: body.dataUrl,
    sizeLabel: formatBytes(body.byteLength || 0),
  };
}

function defaultFilename(index: number, base: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (base || "mockup").replace(/[^\w\-]+/g, "-").replace(/-+/g, "-");
  if (index <= 0) return `${safe}-${stamp}.jpg`;
  return `${safe}-${stamp}-${index + 1}.jpg`;
}

export function SaveToCreativeAssetsDialog({
  open,
  onOpenChange,
  imageUrls,
  defaultName = "mockup",
}: Props) {
  const folders = React.useMemo(() => listAssetFolders(loadCreativeAssets()), [open]);
  const [folderValue, setFolderValue] = React.useState(ROOT_FOLDER_VALUE);
  const [baseName, setBaseName] = React.useState(defaultName);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBaseName(defaultName || "mockup");
    setSaving(false);
    try {
      const last = localStorage.getItem(LAST_FOLDER_KEY);
      if (last === ROOT_FOLDER_VALUE || last === "") {
        setFolderValue(ROOT_FOLDER_VALUE);
      } else if (last && folders.some((f) => f.id === last)) {
        setFolderValue(last);
      } else {
        setFolderValue(ROOT_FOLDER_VALUE);
      }
    } catch {
      setFolderValue(ROOT_FOLDER_VALUE);
    }
  }, [open, defaultName, folders]);

  const onSave = async () => {
    if (!imageUrls.length) {
      toast.error("No images to save");
      return;
    }
    setSaving(true);
    try {
      const prepared: Array<{ name: string; src: string; sizeLabel: string }> = [];
      for (let i = 0; i < imageUrls.length; i++) {
        prepared.push(
          await urlToStoredImage(imageUrls[i], defaultFilename(i, baseName.trim())),
        );
      }
      const tree = loadCreativeAssets();
      const parentId =
        folderValue === ROOT_FOLDER_VALUE || !folderValue ? null : folderValue;
      if (parentId && !folders.some((f) => f.id === parentId)) {
        toast.error("That folder no longer exists — pick another");
        return;
      }
      const { items: next, added } = addImages(tree, parentId, prepared);
      if (!saveCreativeAssets(next)) {
        toast.error("Could not save to Creative Assets (storage full?)");
        return;
      }
      try {
        localStorage.setItem(LAST_FOLDER_KEY, folderValue);
      } catch {
        /* ignore */
      }
      const folderLabel =
        folderValue === ROOT_FOLDER_VALUE
          ? "Creative Assets (root)"
          : (folders.find((f) => f.id === folderValue)?.path ?? "Creative Assets");
      toast.success(
        prepared.length === 1
          ? `Saved to ${folderLabel}`
          : `Saved ${prepared.length} images to ${folderLabel}`,
      );
      onOpenChange(false);
      // Background: host on Shopify Files so Schedule has a CDN URL ready.
      void hostCreativeAssetsOnShopify(added);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save to Creative Assets",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4" />
            Save to Creative Assets
          </DialogTitle>
          <DialogDescription>
            {imageUrls.length === 1
              ? "Save this generated image into a folder."
              : `Save ${imageUrls.length} generated images into a folder.`}{" "}
            Open{" "}
            <Link to="/creative-assets" className="font-medium text-blue-700 underline">
              Creative assets
            </Link>{" "}
            anytime to browse them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {imageUrls[0] ? (
            <div className="overflow-hidden rounded-lg bg-gray-100">
              <img
                src={imageUrls[0]}
                alt="Preview"
                className="max-h-36 w-full object-contain"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Folder</label>
            <Select value={folderValue} onValueChange={setFolderValue}>
              <SelectTrigger>
                <SelectValue placeholder="Choose folder" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {folders.map((f) => (
                  <SelectItem
                    key={f.id || "root"}
                    value={f.id || ROOT_FOLDER_VALUE}
                  >
                    {f.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Name</label>
            <Input
              value={baseName}
              onChange={(e) => setBaseName(e.target.value)}
              placeholder="mockup"
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="tertiary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
