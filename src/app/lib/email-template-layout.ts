/** Visual email layout → HTML for Klaviyo (free-drag canvas). */

export type BlockAlign = "left" | "center" | "right";

export type BlockFrame = {
  x: number;
  y: number;
  w: number;
  /** Used for images; text/buttons auto-size height in the editor. */
  h: number;
};

type BlockBase = {
  id: string;
  frame: BlockFrame;
  z: number;
};

export type EmailBlock =
  | (BlockBase & {
      type: "image";
      src: string;
      alt: string;
      href?: string;
    })
  | (BlockBase & {
      type: "heading";
      text: string;
      align: BlockAlign;
      color: string;
      fontSize: number;
    })
  | (BlockBase & {
      type: "text";
      text: string;
      align: BlockAlign;
      color: string;
      fontSize: number;
    })
  | (BlockBase & {
      type: "button";
      label: string;
      href: string;
      align: BlockAlign;
      bg: string;
      color: string;
    });

export type EmailLayout = {
  version: 2;
  mode: "canvas";
  width: number;
  height: number;
  background: string;
  cardBackground: string;
  blocks: EmailBlock[];
};

/** Legacy stacked layout (pre free-drag). */
type LegacyLayoutV1 = {
  version: 1;
  background: string;
  cardBackground: string;
  blocks: Array<Record<string, unknown>>;
};

export const LAYOUT_MARKER = "fgg-email-layout:";
export const CANVAS_WIDTH = 600;
export const DEFAULT_CANVAS_HEIGHT = 820;

export function newBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultLayout(): EmailLayout {
  return {
    version: 2,
    mode: "canvas",
    width: CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
    background: "#f4f4f4",
    cardBackground: "#ffffff",
    blocks: [
      {
        id: newBlockId(),
        type: "image",
        src: "",
        alt: "Hero",
        frame: { x: 0, y: 0, w: CANVAS_WIDTH, h: 320 },
        z: 1,
      },
      {
        id: newBlockId(),
        type: "heading",
        text: "New drop",
        align: "center",
        color: "#111111",
        fontSize: 28,
        frame: { x: 40, y: 350, w: 520, h: 48 },
        z: 2,
      },
      {
        id: newBlockId(),
        type: "text",
        text: "Hey {{ first_name|default:'there' }},\n\nWrite your message here.",
        align: "left",
        color: "#333333",
        fontSize: 16,
        frame: { x: 40, y: 410, w: 520, h: 100 },
        z: 3,
      },
      {
        id: newBlockId(),
        type: "button",
        label: "Shop now",
        href: "https://example.com",
        align: "center",
        bg: "#111111",
        color: "#ffffff",
        frame: { x: 200, y: 540, w: 200, h: 48 },
        z: 4,
      },
    ],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br />");
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64Utf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function encodeLayout(layout: EmailLayout): string {
  return `<!-- ${LAYOUT_MARKER}${toBase64Utf8(JSON.stringify(layout))} -->`;
}

function migrateV1(legacy: LegacyLayoutV1): EmailLayout {
  const base = createDefaultLayout();
  base.background = legacy.background || base.background;
  base.cardBackground = legacy.cardBackground || base.cardBackground;
  let y = 24;
  const blocks: EmailBlock[] = [];
  let z = 1;
  for (const raw of legacy.blocks || []) {
    const type = String(raw.type || "");
    const id = typeof raw.id === "string" ? raw.id : newBlockId();
    if (type === "image") {
      const h = raw.fullBleed ? 300 : 220;
      blocks.push({
        id,
        type: "image",
        src: String(raw.src || ""),
        alt: String(raw.alt || "Image"),
        href: typeof raw.href === "string" ? raw.href : undefined,
        frame: { x: 0, y, w: CANVAS_WIDTH, h },
        z: z++,
      });
      y += h + 12;
    } else if (type === "heading") {
      blocks.push({
        id,
        type: "heading",
        text: String(raw.text || "Headline"),
        align: (raw.align as BlockAlign) || "center",
        color: String(raw.color || "#111111"),
        fontSize: 28,
        frame: { x: 40, y, w: 520, h: 48 },
        z: z++,
      });
      y += 56;
    } else if (type === "text") {
      blocks.push({
        id,
        type: "text",
        text: String(raw.text || ""),
        align: (raw.align as BlockAlign) || "left",
        color: String(raw.color || "#333333"),
        fontSize: 16,
        frame: { x: 40, y, w: 520, h: 90 },
        z: z++,
      });
      y += 100;
    } else if (type === "button") {
      blocks.push({
        id,
        type: "button",
        label: String(raw.label || "Shop now"),
        href: String(raw.href || "https://"),
        align: (raw.align as BlockAlign) || "center",
        bg: String(raw.bg || "#111111"),
        color: String(raw.color || "#ffffff"),
        frame: { x: 200, y, w: 200, h: 48 },
        z: z++,
      });
      y += 64;
    } else if (type === "spacer") {
      y += Math.max(8, Number(raw.height) || 24);
    } else if (type === "divider") {
      y += 24;
    }
  }
  base.blocks = blocks.length ? blocks : base.blocks;
  base.height = Math.max(DEFAULT_CANVAS_HEIGHT, y + 80);
  return base;
}

function normalizeLayout(parsed: unknown): EmailLayout | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.version === 1 && Array.isArray(obj.blocks)) {
    return migrateV1(obj as LegacyLayoutV1);
  }
  if (obj.version === 2 && Array.isArray(obj.blocks)) {
    const layout = obj as EmailLayout;
    if (!layout.mode) layout.mode = "canvas";
    if (!layout.width) layout.width = CANVAS_WIDTH;
    if (!layout.height) layout.height = DEFAULT_CANVAS_HEIGHT;
    // Ensure frames exist on every block
    layout.blocks = layout.blocks.map((b, i) => {
      if (b.frame && typeof b.frame.x === "number") return b;
      return {
        ...b,
        frame: { x: 40, y: 40 + i * 80, w: 520, h: 60 },
        z: typeof b.z === "number" ? b.z : i + 1,
      };
    });
    return layout;
  }
  return null;
}

