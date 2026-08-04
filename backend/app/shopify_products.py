"""Create draft Shopify products with media + size/color variants."""

from __future__ import annotations

import base64
import binascii
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

import httpx

from .shopify import ShopifyClient, ShopifyGraphQLError

DEFAULT_SIZES = ["S", "M", "L", "XL", "2XL"]

PRODUCT_CREATE_MUTATION = """
mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
  productCreate(product: $product, media: $media) {
    product {
      id
      title
      handle
      status
      options {
        id
        name
        optionValues {
          id
          name
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
"""

VARIANTS_BULK_CREATE_MUTATION = """
mutation CreateVariants(
  $productId: ID!
  $variants: [ProductVariantsBulkInput!]!
  $strategy: ProductVariantsBulkCreateStrategy
) {
  productVariantsBulkCreate(
    productId: $productId
    variants: $variants
    strategy: $strategy
  ) {
    productVariants {
      id
      title
      price
    }
    userErrors {
      field
      message
    }
  }
}
"""

STAGED_UPLOADS_CREATE_MUTATION = """
mutation StagedUploads($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
"""


def _user_errors(errors: Any) -> List[str]:
    if not errors:
        return []
    out: List[str] = []
    for err in errors:
        if isinstance(err, dict):
            msg = str(err.get("message") or "").strip()
            field = err.get("field")
            if field:
                out.append(f"{field}: {msg}" if msg else str(field))
            elif msg:
                out.append(msg)
        else:
            out.append(str(err))
    return out


def _raise_user_errors(errors: Any, *, prefix: str) -> None:
    msgs = _user_errors(errors)
    if msgs:
        raise ValueError(f"{prefix}: {'; '.join(msgs)}")


def admin_product_url(store_domain: str, product_gid: str) -> str:
    domain = store_domain.strip().removeprefix("https://").rstrip("/")
    match = re.search(r"/Product/(\d+)", product_gid or "")
    if not match:
        return f"https://{domain}/admin/products"
    return f"https://{domain}/admin/products/{match.group(1)}"


def _parse_data_url(data_url: str) -> Tuple[bytes, str, str]:
    """Return (bytes, mime_type, filename_ext)."""
    if not data_url.startswith("data:"):
        raise ValueError("Expected a data URL")
    header, _, payload = data_url.partition(",")
    if not payload:
        raise ValueError("Invalid data URL")
    mime = "image/jpeg"
    meta = header[5:]  # strip data:
    if ";" in meta:
        mime = meta.split(";", 1)[0] or mime
    elif meta:
        mime = meta
    try:
        raw = base64.b64decode(payload, validate=False)
    except binascii.Error as exc:
        raise ValueError("Invalid base64 image data") from exc
    if not raw:
        raise ValueError("Empty image data")
    ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    }.get(mime.lower(), "jpg")
    return raw, mime, ext


async def _stage_binary(
    client: ShopifyClient,
    *,
    content: bytes,
    filename: str,
    mime_type: str,
) -> str:
    data = await client.graphql(
        STAGED_UPLOADS_CREATE_MUTATION,
        {
            "input": [
                {
                    "resource": "PRODUCT_IMAGE",
                    "filename": filename,
                    "mimeType": mime_type,
                    "httpMethod": "POST",
                    "fileSize": str(len(content)),
                }
            ]
        },
    )
    block = data.get("stagedUploadsCreate") or {}
    _raise_user_errors(block.get("userErrors"), prefix="Shopify staged upload")
    targets = block.get("stagedTargets") or []
    if not targets:
        raise ValueError("Shopify staged upload returned no target")
    target = targets[0]
    upload_url = target.get("url")
    resource_url = target.get("resourceUrl")
    params = target.get("parameters") or []
    if not upload_url or not resource_url:
        raise ValueError("Shopify staged upload missing url/resourceUrl")

    data_fields = {p["name"]: p["value"] for p in params if p.get("name")}

    async with httpx.AsyncClient(timeout=120.0) as http:
        # Shopify staged uploads expect multipart form fields + file.
        response = await http.post(
            upload_url,
            data=data_fields,
            files={"file": (filename, content, mime_type)},
        )
        if response.status_code >= 400:
            raise ValueError(
                f"Shopify staged upload HTTP {response.status_code}: {response.text[:300]}"
            )
    return str(resource_url)


