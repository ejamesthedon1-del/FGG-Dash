"""FGG / Livdon brand-photographer mockup pipeline (fal Kontext + logo stamp)."""

from __future__ import annotations

import io
import json
import os
import re
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

# Locked clothing-swap prompt (agreed with user) — primary instruction every generate.
CLOTHING_SWAP_BRIEF = """
ONE RULE: You are only changing the model's clothes. Completely swap the clothing on the inspiration model for our uploaded product. Nothing else changes.

What you are doing:
- Inspiration = the scene, model, pose, lighting, camera, and background to keep.
- Product = the exact garment that replaces what is on the model — every time.
- Result = same photo, same person, new clothes only.

Image roles (strict):
1) Inspiration — final scene: model, pose, lighting, camera, background. Keep all of this.
2) Product — the exact item that replaces the inspiration clothing. From the product ONLY: hoodie color, logo/paint/print placement, construction, silhouette. Always use this product as the replacement garment — never invent another.
3) Fabric (if present) — textile reference only: material type / hand / nap. NOT for color, logo, or paint. Never let fabric override product design.

Swap instructions:
- Identify the clothing on the inspiration model.
- Remove it.
- Put our product on that same body in that same pose.
- Preserve ALL product details while placing it into the inspiration scenery and lighting.
- Drape it realistically for this pose and camera angle.

Do not:
- Restage the photo
- Change the model
- Change lighting or background
- Redesign or reinterpret the product
- Pull hoodie color, logo, or paint from the fabric refs
""".strip()

# Back-compat alias for API responses
BRAND_PHOTOGRAPHER_BRIEF = CLOTHING_SWAP_BRIEF

DEEP_ANALYSIS_PROMPT = """
You are briefing FGG's brand photographer for a garment swap edit.

Images (in order):
1) INSPIRATION — target scene / model / lighting / pose (the desired OUTCOME frame)
2+) PRODUCT and optional fabric/logo refs — the real garment to put on the model

Deeply analyze and return ONLY valid JSON (no markdown) with this shape:
{
  "inspiration": {
    "lighting": "specific lighting description to preserve",
    "camera": "lens / distance / angle feel",
    "pose": "body pose and orientation",
    "framing": "crop and composition",
    "model": "identity cues to preserve (face, hair, proportions)"
  },
  "product": {
    "garment": "type + silhouette",
    "base_color": "exact base color",
    "print": "paint/print details — colors, density, placement",
    "construction": "hood, pocket, cords, seams, fit",
    "logo_color": "white|cream|black|other",
    "logo_cx_pct": 0-100 number — horizontal center of logo on THIS product photo (0=left, 100=right),
    "logo_cy_pct": 0-100 number — vertical center of logo on THIS product photo (0=top, 100=bottom),
    "logo_width_pct": 0-100 number — logo width as % of product image width
  },
  "transfer_plan": "2-4 sentences: how to put THIS product on THIS pose with correct drape and perspective while keeping inspiration lighting/camera"
}

Be precise. If logo is not visible, still estimate typical left-chest placement on the product image.
""".strip()

CHEST_ANCHOR_PROMPT = """
This is a photoreal hoodie photo where the chest logo area should be blank or nearly blank.
Return ONLY JSON (no markdown):
{"cx_pct": number, "cy_pct": number, "width_pct": number}
cx_pct/cy_pct = center of wearer's LEFT CHEST logo placement on THIS image (0-100).
width_pct = recommended logo width as % of full image width for a real brand mark on this pose.
Use the garment folds and pocket to place it naturally — not floating.
""".strip()


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            return {}
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}


