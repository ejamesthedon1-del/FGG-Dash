"use client";

import * as React from "react";
import { ExternalLink, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
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
import {
  DEFAULT_APPAREL_SIZES,
  SHOPIFY_PUSH_BRANDS,
  pushShopifyProduct,
  type ShopifyPushBrand,
} from "../lib/shopify-products-api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Image URLs (https or data:) to attach to the draft product. */
  imageUrls: string[];
  defaultTitle?: string;
};

export function PushToShopifyDialog({
  open,
  onOpenChange,
  imageUrls,
  defaultTitle = "",
}: Props) {
  const [brand, setBrand] = React.useState<ShopifyPushBrand>("live-don");
  const [title, setTitle] = React.useState(defaultTitle);
  const [price, setPrice] = React.useState("");
  const [color, setColor] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [sizes, setSizes] = React.useState<string[]>([...DEFAULT_APPAREL_SIZES]);
  const [submitting, setSubmitting] = React.useState(false);
  const [adminUrl, setAdminUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setPrice("");
    setColor("");
    setDescription("");
    setSizes([...DEFAULT_APPAREL_SIZES]);
    setAdminUrl(null);
    setSubmitting(false);
  }, [open, defaultTitle]);

  const toggleSize = (size: string, checked: boolean) => {
    setSizes((prev) => {
      if (checked) {
        const next = [...prev, size];
        return DEFAULT_APPAREL_SIZES.filter((s) => next.includes(s));
      }
      return prev.filter((s) => s !== size);
    });
  };

  const onSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Enter a product title");
      return;
    }
    if (!sizes.length) {
      toast.error("Pick at least one size");
      return;
    }
    if (!imageUrls.length) {
      toast.error("Need at least one image to push");
      return;
    }

    setSubmitting(true);
    setAdminUrl(null);
    try {
      const result = await pushShopifyProduct({
        brand,
        title: trimmed,
        price: price.trim() || undefined,
        sizes,
        color: color.trim() || undefined,
        descriptionHtml: description.trim()
          ? description.trim().replace(/\n/g, "<br/>")
          : undefined,
        imageUrls,
        status: "DRAFT",
      });
      const url = result.adminUrl || null;
      setAdminUrl(url);
      toast.success(
        `Draft created on ${result.brandLabel || brand}${url ? " — open in Shopify Admin" : ""}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Shopify push failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Push to Shopify
          </DialogTitle>
          <DialogDescription>
            Creates a <strong>draft</strong> product on the selected existing store
            with images and size variants. Payments and theme stay in Shopify Admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {imageUrls[0] ? (
            <div className="overflow-hidden rounded-lg bg-gray-100">
              <img
                src={imageUrls[0]}
                alt="Product preview"
                className="max-h-40 w-full object-contain"
              />
              {imageUrls.length > 1 ? (
                <p className="border-t border-gray-100 px-2 py-1 text-center text-[11px] text-gray-500">
                  {imageUrls.length} images will be attached
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Store</label>
            <Select
              value={brand}
              onValueChange={(v) => setBrand(v as ShopifyPushBrand)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOPIFY_PUSH_BRANDS.map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Product title"
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">Price</label>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">
                Color (optional)
              </label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Black"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Sizes</label>
            <div className="flex flex-wrap gap-3">
              {DEFAULT_APPAREL_SIZES.map((size) => {
                const checked = sizes.includes(size);
                return (
                  <label
                    key={size}
                    className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleSize(size, v === true)}
                      disabled={submitting}
                    />
                    {size}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">
              Description (optional)
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short product description"
              rows={3}
              disabled={submitting}
            />
          </div>

          {adminUrl ? (
            <a
              href={adminUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
            >
              Open draft in Shopify Admin
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="tertiary"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {adminUrl ? "Close" : "Cancel"}
          </Button>
          <Button type="button" onClick={() => void onSubmit()} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Pushing…
              </>
            ) : (
              "Create draft"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