export function parseLayoutFromHtml(html: string | null | undefined): EmailLayout | null {
  if (!html) return null;
  const re = new RegExp(
    `<!--\\s*${LAYOUT_MARKER.replace(/-/g, "\\-")}([A-Za-z0-9+/=]+)\\s*-->`,
  );
  const m = html.match(re);
  if (!m?.[1]) return null;
  try {
    return normalizeLayout(JSON.parse(fromBase64Utf8(m[1])));
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clampFrame(
  frame: BlockFrame,
  canvasW: number,
  canvasH: number,
): BlockFrame {
  const w = clamp(frame.w, 40, canvasW);
  const h = clamp(frame.h, 24, canvasH);
  const x = clamp(frame.x, 0, Math.max(0, canvasW - w));
  const y = clamp(frame.y, 0, Math.max(0, canvasH - 20));
  return { x, y, w, h };
}

export const DEFAULT_SNAP_THRESHOLD = 8;

export type SnapGuides = {
  vertical: number[];
  horizontal: number[];
};

/** Snap a moving frame to canvas edges/centers and other blocks. */
export function snapFrameMove(
  frame: BlockFrame,
  others: BlockFrame[],
  canvasW: number,
  canvasH: number,
  threshold = DEFAULT_SNAP_THRESHOLD,
): { frame: BlockFrame; guides: SnapGuides } {
  const xTargets = [0, canvasW / 2, canvasW];
  const yTargets = [0, canvasH / 2, canvasH];
  for (const o of others) {
    xTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
    yTargets.push(o.y, o.y + o.h / 2, o.y + o.h);
  }

  const edgesX = [
    { value: frame.x, apply: (t: number) => t },
    { value: frame.x + frame.w / 2, apply: (t: number) => t - frame.w / 2 },
    { value: frame.x + frame.w, apply: (t: number) => t - frame.w },
  ];
  const edgesY = [
    { value: frame.y, apply: (t: number) => t },
    { value: frame.y + frame.h / 2, apply: (t: number) => t - frame.h / 2 },
    { value: frame.y + frame.h, apply: (t: number) => t - frame.h },
  ];

  let bestX: { dist: number; x: number; guide: number } | null = null;
  for (const edge of edgesX) {
    for (const t of xTargets) {
      const dist = Math.abs(edge.value - t);
      if (dist <= threshold && (!bestX || dist < bestX.dist)) {
        bestX = { dist, x: edge.apply(t), guide: t };
      }
    }
  }

  let bestY: { dist: number; y: number; guide: number } | null = null;
  for (const edge of edgesY) {
    for (const t of yTargets) {
      const dist = Math.abs(edge.value - t);
      if (dist <= threshold && (!bestY || dist < bestY.dist)) {
        bestY = { dist, y: edge.apply(t), guide: t };
      }
    }
  }

  const next = {
    ...frame,
    x: bestX ? bestX.x : frame.x,
    y: bestY ? bestY.y : frame.y,
  };
  return {
    frame: clampFrame(next, canvasW, canvasH),
    guides: {
      vertical: bestX ? [bestX.guide] : [],
      horizontal: bestY ? [bestY.guide] : [],
    },
  };
}

/** Snap resize (bottom-right) to canvas/other block edges. */
export function snapFrameResize(
  frame: BlockFrame,
  others: BlockFrame[],
  canvasW: number,
  canvasH: number,
  threshold = DEFAULT_SNAP_THRESHOLD,
): { frame: BlockFrame; guides: SnapGuides } {
  const rightTargets = [canvasW, canvasW / 2];
  const bottomTargets = [canvasH, canvasH / 2];
  for (const o of others) {
    rightTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
    bottomTargets.push(o.y, o.y + o.h / 2, o.y + o.h);
  }

  let w = frame.w;
  let h = frame.h;
  const guides: SnapGuides = { vertical: [], horizontal: [] };

  const right = frame.x + frame.w;
  let bestR: { dist: number; guide: number } | null = null;
  for (const t of rightTargets) {
    const dist = Math.abs(right - t);
    if (dist <= threshold && (!bestR || dist < bestR.dist)) {
      bestR = { dist, guide: t };
    }
  }
  if (bestR) {
    w = bestR.guide - frame.x;
    guides.vertical.push(bestR.guide);
  }

  const bottom = frame.y + frame.h;
  let bestB: { dist: number; guide: number } | null = null;
  for (const t of bottomTargets) {
    const dist = Math.abs(bottom - t);
    if (dist <= threshold && (!bestB || dist < bestB.dist)) {
      bestB = { dist, guide: t };
    }
  }
  if (bestB) {
    h = bestB.guide - frame.y;
    guides.horizontal.push(bestB.guide);
  }

  return {
    frame: clampFrame({ ...frame, w, h }, canvasW, canvasH),
    guides,
  };
}

function renderCanvasBlock(block: EmailBlock): string {
  const { x, y, w, h } = block.frame;
  const wrap = (inner: string, extra = "") =>
    `<div style="position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;width:${Math.round(w)}px;z-index:${block.z};${extra}">${inner}</div>`;

  switch (block.type) {
    case "image": {
      if (!block.src.trim()) {
        return wrap(
          `<div style="height:${Math.round(h)}px;background:#f0f0f0;color:#999;font-size:13px;display:flex;align-items:center;justify-content:center;font-family:Helvetica,Arial,sans-serif;">Add a photo</div>`,
        );
      }
      const img = `<img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || "")}" width="${Math.round(w)}" height="${Math.round(h)}" style="display:block;width:100%;height:${Math.round(h)}px;object-fit:cover;border:0;" />`;
      const inner = block.href?.trim()
        ? `<a href="${escapeHtml(block.href.trim())}" target="_blank" style="text-decoration:none;">${img}</a>`
        : img;
      return wrap(inner);
    }
    case "heading":
      return wrap(
        `<h1 style="margin:0;font-size:${block.fontSize || 28}px;line-height:1.25;font-weight:700;color:${escapeHtml(block.color)};text-align:${block.align};font-family:Helvetica,Arial,sans-serif;">${nl2br(block.text)}</h1>`,
      );
    case "text":
      return wrap(
        `<p style="margin:0;font-size:${block.fontSize || 16}px;line-height:1.55;color:${escapeHtml(block.color)};text-align:${block.align};font-family:Helvetica,Arial,sans-serif;">${nl2br(block.text)}</p>`,
      );
    case "button":
      return wrap(
        `<a href="${escapeHtml(block.href || "#")}" target="_blank" style="display:inline-block;padding:12px 22px;background:${escapeHtml(block.bg)};color:${escapeHtml(block.color)};text-decoration:none;font-size:14px;font-weight:600;font-family:Helvetica,Arial,sans-serif;border-radius:4px;text-align:center;width:100%;box-sizing:border-box;">${escapeHtml(block.label || "Shop now")}</a>`,
        "text-align:center;",
      );
    default:
      return "";
  }
}

export function compileLayoutToHtml(layout: EmailLayout): string {
  const width = layout.width || CANVAS_WIDTH;
  const height = layout.height || DEFAULT_CANVAS_HEIGHT;
  const sorted = [...layout.blocks].sort((a, b) => a.z - b.z);
  const layers = sorted.map(renderCanvasBlock).join("\n");

  return `${encodeLayout(layout)}
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Email</title>
  </head>
  <body style="margin:0;padding:0;background:${escapeHtml(layout.background)};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${escapeHtml(layout.background)};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="${width}" cellspacing="0" cellpadding="0" style="width:100%;max-width:${width}px;background:${escapeHtml(layout.cardBackground)};">
            <tr>
              <td style="padding:0;">
                <!--[if !mso]><!-- -->
                <div style="position:relative;width:100%;max-width:${width}px;height:${height}px;background:${escapeHtml(layout.cardBackground)};overflow:hidden;">
                  ${layers}
                </div>
                <!--<![endif]-->
                <!--[if mso]>
                <table role="presentation" width="${width}" cellspacing="0" cellpadding="0"><tr><td style="padding:24px;font-family:Arial,sans-serif;font-size:14px;color:#333;">
                  Open this email in Apple Mail, Gmail (web/app), or iOS Mail for the designed layout.
                </td></tr></table>
                <![endif]-->
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 24px;background:${escapeHtml(layout.cardBackground)};text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.4;color:#888;font-family:Helvetica,Arial,sans-serif;">
                  {% unsubscribe %}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