async def resolve_image_sources(
    client: ShopifyClient,
    image_urls: Sequence[str],
) -> List[str]:
    """Turn https or data: URLs into Shopify-ingestible originalSource URLs."""
    sources: List[str] = []
    for i, raw in enumerate(image_urls):
        url = (raw or "").strip()
        if not url:
            continue
        if url.startswith("data:"):
            content, mime, ext = _parse_data_url(url)
            resource = await _stage_binary(
                client,
                content=content,
                filename=f"fgg-studio-{i + 1}.{ext}",
                mime_type=mime,
            )
            sources.append(resource)
            continue
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError(
                "Image URLs must be public http(s) links or data:image… URLs "
                f"(got: {url[:48]}…)"
            )
        sources.append(url)
    return sources


def _build_product_options(
    *,
    sizes: Sequence[str],
    color: Optional[str],
) -> List[Dict[str, Any]]:
    size_values = [{"name": s} for s in sizes]
    if color and color.strip():
        return [
            {"name": "Color", "values": [{"name": color.strip()}]},
            {"name": "Size", "values": size_values},
        ]
    return [{"name": "Size", "values": size_values}]


def _build_variants(
    *,
    sizes: Sequence[str],
    color: Optional[str],
    price: str,
) -> List[Dict[str, Any]]:
    variants: List[Dict[str, Any]] = []
    for size in sizes:
        option_values: List[Dict[str, str]] = []
        if color and color.strip():
            option_values.append({"name": color.strip(), "optionName": "Color"})
        option_values.append({"name": size, "optionName": "Size"})
        variants.append({"price": price, "optionValues": option_values})
    return variants


async def create_draft_product(
    client: ShopifyClient,
    *,
    title: str,
    description_html: Optional[str] = None,
    vendor: Optional[str] = None,
    product_type: Optional[str] = None,
    tags: Optional[List[str]] = None,
    status: str = "DRAFT",
    price: Optional[str] = None,
    sizes: Optional[Sequence[str]] = None,
    color: Optional[str] = None,
    image_urls: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    size_list = [s.strip() for s in (sizes or DEFAULT_SIZES) if s and s.strip()]
    if not size_list:
        size_list = list(DEFAULT_SIZES)

    price_str = "0.00"
    if price is not None and str(price).strip() != "":
        try:
            price_str = f"{float(str(price).strip()):.2f}"
        except ValueError as exc:
            raise ValueError("Price must be a number") from exc

    media_sources = await resolve_image_sources(client, image_urls or [])
    media_input = [
        {
            "originalSource": src,
            "mediaContentType": "IMAGE",
            "alt": title,
        }
        for src in media_sources
    ]

    product_input: Dict[str, Any] = {
        "title": title.strip(),
        "status": (status or "DRAFT").upper(),
        "productOptions": _build_product_options(sizes=size_list, color=color),
    }
    if description_html:
        product_input["descriptionHtml"] = description_html
    if vendor:
        product_input["vendor"] = vendor
    if product_type:
        product_input["productType"] = product_type
    if tags:
        product_input["tags"] = tags

    try:
        data = await client.graphql(
            PRODUCT_CREATE_MUTATION,
            {
                "product": product_input,
                "media": media_input or None,
            },
        )
    except ShopifyGraphQLError:
        raise

    result = data.get("productCreate") or {}
    _raise_user_errors(result.get("userErrors"), prefix="Shopify productCreate")
    product = result.get("product")
    if not product or not product.get("id"):
        raise ValueError("Shopify productCreate returned no product")

    product_id = product["id"]
    variants_input = _build_variants(sizes=size_list, color=color, price=price_str)

    try:
        vdata = await client.graphql(
            VARIANTS_BULK_CREATE_MUTATION,
            {
                "productId": product_id,
                "strategy": "REMOVE_STANDALONE_VARIANT",
                "variants": variants_input,
            },
        )
    except ShopifyGraphQLError:
        raise

    vresult = vdata.get("productVariantsBulkCreate") or {}
    _raise_user_errors(vresult.get("userErrors"), prefix="Shopify productVariantsBulkCreate")

    return {
        "product": {
            "id": product.get("id"),
            "title": product.get("title"),
            "handle": product.get("handle"),
            "status": product.get("status"),
        },
        "variants": vresult.get("productVariants") or [],
        "adminUrl": admin_product_url(client.store_domain, product_id),
        "imageCount": len(media_sources),
    }
