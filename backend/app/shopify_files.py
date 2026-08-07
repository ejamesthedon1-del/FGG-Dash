"""Upload images into Shopify Content → Files and return public CDN URLs."""

from __future__ import annotations

import asyncio
import base64
import binascii
import re
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx

from .shopify import ShopifyClient, ShopifyGraphQLError

STAGED_UPLOADS_CREATE = """
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

FILE_CREATE = """
mutation FileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      id
      fileStatus
      alt
      ... on MediaImage {
        image {
          url
          width
          height
        }
      }
      ... on GenericFile {
        url
      }
    }
    userErrors {
      field
      message
    }
  }
}
"""

FILE_BY_ID = """
query FileById($id: ID!) {
  node(id: $id) {
    ... on MediaImage {
      id
      fileStatus
      image {
        url
        width
        height
      }
    }
    ... on GenericFile {
      id
      fileStatus
      url
    }
  }
}
"""


def _user_errors(errors: Any) -> str:
    if not errors:
        return ""
    parts = []
    for err in errors:
        if isinstance(err, dict):
            msg = str(err.get("message") or "").strip()
            if msg:
                parts.append(msg)
        else:
            parts.append(str(err))
    return "; ".join(parts)


def _parse_data_url(data_url: str) -> Tuple[bytes, str, str]:
    if not data_url.startswith("data:"):
        raise ValueError("Expected a data URL")
    header, _, payload = data_url.partition(",")
    if not payload:
        raise ValueError("Invalid data URL")
    mime = "image/jpeg"
    meta = header[5:]
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
    if len(raw) > 20 * 1024 * 1024:
        raise ValueError("Image larger than 20MB")
    ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    }.get(mime.lower(), "jpg")
    return raw, mime, ext


async def _bytes_from_source(source: str) -> Tuple[bytes, str, str]:
    """Return (bytes, mime, ext) from data: or http(s) URL."""
    src = (source or "").strip()
    if src.startswith("data:"):
        return _parse_data_url(src)
    parsed = urlparse(src)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Image must be a data: URL or http(s) link")
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http:
        response = await http.get(src)
        response.raise_for_status()
        data = response.content
        if not data:
            raise ValueError("Empty image download")
        if len(data) > 20 * 1024 * 1024:
            raise ValueError("Image larger than 20MB")
        ctype = (response.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
        if not ctype.startswith("image/"):
            ctype = "image/jpeg"
        ext = {
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }.get(ctype.lower(), "jpg")
        return data, ctype, ext


def _safe_filename(name: Optional[str], ext: str) -> str:
    base = re.sub(r"[^\w.\-]+", "-", (name or "fgg-schedule").strip())[:80].strip("-") or "fgg-schedule"
    if not base.lower().endswith(f".{ext}"):
        base = f"{base}.{ext}"
    return base


async def _stage_file(
    client: ShopifyClient,
    *,
    content: bytes,
    filename: str,
    mime_type: str,
) -> str:
    data = await client.graphql(
        STAGED_UPLOADS_CREATE,
        {
            "input": [
                {
                    "resource": "FILE",
                    "filename": filename,
                    "mimeType": mime_type,
                    "httpMethod": "POST",
                    "fileSize": str(len(content)),
                }
            ]
        },
    )
    block = data.get("stagedUploadsCreate") or {}
    err = _user_errors(block.get("userErrors"))
    if err:
        raise ValueError(f"Shopify staged upload: {err}")
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


def _cdn_from_node(node: Dict[str, Any] | None) -> Optional[str]:
    if not node:
        return None
    image = node.get("image") if isinstance(node.get("image"), dict) else None
    if image and image.get("url"):
        return str(image["url"])
    if node.get("url"):
        return str(node["url"])
    return None


async def _wait_for_cdn_url(
    client: ShopifyClient,
    file_id: str,
    *,
    attempts: int = 12,
) -> str:
    last_status = ""
    for i in range(attempts):
        data = await client.graphql(FILE_BY_ID, {"id": file_id})
        node = data.get("node") if isinstance(data.get("node"), dict) else None
        if node:
            last_status = str(node.get("fileStatus") or "")
            url = _cdn_from_node(node)
            if url and last_status in {"READY", "UPLOADED", ""}:
                # Prefer READY; accept URL once present.
                if last_status == "READY" or url.startswith("https://"):
                    if last_status in {"READY", "UPLOADED"} or i >= 2:
                        return url
            if last_status == "FAILED":
                raise ValueError("Shopify file processing failed")
        await asyncio.sleep(0.45 * (i + 1))
    raise ValueError(
        f"Shopify file not ready yet (status={last_status or 'unknown'}). Try again in a moment."
    )


async def upload_image_to_files(
    client: ShopifyClient,
    *,
    source: str,
    filename: Optional[str] = None,
    alt: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Upload image bytes into Shopify Admin → Content → Files.
    Returns { fileId, url, filename }.
    """
    content, mime, ext = await _bytes_from_source(source)
    fname = _safe_filename(filename, ext)
    resource_url = await _stage_file(
        client,
        content=content,
        filename=fname,
        mime_type=mime,
    )

    try:
        created = await client.graphql(
            FILE_CREATE,
            {
                "files": [
                    {
                        "originalSource": resource_url,
                        "contentType": "IMAGE",
                        "alt": (alt or fname)[:512],
                        "filename": fname,
                    }
                ]
            },
        )
    except ShopifyGraphQLError:
        raise

    block = created.get("fileCreate") or {}
    err = _user_errors(block.get("userErrors"))
    if err:
        raise ValueError(f"Shopify fileCreate: {err}")
    files = block.get("files") or []
    if not files or not isinstance(files[0], dict):
        raise ValueError("Shopify fileCreate returned no file")
    file_node = files[0]
    file_id = str(file_node.get("id") or "")
    if not file_id:
        raise ValueError("Shopify fileCreate missing file id")

    cdn = _cdn_from_node(file_node)
    if not cdn or str(file_node.get("fileStatus") or "").upper() != "READY":
        cdn = await _wait_for_cdn_url(client, file_id)

    if not cdn.startswith("https://"):
        raise ValueError("Shopify did not return a public https CDN URL")

    return {
        "fileId": file_id,
        "url": cdn,
        "filename": fname,
        "byteLength": len(content),
    }
