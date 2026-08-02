"use client";

import * as React from "react";
import { Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";

import "@excalidraw/excalidraw/index.css";

import {
  clearWhiteboard,
  loadWhiteboard,
  saveWhiteboard,
  type WhiteboardScene,
} from "../lib/whiteboard-storage";
import { Button } from "./ui/button";

const Excalidraw = React.lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  return { default: mod.Excalidraw };
});

export function WhiteboardPage() {
  const [initial, setInitial] = React.useState<WhiteboardScene | null>(null);
  const saveTimer = React.useRef<number | null>(null);
  const saveErrorShown = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const scene = await loadWhiteboard();
      if (!cancelled) setInitial(scene);
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const onChange = React.useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void (async () => {
          const ok = await saveWhiteboard({ elements, appState, files });
          if (!ok && !saveErrorShown.current) {
            saveErrorShown.current = true;
            toast.error(
              "Could not save whiteboard. Try removing large images or clearing the board.",
            );
          }
          if (ok) saveErrorShown.current = false;
        })();
      }, 600);
    },
    [],
  );

  const onClear = () => {
    if (
      !window.confirm("Clear the whole whiteboard? This can’t be undone.")
    ) {
      return;
    }
    void (async () => {
      await clearWhiteboard();
      window.location.reload();
    })();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div>
          <h1 className="text-[15px] font-medium text-foreground">Whiteboard</h1>
          <p className="text-[12px] text-muted-foreground">
            Sketch, map ideas, plan drops — autosaves in this browser
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onClear}
        >
          <Eraser className="size-3.5" />
          Clear
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        {!initial ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading board…
          </div>
        ) : (
          <React.Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading board…
              </div>
            }
          >
            <Excalidraw
              initialData={{
                elements: initial.elements as never,
                appState: {
                  ...initial.appState,
                  collaborators: new Map(),
                } as never,
                files: initial.files as never,
                scrollToContent: true,
              }}
              onChange={onChange as never}
              UIOptions={{
                canvasActions: {
                  loadScene: true,
                  export: { saveFileToDisk: true },
                  saveToActiveFile: false,
                },
              }}
            />
          </React.Suspense>
        )}
      </div>
    </div>
  );
}
