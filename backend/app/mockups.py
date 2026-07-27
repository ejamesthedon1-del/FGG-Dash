"""Photoreal clothing mockups via fal.ai FLUX Kontext multi + Livdon logo composite."""

from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Any, Optional, Sequence

import httpx

ALLOWED_ASPECT = {
    "21:9",
    "16:9",
    "4:3",
    "3:2",
    "1:1",
    "2:3",
    "3:4",
    "9:16",
    "9:21",
}

LIVDON_WORDMARK_PATH = Path(__file__).resolve().parent / "assets" / "livdon-wordmark.png"

LIVDON_WORDMARK_SPEC = (
    "LIVDON interlocking geometric wordmark (format fixed; color follows garment)."
)

GARMENT_ANALYSIS_PROMPT = """Analyze this garment photo for an exact product mockup.
Return a compact plain-text brief covering:
1) Garment type and base color
2) All-over print/pattern (paint splatter colors, density, placement) — be specific
3) Logo COLOR on this garment if any (white / cream / black) — placement left-chest or center
4) Construction: hood, pocket, drawcords, seams
No markdown. No preamble. Do not attempt to redraw letterforms."""


def build_prompt(
    *,
    fabric_count: int,
    product_count: int,
    logo_count: int,
    notes: str | None,
    design_brief: str | None = None,
) -> str:
    """Prompt focused on model fidelity + garment transfer. Logo is composited after."""
    # Image order: [inspiration, ...products, ...optional logo crop, ...fabrics]
    idx = 1
    insp_idx = idx
    idx += 1
    product_indices = list(range(idx, idx + product_count))
    idx += product_count
    logo_indices = list(range(idx, idx + logo_count))
    idx += logo_count
    fabric_indices = list(range(idx, idx + fabric_count))

    parts: list[str] = [
        "Photoreal fashion photo. This is an EDIT of image "
        f"#{insp_idx}, not a new photoshoot.",
        f"CRITICAL — preserve from image #{insp_idx} EXACTLY: the same person, "
        "face, age, hair, body proportions, height, limb length, head-to-body ratio, "
        "pose, camera distance, framing, and background. "
        "Do NOT shorten, enlarge, cartoon, or dwarf the model. "
        "Do NOT change the crop or camera angle.",
        "ONLY change the clothing to our garment.",
    ]

    if product_indices:
        refs = ", ".join(f"#{i}" for i in product_indices)
        parts.append(
            f"Dress them in the hoodie from image(s) {refs}: exact colorway, "
            "paint-splatter pattern, pocket, hood, drawcords, seams, and fit. "
            "Leave the LEFT CHEST (wearer's left / image right) CLEAR of any text, "
            "letters, or logo — a clean fabric area only. "
            "Do not invent chest text. The real logo will be added later."
        )

    if logo_indices:
        refs = ", ".join(f"#{i}" for i in logo_indices)
        parts.append(
            f"Image(s) {refs} are placement/color reference only — still leave the "
            "chest text area blank for post compositing."
        )

    if fabric_indices:
        refs = ", ".join(f"#{i}" for i in fabric_indices)
        parts.append(
            f"Image(s) {refs} are fabric texture only — material feel, never override "
            "the product print pattern."
        )

    brief = (design_brief or "").strip()
    if brief:
        parts.append("Garment details: " + brief)

    parts.append(
        "Natural skin and fabric microdetail. No CGI, no watermark, no invented logos."
    )

    cleaned = (notes or "").strip()
    if cleaned:
        parts.append(f"Designer notes: {cleaned}")

    return " ".join(parts)


def _ensure_fal_key(fal_key: str | None) -> str:
    key = (fal_key or os.environ.get("FAL_KEY") or "").strip()
    if not key:
        raise RuntimeError(
            "FAL_KEY is not configured. Add it to the backend environment "
            "(Railway / backend/.env) to generate mockups."
        )
    os.environ["FAL_KEY"] = key
    return key


def upload_bytes(data: bytes, filename: str, content_type: str, fal_key: str | None) -> str:
    _ensure_fal_key(fal_key)
    import fal_client

    url = fal_client.upload(data, content_type or "image/jpeg")
    if not url:
        raise RuntimeError(f"fal upload failed for {filename or 'image'}")
    return str(url)


def analyze_garment_design(
    image_urls: Sequence[str],
    fal_key: str | None = None,
) -> str:
    urls = [u for u in image_urls if u]
    if not urls:
        return ""
    _ensure_fal_key(fal_key)
    import fal_client

    try:
        result = fal_client.subscribe(
            "fal-ai/any-llm/vision",
            arguments={
                "model": "google/gemini-2.5-flash",
                "prompt": GARMENT_ANALYSIS_PROMPT,
                "system_prompt": (
                    "Extract garment print and logo COLOR/placement only. No markdown."
                ),
                "image_urls": list(urls)[:3],
                "priority": "latency",
            },
            with_logs=False,
        )
    except Exception:
        return ""

    payload = result if isinstance(result, dict) else {}
    for key in ("output", "response", "text", "answer", "caption"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:900]
    return ""


