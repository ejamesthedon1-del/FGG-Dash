import { writeLocalAndSync } from "@/lib/synced-storage";

export const WHITEBOARD_STORAGE_KEY = "fgg.whiteboard.v1";

export type WhiteboardScene = {
  version: 1;
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  updatedAt: string;
};

function emptyScene(): WhiteboardScene {
  return {
    version: 1,
    elements: [],
    appState: {
      viewBackgroundColor: "#ffffff",
    },
    files: {},
    updatedAt: new Date().toISOString(),
  };
}

export function loadWhiteboard(): WhiteboardScene {
  try {
    const raw = localStorage.getItem(WHITEBOARD_STORAGE_KEY);
    if (!raw) return emptyScene();
    const parsed = JSON.parse(raw) as Partial<WhiteboardScene>;
    if (!parsed || typeof parsed !== "object") return emptyScene();
    return {
      version: 1,
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState:
        parsed.appState && typeof parsed.appState === "object"
          ? parsed.appState
          : { viewBackgroundColor: "#ffffff" },
      files:
        parsed.files && typeof parsed.files === "object" ? parsed.files : {},
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return emptyScene();
  }
}

export function saveWhiteboard(scene: {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}): boolean {
  const payload: WhiteboardScene = {
    version: 1,
    elements: scene.elements,
    appState: {
      viewBackgroundColor: scene.appState.viewBackgroundColor ?? "#ffffff",
      currentItemFontFamily: scene.appState.currentItemFontFamily,
      gridSize: scene.appState.gridSize,
    },
    files: scene.files,
    updatedAt: new Date().toISOString(),
  };
  try {
    return writeLocalAndSync(WHITEBOARD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return false;
  }
}

export function clearWhiteboard(): boolean {
  return saveWhiteboard({
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  });
}
