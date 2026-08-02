"""Background worker: publish Instagram posts when scheduledAt is due."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from . import instagram, instagram_schedule_store

POLL_SECONDS = 30
PUBLISHING_STALE_MINUTES = 10


def _parse_iso(value: str) -> Optional[datetime]:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _is_public_https(url: str | None) -> bool:
    return bool(url and str(url).lower().startswith("https://"))


def _due_posts(posts: List[Dict[str, Any]], now: datetime) -> List[Dict[str, Any]]:
    due: List[Dict[str, Any]] = []
    stale_before = now - timedelta(minutes=PUBLISHING_STALE_MINUTES)
    for post in posts:
        status = post.get("status")
        scheduled = _parse_iso(str(post.get("scheduledAt") or ""))
        if scheduled is None or scheduled > now:
            continue
        if status == "scheduled":
            due.append(post)
            continue
        if status == "publishing":
            updated = _parse_iso(str(post.get("updatedAt") or ""))
            if updated is None or updated <= stale_before:
                due.append(post)
    due.sort(key=lambda p: str(p.get("scheduledAt") or ""))
    return due


async def process_due_once() -> Dict[str, Any]:
    store = instagram_schedule_store.get_store()
    posts = list(store.get("posts") or [])
    now = datetime.now(timezone.utc)
    due = _due_posts(posts, now)
    if not due:
        return {"checked": len(posts), "due": 0, "published": 0, "failed": 0}

    published = 0
    failed = 0
    by_id = {p["id"]: dict(p) for p in posts}

    for post in due:
        post_id = post["id"]
        current = dict(by_id.get(post_id) or post)
        image_url = str(current.get("imageSrc") or "").strip()

        if not _is_public_https(image_url):
            current["status"] = "failed"
            current["lastError"] = (
                "Auto-publish needs a public https:// image URL"
            )
            current["updatedAt"] = now.isoformat()
            by_id[post_id] = current
            instagram_schedule_store.upsert_post(current)
            failed += 1
            continue

        current["status"] = "publishing"
        current["lastError"] = None
        current["updatedAt"] = now.isoformat()
        by_id[post_id] = current
        instagram_schedule_store.upsert_post(current)

        try:
            result = await instagram.publish_image(
                str(current.get("brand") or ""),
                str(current.get("caption") or ""),
                image_url,
                kind=str(current.get("kind") or "feed"),
            )
            posted_at = datetime.now(timezone.utc).isoformat()
            current["status"] = "posted"
            current["postedAt"] = posted_at
            current["updatedAt"] = posted_at
            current["lastError"] = None
            media_id = result.get("mediaId")
            if media_id:
                current["mediaId"] = str(media_id)
            by_id[post_id] = current
            instagram_schedule_store.upsert_post(current)
            published += 1
            print(
                f"[ig_publisher] posted {post_id} brand={current.get('brand')} "
                f"kind={current.get('kind')} mediaId={media_id}"
            )
        except HTTPException as exc:
            err = str(exc.detail)
            current["status"] = "failed"
            current["lastError"] = err[:500]
            current["updatedAt"] = datetime.now(timezone.utc).isoformat()
            by_id[post_id] = current
            instagram_schedule_store.upsert_post(current)
            failed += 1
            print(f"[ig_publisher] failed {post_id}: {err[:200]}")
        except Exception as exc:
            err = str(exc)
            current["status"] = "failed"
            current["lastError"] = err[:500]
            current["updatedAt"] = datetime.now(timezone.utc).isoformat()
            by_id[post_id] = current
            instagram_schedule_store.upsert_post(current)
            failed += 1
            print(f"[ig_publisher] error {post_id}: {err[:200]}")

    return {
        "checked": len(posts),
        "due": len(due),
        "published": published,
        "failed": failed,
    }


async def run_loop(stop: asyncio.Event) -> None:
    print("[ig_publisher] auto-publisher started")
    while not stop.is_set():
        try:
            result = await process_due_once()
            if result.get("due"):
                print(f"[ig_publisher] tick {result}")
        except Exception as exc:
            print(f"[ig_publisher] tick error: {exc}")
        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_SECONDS)
        except asyncio.TimeoutError:
            pass
    print("[ig_publisher] auto-publisher stopped")
