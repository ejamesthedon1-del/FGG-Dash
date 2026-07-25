from __future__ import annotations

from typing import Any, Dict, List

import httpx

from .config import get_settings


class SlackError(RuntimeError):
    """Slack webhook / API errors."""


class SlackClient:
    def configured(self) -> bool:
        url = get_settings().slack_webhook_url
        return bool(url and url.strip())

    async def post_text(self, text: str) -> None:
        await self.post_payload({"text": text})

    async def post_payload(self, payload: Dict[str, Any]) -> None:
        if not self.configured():
            raise SlackError("Slack webhook is not configured (SLACK_WEBHOOK_URL)")

        url = get_settings().slack_webhook_url.strip()
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(url, json=payload)
            body = response.text
            if response.status_code >= 400 or body.strip().lower() != "ok":
                raise SlackError(f"Slack webhook failed ({response.status_code}): {body}")

    @staticmethod
    def _format_item(item: Dict[str, Any]) -> str:
        title = (item.get("title") or item.get("name") or "Item").strip()
        color = (item.get("color") or "").strip()
        # Title may already include " · Color" from the order payload
        if color and color.lower() not in title.lower() and " · " not in title:
            title = f"{title} · {color}"
        size = (item.get("size") or item.get("variantTitle") or "").strip()
        qty = int(item.get("quantity") or item.get("units") or 1)
        if size and size.lower() != "default title":
            label = f"{title} ({size})"
        else:
            label = title
        return f"{label} ×{qty}" if qty != 1 else label

    def format_orders_message(
        self,
        *,
        brand: str,
        date_label: str,
        orders: List[Dict[str, Any]],
        currency: str = "USD",
    ) -> Dict[str, Any]:
        del currency  # prices intentionally omitted for ops alerts
        if not orders:
            text = f"*{brand}* — no orders for {date_label}."
            return {"text": text}

        lines: List[str] = []
        for o in orders:
            name = o.get("name") or "Order"
            items = o.get("items") or []
            if items:
                item_txt = ", ".join(self._format_item(i) for i in items)
            else:
                item_txt = "—"
            lines.append(f"• `{name}`\n    {item_txt}")

        header = f"*📦 {brand} orders — {date_label}*\n{len(orders)} order(s) to fulfill"
        return {
            "text": f"{brand} orders {date_label}: {len(orders)} order(s)",
            "blocks": [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": header},
                },
                {"type": "divider"},
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "\n".join(lines)[:2900]},
                },
            ],
        }


slack_client = SlackClient()
