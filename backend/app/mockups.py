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

PHOTOREAL_TEMPLATE = (
    "Photoreal product photo shot on a real camera. "
    "Recreate the pose, framing, and lighting of the first reference image. "
    "Apply the exact fabric color, weave, nap, and texture from the fabric close-up "
    "reference images onto the garment. "
    "Match construction details from any product reference images "
    "(silhouette, seams, ribbing, hardware, fit). "
    "Natural skin and fabric microdetail, authentic lens look, shallow depth of field "
    "when appropriate. No illustration, no plastic CGI, no stock watermark, no text overlay."
)


def build_prompt(
    *,
    fabric_count: int,
    product_count: int,
    notes: str | None,
) -> str:
    parts = [PHOTOREAL_TEMPLATE]
    parts.append(
        f"Image order: (1) inspiration scene to recreate; "
        f"next {fabric_count} image(s) are fabric texture close-ups"
        + (
            f"; remaining {product_count} image(s) are product/construction refs."
            if product_count
            else "."
        )
    )
    cleaned = (notes or "").strip()
    if cleaned:
        parts.append(f"Additional direction from the designer: {cleaned}")
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
