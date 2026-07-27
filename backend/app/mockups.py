"""Photoreal clothing mockups via fal.ai FLUX Kontext multi."""

from __future__ import annotations

import os
from typing import Any, Optional, Sequence

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

GARMENT_ANALYSIS_PROMPT = """Analyze this garment photo for an exact product mockup.
Return a compact plain-text brief covering:
1) Garment type and base color
2) All-over print/pattern (paint splatter colors, density, placement) — be specific
3) LOGO / CHEST GRAPHIC — this is critical:
   - Exact letters/words if readable (spell carefully)
   - Font style (block, script, etc.)
   - Colors of the logo and any outline/fill
   - Placement (left chest, center, size relative to chest)
   - Do NOT invent text you cannot read; say "illegible" if unsure
4) Construction: hood, pocket, drawcords, seams
No markdown. No preamble."""


def build_prompt(
    *,
    fabric_count: int,
    product_count: int,
    logo_count: int,
    notes: str | None,
    design_brief: str | None = None,
) -> str:
    """Build a prompt that prioritizes exact product + logo fidelity."""
    # Image order: [inspiration, ...products, ...logos, ...fabrics]
    idx = 1
    insp_idx = idx
    idx += 1
    product_indices: list[int] = []
    for _ in range(product_count):
        product_indices.append(idx)
        idx += 1
    logo_indices: list[int] = []
    for _ in range(logo_count):
        logo_indices.append(idx)
        idx += 1
    fabric_indices: list[int] = []
    for _ in range(fabric_count):
        fabric_indices.append(idx)
        idx += 1

    parts: list[str] = [
        "Create a photoreal fashion photograph that looks shot on a real camera.",
        f"Keep the SAME person, face, hair, pose, framing, lighting, and background as image #{insp_idx}.",
        "Only change the clothing: dress them in our exact garment.",
    ]

    if product_indices:
        refs = ", ".join(f"#{i}" for i in product_indices)
        parts.append(
            f"The hoodie/garment to wear is in image(s) {refs}. "
            "Copy that product EXACTLY: colorway, paint splatter / distressing / graphics, "
            "pocket shape, hood, drawcords, seams, and silhouette."
        )

    if logo_indices:
        refs = ", ".join(f"#{i}" for i in logo_indices)
        parts.append(
            f"Image(s) {refs} are a CLOSE-UP of the logo/graphic. "
            "Reproduce that logo EXACTLY on the garment — same letterforms, spelling, "
            "colors, proportions, and left-chest placement. "
            "Do NOT redraw, stylize, glitch, or invent alternate letters."
        )
    elif product_indices:
        refs = ", ".join(f"#{i}" for i in product_indices)
        parts.append(
            f"Preserve the chest logo/graphic from image(s) {refs} EXACTLY — "
            "same spelling, letter shapes, and colors. Do not alter or invent the logo."
        )

    if fabric_indices:
        refs = ", ".join(f"#{i}" for i in fabric_indices)
        parts.append(
            f"Image(s) {refs} are fabric texture only — material feel, never override "
            "prints, paint, or logo from the product/logo refs."
        )
    if not product_indices and not logo_indices and fabric_indices:
        refs = ", ".join(f"#{i}" for i in fabric_indices)
        parts.append(
            f"Build the garment using the fabric in image(s) {refs} (exact color and texture)."
        )

    brief = (design_brief or "").strip()
    if brief:
        parts.append(
            "LOCKED DESIGN BRIEF FROM PRODUCT ANALYSIS (follow precisely): " + brief
        )

    parts.append(
        "Critical: logos and text must stay crisp and correct — never morph into "
        "paint splatters. Natural skin and fabric microdetail. No CGI, no watermark, "
        "no extra text overlays."
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
    """Upload image bytes to fal storage; return a public URL."""
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
    """Vision pass — extract logo/print details to lock into the Kontext prompt."""
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
                    "You extract exact garment branding details for product mockups. "
                    "Be literal about logo text. No markdown."
                ),
                "image_urls": list(urls)[:4],
                "priority": "latency",
            },
            with_logs=False,
        )
    except Exception:
        # Fallback: lighter vision model if any-llm/vision is unavailable
        try:
            result = fal_client.subscribe(
                "fal-ai/moondream-next",
                arguments={
                    "image_url": urls[0],
                    "task_type": "query",
                    "prompt": GARMENT_ANALYSIS_PROMPT,
                    "max_tokens": 256,
                },
                with_logs=False,
            )
        except Exception:
            return ""

    payload = result if isinstance(result, dict) else {}
    for key in ("output", "response", "text", "answer", "caption"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:1200]
    # nested shapes
    data = payload.get("data")
    if isinstance(data, dict):
        for key in ("output", "response", "text"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()[:1200]
    return ""


def generate_mockup(
    *,
    image_urls: Sequence[str],
    prompt: str,
    aspect_ratio: str = "3:4",
    num_images: int = 1,
    fal_key: str | None = None,
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
            "guidance_scale": 5.0,
            "enhance_prompt": False,
        },
        with_logs=False,
    )

    payload = result if isinstance(result, dict) else {}
    raw_images = payload.get("images") or []
    images_out: list[dict[str, Any]] = []
    for img in raw_images:
        if isinstance(img, dict) and img.get("url"):
            images_out.append(
                {
                    "url": img["url"],
                    "contentType": img.get("content_type") or "image/jpeg",
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
    }


def normalize_aspect(value: Optional[str]) -> str:
    v = (value or "3:4").strip()
    return v if v in ALLOWED_ASPECT else "3:4"
