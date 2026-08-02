export const WHITEBOARD_STORAGE_KEY = "fgg.whiteboard.v1";

const DB_NAME = "fgg-whiteboard";
const DB_VERSION = 1;
const STORE_NAME = "scenes";
const SCENE_ID = "main";

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

function normalizeScene(raw: unknown): WhiteboardScene {
  if (!raw || typeof raw !== "object") return emptyScene();
  const parsed = raw as Partial<WhiteboardScene>;
  return {
    version: 1,
    elements: Array.isArray(parsed.elements) ? parsed.elements : [],
    appState:
      parsed.appState && typeof parsed.appState === "object"
        ? parsed.appState
        : { viewBackgroundColor: "#ffffff" },
    files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
    updatedAt:
      typeof parsed.updatedAt === "string"
        ? parsed.updatedAt
        : new Date().toISOString(),
  };
}

function slimAppState(appState: Record<string, unknown>): Record<string, unknown> {
  return {
    viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
    currentItemFontFamily: appState.currentItemFontFamily,
    gridSize: appState.gridSize,
    zoom: appState.zoom,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
  };
}

/** Drop deleted elements so saves stay smaller (undo history resets on reload). */
function compactElements(elements: readonly unknown[]): unknown[] {
  return elements.filter((el) => {
    if (!el || typeof el !== "object") return false;
    return !(el as { isDeleted?: boolean }).isDeleted;
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function idbGet(db: IDBDatabase): Promise<WhiteboardScene | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SCENE_ID);
    req.onsuccess = () => {
      resolve(req.result ? normalizeScene(req.result) : null);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
  });
}

function idbPut(db: IDBDatabase, scene: WhiteboardScene): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(scene, SCENE_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
}

function loadFromLocalStorage(): WhiteboardScene | null {
  try {
    const raw = localStorage.getItem(WHITEBOARD_STORAGE_KEY);
    if (!raw) return null;
    return normalizeScene(JSON.parse(raw));
  } catch {
    return null;
  }
}

function clearLocalStorageCopy(): void {
  try {
    localStorage.removeItem(WHITEBOARD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function loadWhiteboard(): Promise<WhiteboardScene> {
  try {
    const db = await openDb();
    const fromIdb = await idbGet(db);
    if (fromIdb) return fromIdb;

    const fromLs = loadFromLocalStorage();
    if (fromLs) {
      await idbPut(db, fromLs);
      clearLocalStorageCopy();
      return fromLs;
    }
  } catch (err) {
    console.error("[whiteboard] load failed", err);
    const fromLs = loadFromLocalStorage();
    if (fromLs) return fromLs;
  }
  return emptyScene();
}

export async function saveWhiteboard(scene: {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}): Promise<boolean> {
  const payload: WhiteboardScene = {
    version: 1,
    elements: compactElements(scene.elements),
    appState: slimAppState(scene.appState),
    files: scene.files ?? {},
    updatedAt: new Date().toISOString(),
  };

  try {
    const db = await openDb();
    await idbPut(db, payload);
    // Free old localStorage quota if a prior version left a huge blob there.
    clearLocalStorageCopy();
    return true;
  } catch (err) {
    console.error("[whiteboard] save failed", err);
    // Last resort: elements-only (no image files) into localStorage.
    try {
      const light: WhiteboardScene = { ...payload, files: {} };
      localStorage.setItem(WHITEBOARD_STORAGE_KEY, JSON.stringify(light));
      return true;
    } catch (lsErr) {
      console.error("[whiteboard] localStorage fallback failed", lsErr);
      return false;
    }
  }
}

export async function clearWhiteboard(): Promise<boolean> {
  return saveWhiteboard({
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  });
}
