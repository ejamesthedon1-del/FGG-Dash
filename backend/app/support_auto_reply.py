"""Auto-reply Support emails with Order Flow status updates."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from . import gmail_store, gmail_support, order_flow_store
from .config import get_settings
from .order_flow import BRANDS, STAGE_LABELS
from .shopify import get_shopify_client


def auto_reply_is_live() -> bool:
    return bool(get_settings().support_auto_reply_live)


ORDERS_BY_EMAIL_QUERY = """
query SupportOrdersByEmail($queryString: String!) {
  orders(first: 8, sortKey: CREATED_AT, reverse: true, query: $queryString) {
    edges {
      node {
        id
        name
        email
        cancelledAt
        displayFulfillmentStatus
        customer {
          displayName
          firstName
          email
        }
      }
    }
  }
}
"""

STATUS_INTENT = re.compile(
    r"\b("
    r"where'?s?\s+my\s+order|"
    r"wheres\s+my\s+order|"
    r"order\s+status|"
    r"status\s+of\s+(my\s+)?order|"
    r"track(ing)?(\s+my\s+order)?|"
    r"when\s+(will|does|is)\s+(my\s+)?order|"
    r"has\s+(my\s+)?order\s+shipped|"
    r"update\s+on\s+(my\s+)?order|"
    r"any\s+update|"
    r"still\s+waiting|"
    r"haven'?t\s+received"
    r")\b",
    re.I,
)

BLOCK_INTENT = re.compile(
    r"\b("
    r"refund|cancel(lation)?|return\s+(it|my|the)|chargeback|"
    r"wrong\s+item|damaged|defective|attorney|lawyer|lawsuit|"
    r"never\s+got\s+a\s+refund"
    r")\b",
    re.I,
)

SHOPIFY_CONTACT_LABELS = {
    "name",
    "email",
    "phone",
    "body",
    "message",
    "subject",
    "country code",
    "id",
    "order number",
    "order #",
}

STAGE_MESSAGES = {
    "needs_blanks": (
        "Your order is being processed — we're gathering materials to get "
        "production started."
    ),
    "blanks_ordered": (
        "Your order is being processed — blanks have been ordered and we're "
        "preparing for production."
    ),
    "in_production": (
        "Your order is currently in production and finishing up."
    ),
    "ready_to_ship": (
        "Your order is complete and being prepared for shipment."
    ),
    "shipped": (
        "Your order has shipped. You should also receive tracking from the store "
        "when it's available."
    ),
}


def _normalize_label(line: str) -> str:
    return line.replace(":", "").strip().lower()


def parse_shopify_contact_form(text: str) -> Optional[Dict[str, str]]:
    raw = (text or "").replace("\r\n", "\n").strip()
    if not raw:
        return None
    looks = (
        "contact form" in raw.lower()
        or (
            re.search(r"^name:?$", raw, re.I | re.M)
            and re.search(r"^email:?$", raw, re.I | re.M)
            and re.search(r"^(body|message):?$", raw, re.I | re.M)
        )
    )
    if not looks:
        return None

    lines = raw.split("\n")
    fields: Dict[str, str] = {}
    i = 0
    while i < len(lines):
        label = _normalize_label(lines[i] or "")
        if label not in SHOPIFY_CONTACT_LABELS:
            i += 1
            continue
        i += 1
        value_lines: List[str] = []
        while i < len(lines):
            nxt = (lines[i] or "").strip()
            if nxt and _normalize_label(nxt) in SHOPIFY_CONTACT_LABELS:
                break
            if nxt or value_lines:
                value_lines.append(lines[i] or "")
            i += 1
        value = "\n".join(value_lines).strip()
        if value:
            fields[label] = value

    message = fields.get("body") or fields.get("message") or ""
    email = fields.get("email") or ""
    name = fields.get("name") or ""
    if not (name or email or message):
        return None
    return {
        "name": name,
        "email": email,
        "phone": fields.get("phone") or "",
        "message": message,
        "orderNumber": fields.get("order number") or fields.get("order #") or "",
    }


def _email_from_header(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    m = re.search(r"<([^>]+)>", raw)
    if m:
        return m.group(1).strip().lower()
    if "@" in raw:
        return raw.strip().lower()
    return ""


def _html_to_text(html: str) -> str:
    t = re.sub(r"<style[\s\S]*?</style>", "", html or "", flags=re.I)
    t = re.sub(r"<script[\s\S]*?</script>", "", t, flags=re.I)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"</(p|div|h[1-6]|li|tr)>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = (
        t.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
    )
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def message_plain(msg: Dict[str, Any]) -> str:
    plain = (msg.get("bodyText") or "").strip()
    if plain:
        return plain
    html = (msg.get("bodyHtml") or "").strip()
    if html:
        return _html_to_text(html)
    return (msg.get("snippet") or "").strip()


def is_status_inquiry(text: str) -> bool:
    body = (text or "").strip()
    if not body:
        return False
    if BLOCK_INTENT.search(body):
        return False
    if STATUS_INTENT.search(body):
        return True
    # Short Shopify-style asks: "Hi wheres my order?"
    if len(body) < 180 and re.search(r"\border\b", body, re.I):
        if re.search(r"\b(where|status|track|shipped|update|waiting)\b", body, re.I):
            return True
    return False


def build_status_reply(
    *,
    customer_name: str,
    order_name: str,
    stage: str,
    brand_label: str = "",
) -> str:
    stage_key = order_flow_store.normalize_stage(stage)
    status_line = STAGE_MESSAGES.get(
        stage_key,
        f"Your order is currently marked as {STAGE_LABELS.get(stage_key, stage_key)}.",
    )
    first = (customer_name or "").strip().split()[0] if customer_name else ""
    greeting = f"Hi {first}," if first else "Hi,"
    brand_bit = f" ({brand_label})" if brand_label else ""
    return (
        f"{greeting}\n\n"
        f"Thanks for reaching out about your order {order_name}{brand_bit}.\n\n"
        f"{status_line}\n\n"
        "If you have any other questions, just reply to this email.\n\n"
        "— Future Garment Group Support"
    )


async def find_orders_for_email(email: str) -> List[Dict[str, Any]]:
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        return []
    # Escape quotes in Shopify search
    safe = email.replace('"', "")
    query = f'email:"{safe}"'
    found: List[Dict[str, Any]] = []
    for brand in BRANDS:
        try:
            client = get_shopify_client(brand)
        except Exception:
            continue
        try:
            data = await client.graphql(
                ORDERS_BY_EMAIL_QUERY,
                {"queryString": query},
            )
        except Exception:
            continue
        edges = (((data.get("orders") or {}).get("edges")) or [])
        for edge in edges:
            node = (edge or {}).get("node") or {}
            if node.get("cancelledAt"):
                continue
            oid = str(node.get("id") or "")
            if not oid:
                continue
            record = order_flow_store.get_record(brand, oid) or {}
            stage = order_flow_store.normalize_stage(
                record.get("stage")
                or (
                    "shipped"
                    if str(node.get("displayFulfillmentStatus") or "").upper()
                    in {"FULFILLED", "SHIPPED"}
                    else "needs_blanks"
                )
            )
            customer = node.get("customer") or {}
            name = (
                (customer.get("displayName") or "").strip()
                or (customer.get("firstName") or "").strip()
                or ""
            )
            found.append(
                {
                    "brand": brand,
                    "shopifyOrderId": oid,
                    "name": node.get("name") or oid,
                    "email": (node.get("email") or email).strip().lower(),
                    "customerName": name,
                    "stage": stage,
                    "fulfillment": node.get("displayFulfillmentStatus") or "",
                }
            )
    return found


def pick_order_for_reply(
    orders: List[Dict[str, Any]],
    order_number_hint: str = "",
) -> Tuple[Optional[Dict[str, Any]], str]:
    if not orders:
        return None, "no_order"
    hint = re.sub(r"[^0-9A-Za-z#\-]", "", (order_number_hint or "").strip())
    if hint:
        for o in orders:
            oname = str(o.get("name") or "")
            if hint in oname.replace(" ", "") or hint.lstrip("#") in oname.lstrip("#"):
                return o, "matched_hint"
    open_orders = [o for o in orders if o.get("stage") != "shipped"]
    pool = open_orders or orders
    if len(pool) > 1 and not open_orders:
        # Multiple shipped only — use most recent
        return pool[0], "latest_shipped"
    if len(open_orders) > 1:
        return None, "multiple_open"
    return pool[0], "single"


def extract_customer_context(
    thread: Dict[str, Any],
    mailbox_email: str,
) -> Optional[Dict[str, Any]]:
    mailbox = (mailbox_email or "").strip().lower()
    messages = thread.get("messages") or []
    if not messages:
        return None

    # Prefer last message not from our mailbox
    inbound: Optional[Dict[str, Any]] = None
    for msg in reversed(messages):
        from_email = _email_from_header(msg.get("from") or "")
        if mailbox and from_email == mailbox:
            continue
        inbound = msg
        break
    if not inbound:
        inbound = messages[0]

    plain = message_plain(inbound)
    shopify = parse_shopify_contact_form(plain)
    from_email = _email_from_header(inbound.get("from") or "")
    reply_to = _email_from_header(inbound.get("replyTo") or "")

    customer_email = ""
    customer_name = ""
    customer_message = plain
    order_hint = ""

    if shopify:
        customer_email = (shopify.get("email") or "").strip().lower()
        customer_name = shopify.get("name") or ""
        customer_message = shopify.get("message") or plain
        order_hint = shopify.get("orderNumber") or ""
    if not customer_email:
        customer_email = reply_to or from_email
    if not customer_name:
        raw_from = inbound.get("from") or ""
        m = re.match(r'^"?([^"<]+)"?\s*<', raw_from)
        customer_name = (m.group(1).strip() if m else "") or ""

    # Don't reply to Shopify mailer itself
    if customer_email.endswith("@shopify.com") or customer_email == "mailer@shopify.com":
        if shopify and shopify.get("email"):
            customer_email = shopify["email"].strip().lower()
        else:
            return None

    if not customer_email or "@" not in customer_email:
        return None
    if mailbox and customer_email == mailbox:
        return None

    return {
        "email": customer_email,
        "name": customer_name,
        "message": customer_message,
        "orderHint": order_hint,
        "subject": inbound.get("subject") or thread.get("subject") or "",
        "messageIdHeader": inbound.get("messageIdHeader") or "",
        "fromHeader": inbound.get("from") or "",
    }


BRAND_LABELS = {
    "live-don": "Livdon",
    "sinners-testimony": "Sinners Testimony",
}


async def try_auto_reply_thread(
    thread_id: str,
    *,
    dry_run: Optional[bool] = None,
    send_to_self: bool = False,
) -> Dict[str, Any]:
    tid = (thread_id or "").strip()
    if not tid:
        return {"threadId": tid, "sent": False, "reason": "missing_id"}

    live = auto_reply_is_live()
    preview_only = True if dry_run is True else (False if dry_run is False else not live)
    # send_to_self is always a real send, but never to the customer
    if send_to_self:
        preview_only = False

    existing = gmail_store.get_auto_reply(tid)
    if existing and not preview_only and not send_to_self:
        return {
            "threadId": tid,
            "sent": False,
            "reason": "already_replied",
            "previous": existing,
            "dryRun": False,
        }

    if not gmail_support.token_has_send_scope() and not preview_only:
        return {
            "threadId": tid,
            "sent": False,
            "reason": "needs_send_scope",
            "dryRun": preview_only,
        }

    thread = await gmail_support.get_thread(tid)
    mailbox = (thread.get("email") or "").strip()
    ctx = extract_customer_context(thread, mailbox)
    if not ctx:
        return {
            "threadId": tid,
            "sent": False,
            "reason": "no_customer",
            "dryRun": preview_only,
        }

    if not is_status_inquiry(ctx["message"]):
        return {
            "threadId": tid,
            "sent": False,
            "reason": "not_status_inquiry",
            "customerEmail": ctx["email"],
            "customerMessage": ctx["message"][:280],
            "dryRun": preview_only,
        }

    orders = await find_orders_for_email(ctx["email"])
    order, pick_reason = pick_order_for_reply(orders, ctx.get("orderHint") or "")
    if not order:
        return {
            "threadId": tid,
            "sent": False,
            "reason": pick_reason,
            "customerEmail": ctx["email"],
            "orderCount": len(orders),
            "dryRun": preview_only,
        }

    body = build_status_reply(
        customer_name=ctx.get("name") or order.get("customerName") or "",
        order_name=str(order.get("name") or ""),
        stage=str(order.get("stage") or "needs_blanks"),
        brand_label=BRAND_LABELS.get(str(order.get("brand") or ""), ""),
    )

    draft = {
        "threadId": tid,
        "sent": False,
        "reason": "dry_run" if preview_only else "ready",
        "dryRun": preview_only,
        "liveEnabled": live,
        "customerEmail": ctx["email"],
        "customerName": ctx.get("name") or "",
        "customerMessage": ctx["message"][:280],
        "orderName": order.get("name"),
        "stage": order.get("stage"),
        "brand": order.get("brand"),
        "pickReason": pick_reason,
        "draftSubject": (
            str(ctx.get("subject") or "")
            if str(ctx.get("subject") or "").lower().startswith("re:")
            else f"Re: {ctx.get('subject') or 'Your order update'}"
        ),
        "draftBody": body,
        "wouldSendTo": ctx["email"],
    }

    if preview_only:
        draft["reason"] = "dry_run"
        return draft

    to_email = mailbox if send_to_self else ctx["email"]
    if send_to_self and not mailbox:
        return {
            **draft,
            "sent": False,
            "reason": "no_mailbox",
            "detail": "Connected Gmail address unknown",
        }
    if send_to_self:
        body = (
            "[TEST — this was sent to you, not the customer]\n"
            f"Would have gone to: {ctx['email']}\n\n"
            f"{body}"
        )

    try:
        sent = await gmail_support.send_thread_reply(
            thread_id=tid if not send_to_self else tid,
            to_email=to_email,
            subject=(
                f"[TEST] {draft['draftSubject']}"
                if send_to_self
                else str(ctx.get("subject") or "")
            ),
            body_text=body,
            in_reply_to="" if send_to_self else str(ctx.get("messageIdHeader") or ""),
            references="" if send_to_self else str(ctx.get("messageIdHeader") or ""),
        )
    except HTTPException as exc:
        return {
            **draft,
            "sent": False,
            "reason": "send_failed",
            "detail": str(exc.detail),
        }

    if not send_to_self:
        record = gmail_store.save_auto_reply(
            tid,
            {
                "customerEmail": ctx["email"],
                "orderName": order.get("name"),
                "shopifyOrderId": order.get("shopifyOrderId"),
                "brand": order.get("brand"),
                "stage": order.get("stage"),
                "gmailMessageId": sent.get("id"),
                "pickReason": pick_reason,
            },
        )
    else:
        record = {"testToSelf": True, "gmailMessageId": sent.get("id")}

    return {
        **draft,
        "sent": True,
        "reason": "sent_to_self" if send_to_self else "sent",
        "dryRun": False,
        "wouldSendTo": to_email,
        "record": record,
    }


async def process_auto_replies(
    max_threads: int = 20,
    *,
    dry_run: Optional[bool] = None,
) -> Dict[str, Any]:
    live = auto_reply_is_live()
    preview_only = True if dry_run is True else (False if dry_run is False else not live)

    if not preview_only and not gmail_support.token_has_send_scope():
        return {
            "ok": False,
            "reason": "needs_send_scope",
            "dryRun": False,
            "liveEnabled": live,
            "processed": 0,
            "sent": 0,
            "results": [],
        }

    listed = await gmail_support.list_inbox_threads(max_results=max_threads)
    results: List[Dict[str, Any]] = []
    sent_count = 0
    preview_count = 0
    for t in listed.get("threads") or []:
        tid = t.get("id")
        if not tid:
            continue
        # Preview can include recent read threads; live only unread
        if not preview_only and not t.get("unread"):
            continue
        result = await try_auto_reply_thread(
            str(tid),
            dry_run=preview_only,
        )
        results.append(result)
        if result.get("sent"):
            sent_count += 1
        if result.get("reason") == "dry_run":
            preview_count += 1

    return {
        "ok": True,
        "dryRun": preview_only,
        "liveEnabled": live,
        "processed": len(results),
        "sent": sent_count,
        "previews": preview_count,
        "results": results,
        "email": listed.get("email"),
    }
