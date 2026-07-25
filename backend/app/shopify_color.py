"""Resolve product color from Shopify category metafields + fallbacks."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

# GraphQL fragment fields for lineItem.product (or product root).
PRODUCT_COLOR_GRAPHQL = """
id
title
handle
colorPattern: metafield(namespace: "shopify", key: "color-pattern") {
  type
  value
  jsonValue
  references(first: 5) {
    nodes {
      ... on Metaobject {
        id
        displayName
        handle
        fields {
          key
          value
        }
      }
    }
  }
}
featuredMedia {
  ... on MediaImage {
    image {
      url
      altText
    }
  }
}
"""

_KNOWN_COLORS = (
    "navy",
    "green",
    "black",
    "grey",
    "gray",
    "red",
    "blue",
    "white",
    "cream",
    "beige",
    "brown",
    "pink",
    "purple",
    "orange",
    "yellow",
    "khaki",
    "olive",
    "charcoal",
    "maroon",
    "burgundy",
    "teal",
    "tan",
)


def _title_case_color(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if raw.isupper() and len(raw) <= 4:
        return raw
    return raw[:1].upper() + raw[1:].lower() if raw.islower() or raw.isupper() else raw


def _color_from_metaobject(node: Dict[str, Any]) -> Optional[str]:
    if not node:
        return None
    display = (node.get("displayName") or "").strip()
    if display:
        return display
    fields = node.get("fields") or []
    by_key = {
        str(f.get("key") or "").strip().lower(): str(f.get("value") or "").strip()
        for f in fields
        if isinstance(f, dict)
    }
    for key in ("color", "label", "name", "color_taxonomy_reference", "pattern"):
        if by_key.get(key):
            # taxonomy refs are GIDs — skip those
            if by_key[key].startswith("gid://"):
                continue
            return by_key[key]
    handle = (node.get("handle") or "").strip().replace("-", " ")
    return handle or None


def _color_from_color_pattern_metafield(mf: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(mf, dict):
        return None
    refs = ((mf.get("references") or {}).get("nodes")) or []
    colors: List[str] = []
    for node in refs:
        if not isinstance(node, dict):
            continue
        c = _color_from_metaobject(node)
        if c:
            colors.append(c)
    if colors:
        return ", ".join(colors)
    return None


def _color_from_image_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    filename = unquote(url.split("/")[-1].split("?")[0])
    stem = re.sub(r"\.[a-zA-Z0-9]+$", "", filename)
    tokens = re.split(r"[\s_\-]+", stem)
    for token in tokens:
        lower = token.lower()
        if lower in _KNOWN_COLORS:
            return _title_case_color("Gray" if lower == "grey" else token)
    # e.g. NavyPainter → Navy
    for color in _KNOWN_COLORS:
        if stem.lower().startswith(color):
            return _title_case_color(color if color != "grey" else "Gray")
    return None


def _color_from_options(options: List[Dict[str, Any]]) -> Optional[str]:
    for opt in options:
        name = str(opt.get("name") or "").strip().lower()
        value = str(opt.get("value") or "").strip()
        if name in {"color", "colour", "color-pattern", "color pattern"} and value:
            return value
    return None


def resolve_product_color(
    product: Optional[Dict[str, Any]],
    *,
    selected_options: Optional[List[Dict[str, Any]]] = None,
    variant_title: Optional[str] = None,
) -> Optional[str]:
    """Best-effort color for a Shopify product / line item."""
    product = product or {}

    color = _color_from_color_pattern_metafield(product.get("colorPattern"))
    if color:
        return color

    media = product.get("featuredMedia") or {}
    image = media.get("image") or {}
    color = _color_from_image_url(image.get("url"))
    if color:
        return color
    alt = (image.get("altText") or "").strip()
    if alt:
        for known in _KNOWN_COLORS:
            if known in alt.lower():
                return _title_case_color(known if known != "grey" else "Gray")

    color = _color_from_options(selected_options or [])
    if color:
        return color

    # variant title "Navy / Large" or lone non-size title
    vt = (variant_title or "").strip()
    if vt and " / " in vt:
        left = vt.split("/", 1)[0].strip()
        if left and left.lower() not in {"default title", "small", "medium", "large", "xl", "2xl", "3xl"}:
            return left

    return None


def product_label_with_color(title: str, color: Optional[str]) -> str:
    title = (title or "").strip() or "Unknown"
    color = (color or "").strip()
    if not color or color == "—":
        return title
    # Avoid "PAINTERS HOODIE · PAINTERS HOODIE"
    if color.lower() in title.lower():
        return title
    return f"{title} · {color}"
