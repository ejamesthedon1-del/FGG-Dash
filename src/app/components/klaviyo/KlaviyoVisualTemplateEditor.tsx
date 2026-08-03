"use client";

import * as React from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  Expand,
  ImagePlus,
  Loader2,
  SendToBack,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import {
  CANVAS_WIDTH,
  clampFrame,
  compileLayoutToHtml,
  createDefaultLayout,
  newBlockId,
  parseLayoutFromHtml,
  snapFrameMove,
  snapFrameResize,
  type BlockAlign,
  type BlockFrame,
  type EmailBlock,
  type EmailLayout,
  type SnapGuides,
} from "../../lib/email-template-layout";
import { uploadKlaviyoTemplateImage } from "../../lib/klaviyo-api";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { cn } from "../ui/utils";

type Props = {
  initialHtml: string;
  onHtmlChange: (html: string) => void;
  disabled?: boolean;
};

type DragState =
  | {
      kind: "move";
      id: string;
      startX: number;
      startY: number;
      orig: BlockFrame;
    }
  | {
      kind: "resize";
      id: string;
      startX: number;
      startY: number;
      orig: BlockFrame;
    };

function AlignButtons({
  value,
  onChange,
}: {
  value: BlockAlign;
  onChange: (a: BlockAlign) => void;
}) {
  const opts: { id: BlockAlign; icon: typeof AlignLeft }[] = [
    { id: "left", icon: AlignLeft },
    { id: "center", icon: AlignCenter },
    { id: "right", icon: AlignRight },
  ];
  return (
    <div className="flex gap-1">
      {opts.map(({ id, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={cn(
            "inline-flex size-8 items-center justify-center border border-black/[0.08]",
            value === id ? "bg-gray-950 text-white" : "bg-white text-gray-600",
          )}
          onClick={() => onChange(id)}
          aria-label={`Align ${id}`}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

export function KlaviyoVisualTemplateEditor({
  initialHtml,
  onHtmlChange,
  disabled,
}: Props) {
  const [layout, setLayout] = React.useState<EmailLayout>(() => {
    return parseLayoutFromHtml(initialHtml) || createDefaultLayout();
  });
  const [selectedId, setSelectedId] = React.useState<string | null>(() => {
    const initial = parseLayoutFromHtml(initialHtml) || createDefaultLayout();
    return initial.blocks[0]?.id ?? null;
  });
  const [uploading, setUploading] = React.useState(false);
  const [snapEnabled, setSnapEnabled] = React.useState(true);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [guides, setGuides] = React.useState<SnapGuides>({
    vertical: [],
    horizontal: [],
  });
  const previewHtml = React.useMemo(
    () => compileLayoutToHtml(layout),
    [layout],
  );
  const previewBoxRef = React.useRef<HTMLDivElement>(null);
  const [previewBoxSize, setPreviewBoxSize] = React.useState({
    w: 248,
    h: 168,
  });

  React.useEffect(() => {
    const el = previewBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setPreviewBoxSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Full email artboard + room for unsubscribe footer in compiled HTML
  const previewArtW = layout.width;
  const previewArtH = layout.height + 72;
  const previewScale = Math.min(
    previewBoxSize.w / previewArtW,
    previewBoxSize.h / previewArtH,
  );
  const fileRef = React.useRef<HTMLInputElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const layoutRef = React.useRef(layout);
  const snapRef = React.useRef(snapEnabled);
  const hasEmitted = React.useRef(false);

  React.useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  React.useEffect(() => {
    snapRef.current = snapEnabled;
  }, [snapEnabled]);

  React.useEffect(() => {
    if (!hasEmitted.current) {
      hasEmitted.current = true;
      if (parseLayoutFromHtml(initialHtml)) return;
    }
    onHtmlChange(compileLayoutToHtml(layout));
  }, [layout, initialHtml, onHtmlChange]);

  const selected = layout.blocks.find((b) => b.id === selectedId) ?? null;
  const sortedBlocks = React.useMemo(
    () => [...layout.blocks].sort((a, b) => a.z - b.z),
    [layout.blocks],
  );

  const updateBlock = (id: string, patch: Partial<EmailBlock>) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === id ? ({ ...b, ...patch } as EmailBlock) : b,
      ),
    }));
  };

  const updateFrame = (id: string, frame: BlockFrame) => {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === id
          ? {
              ...b,
              frame: clampFrame(frame, prev.width, prev.height),
            }
          : b,
      ),
    }));
  };

  const addBlock = (type: EmailBlock["type"]) => {
    const z =
      layout.blocks.reduce((max, b) => Math.max(max, b.z), 0) + 1;
    let block: EmailBlock;
    switch (type) {
      case "image":
        block = {
          id: newBlockId(),
          type: "image",
          src: "",
          alt: "Image",
          frame: { x: 40, y: 40, w: 520, h: 240 },
          z,
        };
        break;
      case "heading":
        block = {
          id: newBlockId(),
          type: "heading",
          text: "Headline",
          align: "center",
          color: "#111111",
          fontSize: 28,
          frame: { x: 40, y: 80, w: 520, h: 48 },
          z,
        };
        break;
      case "text":
        block = {
          id: newBlockId(),
          type: "text",
          text: "Your copy here.",
          align: "left",
          color: "#333333",
          fontSize: 16,
          frame: { x: 40, y: 140, w: 520, h: 80 },
          z,
        };
        break;
      case "button":
        block = {
          id: newBlockId(),
          type: "button",
          label: "Shop now",
          href: "https://",
          align: "center",
          bg: "#111111",
          color: "#ffffff",
          frame: { x: 200, y: 240, w: 200, h: 48 },
          z,
        };
        break;
      default:
        return;
    }
    setLayout((prev) => ({ ...prev, blocks: [...prev.blocks, block] }));
    setSelectedId(block.id);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== selectedId),
    }));
    setSelectedId(null);
  };

  const bringForward = () => {
    if (!selected) return;
    const maxZ = layout.blocks.reduce((m, b) => Math.max(m, b.z), 0);
    updateBlock(selected.id, { z: maxZ + 1 } as Partial<EmailBlock>);
  };

  const sendBack = () => {
    if (!selected) return;
    const minZ = layout.blocks.reduce((m, b) => Math.min(m, b.z), 0);
    updateBlock(selected.id, { z: minZ - 1 } as Partial<EmailBlock>);
  };

  const onUploadPhoto = async (file: File | null) => {
    if (!file || !selected || selected.type !== "image") return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadKlaviyoTemplateImage(file);
      updateBlock(selected.id, { src: url } as Partial<EmailBlock>);
      toast.success("Photo added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clientToCanvas = (clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const scaleX = layout.width / rect.width;
    const scaleY = layout.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const onPointerDownBlock = (
    e: React.PointerEvent,
    block: EmailBlock,
    kind: "move" | "resize",
  ) => {
    if (disabled) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelectedId(block.id);
    const pt = clientToCanvas(e.clientX, e.clientY);
    dragRef.current = {
      kind,
      id: block.id,
      startX: pt.x,
      startY: pt.y,
      orig: { ...block.frame },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const current = layoutRef.current;
    const pt = clientToCanvas(e.clientX, e.clientY);
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    const others = current.blocks
      .filter((b) => b.id !== drag.id)
      .map((b) => b.frame);

    let next: BlockFrame;
    let nextGuides: SnapGuides = { vertical: [], horizontal: [] };

    if (drag.kind === "move") {
      next = {
        ...drag.orig,
        x: drag.orig.x + dx,
        y: drag.orig.y + dy,
      };
      if (snapRef.current && !e.shiftKey) {
        const snapped = snapFrameMove(
          next,
          others,
          current.width,
          current.height,
        );
        next = snapped.frame;
        nextGuides = snapped.guides;
      } else {
        next = clampFrame(next, current.width, current.height);
      }
    } else {
      next = {
        ...drag.orig,
        w: drag.orig.w + dx,
        h: drag.orig.h + dy,
      };
      if (snapRef.current && !e.shiftKey) {
        const snapped = snapFrameResize(
          next,
          others,
          current.width,
          current.height,
        );
        next = snapped.frame;
        nextGuides = snapped.guides;
      } else {
        next = clampFrame(next, current.width, current.height);
      }
    }

    setGuides(nextGuides);
    updateFrame(drag.id, next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setGuides({ vertical: [], horizontal: [] });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[7.5rem_minmax(0,1fr)_280px]">
      <aside className="space-y-3">
        <div className="inline-flex w-max flex-col gap-1.5">
          <p className="text-[13px] font-medium tracking-wide text-gray-400">
            Add
          </p>
          {(
            [
              ["image", "Photo", ImagePlus],
              ["heading", "Headline", Type],
              ["text", "Text", Type],
              ["button", "Button", Square],
            ] as const
          ).map(([type, label, Icon]) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full justify-start gap-1 px-2.5 text-xs"
              disabled={disabled}
              onClick={() => addBlock(type)}
            >
              <Icon className="size-3 shrink-0" />
              {label}
            </Button>
          ))}
          <div className="mt-2 space-y-1.5 border-t border-black/[0.06] pt-3">
            <Label className="text-[11px] text-gray-400">Page background</Label>
            <Input
              type="color"
              value={layout.background}
              disabled={disabled}
              onChange={(e) =>
                setLayout((p) => ({ ...p, background: e.target.value }))
              }
              className="h-7 w-full cursor-pointer p-0.5"
            />
            <Label className="text-[11px] text-gray-400">Canvas</Label>
            <Input
              type="color"
              value={layout.cardBackground}
              disabled={disabled}
              onChange={(e) =>
                setLayout((p) => ({ ...p, cardBackground: e.target.value }))
              }
              className="h-7 w-full cursor-pointer p-0.5"
            />
            <Label className="text-[11px] text-gray-400">Canvas height</Label>
            <Input
              type="number"
              min={400}
              max={2000}
              step={20}
              value={layout.height}
              disabled={disabled}
              onChange={(e) =>
                setLayout((p) => ({
                  ...p,
                  height: Math.max(400, Number(e.target.value) || 820),
                }))
              }
              className="h-7 w-full px-2 text-xs"
            />
          </div>
          <label className="mt-1 flex items-center gap-1.5 border-t border-black/[0.06] pt-3 text-[11px] text-gray-600">
            <input
              type="checkbox"
              checked={snapEnabled}
              disabled={disabled}
              onChange={(e) => setSnapEnabled(e.target.checked)}
            />
            Snap to align
          </label>
        </div>
        <p className="max-w-[7.5rem] text-[11px] leading-relaxed text-gray-400">
          Drag to place · corner to resize · hold Shift to ignore snap.
        </p>
      </aside>

      <div
        className="overflow-auto border border-black/[0.08] p-4 sm:p-6"
        style={{ background: layout.background }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          ref={canvasRef}
          className="relative mx-auto touch-none shadow-sm"
          style={{
            width: "100%",
            maxWidth: CANVAS_WIDTH,
            aspectRatio: `${layout.width} / ${layout.height}`,
            background: layout.cardBackground,
          }}
          onPointerDown={() => setSelectedId(null)}
        >
          {guides.vertical.map((x) => (
            <div
              key={`v-${x}`}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-pink-500/90"
              style={{ left: `${(x / layout.width) * 100}%` }}
            />
          ))}
          {guides.horizontal.map((y) => (
            <div
              key={`h-${y}`}
              className="pointer-events-none absolute left-0 right-0 h-px bg-pink-500/90"
              style={{ top: `${(y / layout.height) * 100}%` }}
            />
          ))}
          {sortedBlocks.map((block) => {
            const active = block.id === selectedId;
            const { x, y, w, h } = block.frame;
            const leftPct = (x / layout.width) * 100;
            const topPct = (y / layout.height) * 100;
            const widthPct = (w / layout.width) * 100;
            const heightPct = (h / layout.height) * 100;

            return (
              <div
                key={block.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "absolute box-border cursor-grab overflow-hidden active:cursor-grabbing",
                  active
                    ? "ring-2 ring-blue-500 ring-offset-1"
                    : "hover:ring-1 hover:ring-black/20",
                )}
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  zIndex: block.z + (active ? 1000 : 0),
                }}
                onPointerDown={(e) => onPointerDownBlock(e, block, "move")}
              >
                {block.type === "image" ? (
                  block.src ? (
                    <img
                      src={block.src}
                      alt={block.alt || ""}
                      className="pointer-events-none h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-50 text-[12px] text-gray-400">
                      Upload a photo
                    </div>
                  )
                ) : null}
                {block.type === "heading" ? (
                  <h3
                    className="pointer-events-none m-0 font-bold leading-tight"
                    style={{
                      color: block.color,
                      textAlign: block.align,
                      fontSize: block.fontSize,
                    }}
                  >
                    {block.text || "Headline"}
                  </h3>
                ) : null}
                {block.type === "text" ? (
                  <p
                    className="pointer-events-none m-0 whitespace-pre-wrap leading-relaxed"
                    style={{
                      color: block.color,
                      textAlign: block.align,
                      fontSize: block.fontSize,
                    }}
                  >
                    {block.text || "Text"}
                  </p>
                ) : null}
                {block.type === "button" ? (
                  <div
                    className="pointer-events-none flex h-full items-center justify-center"
                    style={{ textAlign: block.align }}
                  >
                    <span
                      className="inline-block rounded px-4 py-2.5 text-[14px] font-semibold"
                      style={{ background: block.bg, color: block.color }}
                    >
                      {block.label || "Button"}
                    </span>
                  </div>
                ) : null}

                {active && !disabled ? (
                  <div
                    className="absolute bottom-0 right-0 size-3.5 cursor-se-resize bg-blue-500"
                    onPointerDown={(e) =>
                      onPointerDownBlock(e, block, "resize")
                    }
                  />
                ) : null}
              </div>
            );
          })}
          {!layout.blocks.length ? (
            <p className="absolute inset-0 flex items-center justify-center text-[14px] text-gray-400">
              Add a photo or text, then drag it into place
            </p>
          ) : null}
        </div>
      </div>

      <aside className="flex min-h-0 flex-col gap-4">
        <div className="shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium tracking-wide text-gray-400">
              Preview
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setPreviewOpen(true)}
            >
              <Expand className="size-3" />
              Expand
            </Button>
          </div>
          <button
            type="button"
            ref={previewBoxRef}
            className="relative block h-36 w-full overflow-hidden border border-black/[0.08] text-left"
            style={{ background: layout.background }}
            onClick={() => setPreviewOpen(true)}
            title="Open full preview"
          >
            <div
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                width: previewArtW,
                height: previewArtH,
                transform: `translate(-50%, -50%) scale(${previewScale})`,
                transformOrigin: "center center",
              }}
            >
              <iframe
                title="Template preview"
                width={previewArtW}
                height={previewArtH}
                className="block border-0 bg-white"
                sandbox=""
                srcDoc={previewHtml}
                tabIndex={-1}
              />
            </div>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-black/[0.06] pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium tracking-wide text-gray-400">
            Edit block
          </p>
          {selected ? (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={disabled}
                title="Bring forward"
                onClick={bringForward}
              >
                <BringToFront className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={disabled}
                title="Send back"
                onClick={sendBack}
              >
                <SendToBack className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-red-600"
                disabled={disabled}
                onClick={removeSelected}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>

        {!selected ? (
          <p className="text-[14px] text-gray-400">
            Click a block, then drag it where you want.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["X", "x"],
                  ["Y", "y"],
                  ["W", "w"],
                  ["H", "h"],
                ] as const
              ).map(([label, key]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[11px] text-gray-400">{label}</Label>
                  <Input
                    type="number"
                    value={Math.round(selected.frame[key])}
                    disabled={disabled}
                    onChange={(e) =>
                      updateFrame(selected.id, {
                        ...selected.frame,
                        [key]: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={disabled}
                onClick={() =>
                  updateFrame(selected.id, {
                    ...selected.frame,
                    x: (layout.width - selected.frame.w) / 2,
                  })
                }
              >
                Center H
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={disabled}
                onClick={() =>
                  updateFrame(selected.id, {
                    ...selected.frame,
                    y: (layout.height - selected.frame.h) / 2,
                  })
                }
              >
                Center V
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={disabled}
                onClick={() =>
                  updateFrame(selected.id, { ...selected.frame, x: 0 })
                }
              >
                Left
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={disabled}
                onClick={() =>
                  updateFrame(selected.id, {
                    ...selected.frame,
                    x: layout.width - selected.frame.w,
                  })
                }
              >
                Right
              </Button>
            </div>
          </div>
        )}

        {selected?.type === "image" ? (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onUploadPhoto(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              className="w-full gap-2"
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ImagePlus className="size-3.5" />
              )}
              {selected.src ? "Replace photo" : "Upload photo"}
            </Button>
            <div className="space-y-1.5">
              <Label>Or image URL</Label>
              <Input
                value={selected.src}
                disabled={disabled}
                placeholder="https://…"
                onChange={(e) =>
                  updateBlock(selected.id, {
                    src: e.target.value,
                  } as Partial<EmailBlock>)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Alt text</Label>
              <Input
                value={selected.alt}
                disabled={disabled}
                onChange={(e) =>
                  updateBlock(selected.id, {
                    alt: e.target.value,
                  } as Partial<EmailBlock>)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link (optional)</Label>
              <Input
                value={selected.href || ""}
                disabled={disabled}
                placeholder="https://…"
                onChange={(e) =>
                  updateBlock(selected.id, {
                    href: e.target.value,
                  } as Partial<EmailBlock>)
                }
              />
            </div>
          </div>
        ) : null}

        {selected?.type === "heading" || selected?.type === "text" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{selected.type === "heading" ? "Headline" : "Text"}</Label>
              <Textarea
                value={selected.text}
                disabled={disabled}
                rows={selected.type === "heading" ? 2 : 5}
                onChange={(e) =>
                  updateBlock(selected.id, {
                    text: e.target.value,
                  } as Partial<EmailBlock>)
                }
              />
            </div>
            <AlignButtons
              value={selected.align}
              onChange={(align) =>
                updateBlock(selected.id, { align } as Partial<EmailBlock>)
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Color</Label>
                <Input
                  type="color"
                  value={selected.color}
                  disabled={disabled}
                  onChange={(e) =>
                    updateBlock(selected.id, {
                      color: e.target.value,
                    } as Partial<EmailBlock>)
                  }
                  className="h-9 cursor-pointer p-1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Size</Label>
                <Input
                  type="number"
                  min={10}
                  max={72}
                  value={selected.fontSize}
                  disabled={disabled}
                  onChange={(e) =>
                    updateBlock(selected.id, {
                      fontSize: Number(e.target.value) || 16,
                    } as Partial<EmailBlock>)
                  }
                />
              </div>
            </div>
          </div>
        ) : null}

        {selected?.type === "button" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={selected.label}
                disabled={disabled}
                onChange={(e) =>
                  updateBlock(selected.id, {
                    label: e.target.value,
                  } as Partial<EmailBlock>)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link</Label>
              <Input
                value={selected.href}
                disabled={disabled}
                onChange={(e) =>
                  updateBlock(selected.id, {
                    href: e.target.value,
                  } as Partial<EmailBlock>)
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Button</Label>
                <Input
                  type="color"
                  value={selected.bg}
                  disabled={disabled}
                  onChange={(e) =>
                    updateBlock(selected.id, {
                      bg: e.target.value,
                    } as Partial<EmailBlock>)
                  }
                  className="h-9 cursor-pointer p-1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Text</Label>
                <Input
                  type="color"
                  value={selected.color}
                  disabled={disabled}
                  onChange={(e) =>
                    updateBlock(selected.id, {
                      color: e.target.value,
                    } as Partial<EmailBlock>)
                  }
                  className="h-9 cursor-pointer p-1"
                />
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </aside>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
          </DialogHeader>
          <iframe
            title="Template preview expanded"
            className="min-h-[70vh] w-full flex-1 border border-black/[0.08] bg-white"
            sandbox=""
            srcDoc={previewHtml}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
