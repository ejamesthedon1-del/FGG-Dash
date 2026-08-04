"use client";

import * as React from "react";
import {
  Canvas,
  FabricImage,
  IText,
  PencilBrush,
  type FabricObject,
} from "fabric";
import { MousePointer2, Paintbrush, Type, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { cn } from "./ui/utils";

type Tool = "select" | "brush";

type Props = {
  open: boolean;
  imageUrl: string;
  onOpenChange: (open: boolean) => void;
  onSave: (dataUrl: string) => void;
};

const MAX_W = 900;
const MAX_H = 640;

export function MockupManualEditor({
  open,
  imageUrl,
  onOpenChange,
  onSave,
}: Props) {
  const canvasElRef = React.useRef<HTMLCanvasElement | null>(null);
  const canvasRef = React.useRef<Canvas | null>(null);
  const [tool, setTool] = React.useState<Tool>("select");
  const [color, setColor] = React.useState("#ffffff");
  const [brushSize, setBrushSize] = React.useState(10);
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const applyTool = React.useCallback(
    (c: Canvas, next: Tool, paint: string, size: number) => {
      c.isDrawingMode = next === "brush";
      c.selection = next === "select";
      c.forEachObject((obj) => {
        obj.selectable = next === "select";
        obj.evented = next === "select";
      });
      if (next === "brush") {
        const brush = new PencilBrush(c);
        brush.width = size;
        brush.color = paint;
        c.freeDrawingBrush = brush;
      }
      c.requestRenderAll();
    },
    [],
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let canvas: Canvas | null = null;
    let objectUrl: string | null = null;

    const boot = async () => {
      setLoading(true);
      setReady(false);
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error("fetch");
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled || !canvasElRef.current) return;

        canvas = new Canvas(canvasElRef.current, {
          preserveObjectStacking: true,
          selection: true,
        });
        canvasRef.current = canvas;

        const img = await FabricImage.fromURL(objectUrl);
        if (cancelled) return;

        const iw = img.width || 1;
        const ih = img.height || 1;
        const scale = Math.min(MAX_W / iw, MAX_H / ih, 1);
        const w = Math.round(iw * scale);
        const h = Math.round(ih * scale);
        canvas.setDimensions({ width: w, height: h });
        img.set({
          scaleX: scale,
          scaleY: scale,
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
        });
        canvas.backgroundImage = img;
        applyTool(canvas, "select", color, brushSize);
        canvas.requestRenderAll();
        setReady(true);
      } catch {
        if (!cancelled) {
          toast.error("Couldn’t open image for editing");
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();

    return () => {
      cancelled = true;
      canvas?.dispose();
      canvasRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setReady(false);
    };
    // Only re-init when dialog opens / source changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageUrl]);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c || !ready) return;
    applyTool(c, tool, color, brushSize);
  }, [tool, color, brushSize, ready, applyTool]);

  const addText = () => {
    const c = canvasRef.current;
    if (!c) return;
    setTool("select");
    const text = new IText("Edit me", {
      left: (c.width || 200) * 0.2,
      top: (c.height || 200) * 0.2,
      fill: color,
      fontSize: 36,
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: "600",
    });
    c.add(text);
    c.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    c.requestRenderAll();
  };

  const recolorSelection = () => {
    const c = canvasRef.current;
    if (!c) return;
    const obj = c.getActiveObject() as FabricObject | undefined;
    if (!obj) {
      toast.message("Select a text layer first");
      return;
    }
    if (obj.type === "i-text" || obj.type === "text" || obj.type === "textbox") {
      obj.set("fill", color);
      c.requestRenderAll();
      return;
    }
    toast.message("Select text to change its color");
  };

  const handleSave = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.discardActiveObject();
    c.requestRenderAll();
    const dataUrl = c.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 1,
    });
    onSave(dataUrl);
    onOpenChange(false);
    toast.success("Edits applied to result");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="space-y-1 border-b border-border px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-[15px] font-medium">
            Manual edit
          </DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            Add or change overlay text and paint colors on top of the image —
            no AI re-run. Baked-in Nano text can’t be selected; cover it with
            paint or new text.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          {(
            [
              { id: "select", label: "Select", icon: MousePointer2 },
              { id: "brush", label: "Brush", icon: Paintbrush },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={tool === id ? "default" : "outline"}
              className="h-8 gap-1.5"
              onClick={() => setTool(id)}
            >
              <Icon className="size-3.5" />
              {label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={addText}
          >
            <Type className="size-3.5" />
            Add text
          </Button>
          <label className="ml-1 flex items-center gap-1.5 text-[12px] text-gray-500">
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            className="h-8"
            onClick={recolorSelection}
          >
            Apply color to text
          </Button>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
            Size
            <Input
              type="number"
              min={2}
              max={80}
              value={brushSize}
              onChange={(e) =>
                setBrushSize(Math.max(2, Math.min(80, Number(e.target.value) || 10)))
              }
              className="h-7 w-16 shadow-none"
            />
          </label>
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 items-center justify-center overflow-auto bg-gray-100 p-4",
            loading && "opacity-60",
          )}
        >
          <canvas ref={canvasElRef} className="rounded-md shadow-sm" />
        </div>

        <DialogFooter className="border-t border-border px-4 py-3 sm:justify-between">
          <p className="text-[12px] text-muted-foreground">
            Double‑click text to edit wording.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!ready || loading}
              onClick={handleSave}
            >
              Save edits
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