def _guess_logo_rgb(design_brief: str | None, notes: str | None) -> tuple[int, int, int]:
    text = f"{design_brief or ''} {notes or ''}".lower()
    if any(w in text for w in ("black logo", "logo black", "dark logo")):
        return (20, 20, 20)
    if any(w in text for w in ("cream", "off-white", "ivory")):
        return (245, 240, 230)
    # Default for navy / dark hoodies
    return (250, 250, 250)


def _wordmark_rgba(logo_rgb: tuple[int, int, int]):
    from PIL import Image

    if not LIVDON_WORDMARK_PATH.is_file():
        raise RuntimeError(f"Missing Livdon wordmark at {LIVDON_WORDMARK_PATH}")
    src = Image.open(LIVDON_WORDMARK_PATH).convert("RGBA")
    pixels = src.load()
    assert pixels is not None
    w, h = src.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_px = out.load()
    assert out_px is not None
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Dark ink on light bg (or inverse) → opacity from darkness
            luminance = (r + g + b) / 3
            # Treat darker pixels as logo ink
            ink = max(0, min(255, int(255 - luminance)))
            if ink < 28:
                continue
            alpha = min(255, int(ink * (a / 255)))
            out_px[x, y] = (*logo_rgb, alpha)
    return out


def composite_livdon_logo(
    image_url: str,
    *,
    design_brief: str | None = None,
    notes: str | None = None,
    fal_key: str | None = None,
) -> str:
    """Paste the real Livdon wordmark onto wearer's left chest; re-upload to fal."""
    from PIL import Image

    _ensure_fal_key(fal_key)
    resp = httpx.get(image_url, timeout=90.0, follow_redirects=True)
    resp.raise_for_status()
    base = Image.open(io.BytesIO(resp.content)).convert("RGBA")
    bw, bh = base.size

    mark = _wordmark_rgba(_guess_logo_rgb(design_brief, notes))
    # ~16% of frame width — typical left-chest brand mark
    target_w = max(48, int(bw * 0.16))
    ratio = target_w / mark.width
    target_h = max(16, int(mark.height * ratio))
    mark = mark.resize((target_w, target_h), Image.Resampling.LANCZOS)

    # Wearer's left chest ≈ viewer's right on a front-facing shot
    x = int(bw * 0.58) - target_w // 2
    y = int(bh * 0.36) - target_h // 2
    x = max(0, min(bw - target_w, x))
    y = max(0, min(bh - target_h, y))

    layered = base.copy()
    layered.alpha_composite(mark, (x, y))
    rgb = layered.convert("RGB")
    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=94)
    return upload_bytes(buf.getvalue(), "mockup-with-livdon.jpg", "image/jpeg", fal_key)


def generate_mockup(
    *,
    image_urls: Sequence[str],
    prompt: str,
    aspect_ratio: str = "3:4",
    num_images: int = 1,
    fal_key: str | None = None,
    design_brief: str | None = None,
    notes: str | None = None,
    composite_logo: bool = True,
) -> dict[str, Any]:
    _ensure_fal_key(fal_key)
    import fal_client

    ratio = aspect_ratio if aspect_ratio in ALLOWED_ASPECT else "3:4"
    count = max(1, min(int(num_images or 1), 2))

    result = fal_client.subscribe(
        "fal-ai/flux-pro/kontext/multi",
        arguments={
            "prompt": prompt,
            "image_urls": list(image_urls),
            "num_images": count,
            "aspect_ratio": ratio,
            "output_format": "jpeg",
            "safety_tolerance": "2",
            # Keep closer to inspiration; high CFG was warping proportions
            "guidance_scale": 3.5,
            "enhance_prompt": False,
        },
        with_logs=False,
    )

    payload = result if isinstance(result, dict) else {}
    raw_images = payload.get("images") or []
    images_out: list[dict[str, Any]] = []
    for img in raw_images:
        if not isinstance(img, dict) or not img.get("url"):
            continue
        url = str(img["url"])
        if composite_logo:
            try:
                url = composite_livdon_logo(
                    url,
                    design_brief=design_brief,
                    notes=notes,
                    fal_key=fal_key,
                )
            except Exception:
                # Keep raw generation if composite fails
                pass
        images_out.append(
            {
                "url": url,
                "contentType": "image/jpeg",
                "width": img.get("width"),
                "height": img.get("height"),
            }
        )

    if not images_out:
        raise RuntimeError("fal returned no images")

    return {
        "images": images_out,
        "prompt": payload.get("prompt") or prompt,
        "seed": payload.get("seed"),
        "logoComposited": composite_logo,
    }


def normalize_aspect(value: Optional[str]) -> str:
    v = (value or "3:4").strip()
    return v if v in ALLOWED_ASPECT else "3:4"