def _vision_json(
    *,
    prompt: str,
    image_urls: Sequence[str],
    fal_key: str | None,
    system: str,
) -> dict[str, Any]:
    urls = [u for u in image_urls if u][:4]
    if not urls:
        return {}
    _ensure_fal_key(fal_key)
    import fal_client

    try:
        result = fal_client.subscribe(
            "fal-ai/any-llm/vision",
            arguments={
                "model": "google/gemini-2.5-flash",
                "prompt": prompt,
                "system_prompt": system,
                "image_urls": list(urls),
                "priority": "latency",
            },
            with_logs=False,
        )
    except Exception:
        return {}

    payload = result if isinstance(result, dict) else {}
    for key in ("output", "response", "text", "answer", "caption"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return _extract_json(val)
    return {}


def deep_analyze_shoot(
    *,
    inspiration_url: str,
    product_urls: Sequence[str],
    fabric_urls: Sequence[str] | None = None,
    fal_key: str | None = None,
) -> dict[str, Any]:
    """Deep vision brief: inspiration + product (+ fabric) → structured transfer plan."""
    urls: list[str] = [inspiration_url]
    urls.extend([u for u in product_urls if u])
    for u in fabric_urls or []:
        if u and len(urls) < 4:
            urls.append(u)
    analysis = _vision_json(
        prompt=DEEP_ANALYSIS_PROMPT,
        image_urls=urls,
        fal_key=fal_key,
        system=(
            "You are a senior fashion photo director. Return strict JSON only. "
            "Prioritize lighting match, proportion lock, and exact product fidelity."
        ),
    )
    return analysis


def build_prompt(
    *,
    fabric_count: int,
    product_count: int,
    logo_count: int,
    notes: str | None,
    analysis: dict[str, Any] | None = None,
) -> str:
    """Clothing-swap prompt only — image indices mapped to roles."""
    # Order sent to Kontext: [inspiration, ...products, ...logos, ...fabrics]
    idx = 1
    insp_idx = idx
    idx += 1
    product_indices = list(range(idx, idx + product_count))
    idx += product_count
    logo_indices = list(range(idx, idx + logo_count))
    idx += logo_count
    fabric_indices = list(range(idx, idx + fabric_count))

    parts: list[str] = [
        CLOTHING_SWAP_BRIEF,
        f"Image #{insp_idx} is INSPIRATION (keep scene, model, pose, lighting, camera, background).",
    ]

    if product_indices:
        refs = ", ".join(f"#{i}" for i in product_indices)
        parts.append(
            f"Image(s) {refs} are PRODUCT — completely swap the inspiration clothing "
            "for this exact item. Preserve all product details (color, paint/print, "
            "construction, silhouette). This product always replaces the inspiration garment."
        )
    else:
        parts.append(
            "No product image was provided — do not invent a garment; keep inspiration clothing."
        )

    if logo_indices:
        refs = ", ".join(f"#{i}" for i in logo_indices)
        parts.append(
            f"Image(s) {refs} are extra product/logo placement reference — still use PRODUCT "
            "as the garment; do not redesign from these alone."
        )

    if fabric_indices:
        refs = ", ".join(f"#{i}" for i in fabric_indices)
        parts.append(
            f"Image(s) {refs} are FABRIC textile reference only (material/hand/nap). "
            "Do not take hoodie color, logo, or paint from fabric."
        )

    # Logo stamp still happens after generate — keep chest from getting AI gibberish text.
    parts.append(
        "Leave the chest logo letterforms clear of invented AI text if possible; "
        "product paint/print elsewhere must stay exact."
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


def _guess_logo_rgb(analysis: dict[str, Any] | None, notes: str | None) -> tuple[int, int, int]:
    prod = (analysis or {}).get("product") if isinstance((analysis or {}).get("product"), dict) else {}
    color = str(prod.get("logo_color") or "").lower()
    text = f"{color} {notes or ''}".lower()
    if "black" in text or "dark" in text:
        return (18, 18, 18)
    if "cream" in text or "ivory" in text or "off-white" in text:
        return (245, 240, 230)
    return (252, 252, 252)


def _clamp_pct(value: Any, default: float) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(100.0, n))


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
            luminance = (r + g + b) / 3
            ink = max(0, min(255, int(255 - luminance)))
            if ink < 28:
                continue
            alpha = min(255, int(ink * (a / 255)))
            out_px[x, y] = (*logo_rgb, alpha)
    return out


def resolve_logo_placement(
    *,
    result_url: str,
    analysis: dict[str, Any] | None,
    fal_key: str | None,
) -> tuple[float, float, float]:
    """Return (cx_pct, cy_pct, width_pct) for compositing on the generated frame."""
    prod = (analysis or {}).get("product") if isinstance((analysis or {}).get("product"), dict) else {}
    # Prefer product photo placement as the brand truth for size; refine center on result.
    prod_w = _clamp_pct(prod.get("logo_width_pct"), 16.0)
    prod_cx = _clamp_pct(prod.get("logo_cx_pct"), 62.0)
    prod_cy = _clamp_pct(prod.get("logo_cy_pct"), 36.0)

    anchor = _vision_json(
        prompt=CHEST_ANCHOR_PROMPT,
        image_urls=[result_url],
        fal_key=fal_key,
        system="Return JSON only for logo placement on this hoodie photo.",
    )
    if anchor:
        cx = _clamp_pct(anchor.get("cx_pct"), prod_cx)
        cy = _clamp_pct(anchor.get("cy_pct"), prod_cy)
        # Keep product logo scale unless result suggests something sane
        w = _clamp_pct(anchor.get("width_pct"), prod_w)
        w = max(10.0, min(22.0, w if 8 <= w <= 28 else prod_w))
        return cx, cy, w

    return prod_cx, prod_cy, max(10.0, min(22.0, prod_w))


def composite_livdon_logo(
    image_url: str,
    *,
    analysis: dict[str, Any] | None = None,
    notes: str | None = None,
    fal_key: str | None = None,
) -> str:
    """Stamp the real Livdon wordmark using product-matched placement."""
    from PIL import Image

    _ensure_fal_key(fal_key)
    resp = httpx.get(image_url, timeout=90.0, follow_redirects=True)
    resp.raise_for_status()
    base = Image.open(io.BytesIO(resp.content)).convert("RGBA")
    bw, bh = base.size

    cx_pct, cy_pct, width_pct = resolve_logo_placement(
        result_url=image_url,
        analysis=analysis,
        fal_key=fal_key,
    )

    mark = _wordmark_rgba(_guess_logo_rgb(analysis, notes))
    target_w = max(40, int(bw * (width_pct / 100.0)))
    ratio = target_w / mark.width
    target_h = max(14, int(mark.height * ratio))
    mark = mark.resize((target_w, target_h), Image.Resampling.LANCZOS)

    x = int(bw * (cx_pct / 100.0)) - target_w // 2
    y = int(bh * (cy_pct / 100.0)) - target_h // 2
    x = max(0, min(bw - target_w, x))
    y = max(0, min(bh - target_h, y))

    layered = base.copy()
    layered.alpha_composite(mark, (x, y))
    rgb = layered.convert("RGB")
    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=95)
    return upload_bytes(buf.getvalue(), "mockup-with-livdon.jpg", "image/jpeg", fal_key)


def generate_mockup(
    *,
    image_urls: Sequence[str],
    prompt: str,
    aspect_ratio: str = "3:4",
    num_images: int = 1,
    fal_key: str | None = None,
    analysis: dict[str, Any] | None = None,
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
                    analysis=analysis,
                    notes=notes,
                    fal_key=fal_key,
                )
            except Exception:
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


def analysis_summary(analysis: dict[str, Any] | None) -> str:
    if not analysis:
        return ""
    return json.dumps(analysis, ensure_ascii=False)[:2500]
