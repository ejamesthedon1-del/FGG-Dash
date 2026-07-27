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


def build_prompt(
    *,
    fabric_count: int,
    product_count: int,
    notes: str | None,
) -> str:
    """Build a prompt that prioritizes exact product design over fabric swatches."""
    # Image order sent to Kontext: [inspiration, ...products, ...fabrics]
    idx = 1
    insp_idx = idx
    idx += 1
    product_indices: list[int] = []
    for _ in range(product_count):
        product_indices.append(idx)
        idx += 1
    fabric_indices: list[int] = []
    for _ in range(fabric_count):
        fabric_indices.append(idx)
        idx += 1

    parts: list[str] = [
        "Create a photoreal fashion photograph that looks shot on a real camera.",
        f"Keep the SAME person, face, hair, pose, framing, lighting, and background as image #{insp_idx}.",
        f"Only change the clothing: dress them in our garment.",
    ]

    if product_indices:
        refs = ", ".join(f"#{i}" for i in product_indices)
        parts.append(
            f"The hoodie/garment to wear is in image(s) {refs}. "
            "Copy that product EXACTLY: colorway, paint splatter / distressing / graphics, "
            "chest logo or print placement, pocket shape, hood, drawcords, seams, and overall silhouette. "
            "Do NOT invent a plain solid hoodie. Do NOT drop the print, pattern, or logo."
        )
    if fabric_indices:
        refs = ", ".join(f"#{i}" for i in fabric_indices)
        parts.append(
            f"Image(s) {refs} are fabric texture close-ups only — use them for material feel "
            "(fleece nap, knit, hand) when helpful, but NEVER override the product's printed "
            "design, colorway, or graphics from the product photo."
        )
    if not product_indices and fabric_indices:
        refs = ", ".join(f"#{i}" for i in fabric_indices)
        parts.append(
            f"Build the garment using the fabric shown in image(s) {refs} "
            "(exact color and texture)."
        )

    parts.append(
        "Natural skin texture, fabric microdetail, realistic folds and shadows. "
        "No illustration, no plastic CGI, no watermark, no extra text overlays."
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
            # Stronger adherence to product/design refs
            "guidance_scale": 4.5,
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
