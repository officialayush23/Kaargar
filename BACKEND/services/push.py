"""
Push notifications via the Expo Push Service.

WHY EXPO'S SERVICE AND NOT FCM/APNs DIRECTLY
--------------------------------------------
The mobile app is Expo (SDK 57). Expo's push service sits in front of both FCM
and APNs: the app gets ONE token (`ExponentPushToken[...]`) regardless of
platform, and this backend posts to one HTTPS endpoint instead of maintaining a
Firebase service account + an APNs .p8 key + two separate payload shapes.

Ayush still has to set up FCM and APNs credentials — Expo relays through them —
but that's a one-time dashboard job (see docs/push-setup.md), not code we have
to write or keys this server has to hold. Fewer secrets on the server is the
whole point.

`DeviceToken.fcm_token` stores the EXPO token despite the column name. The
column predates this decision and renaming it means a migration for zero
behavioural gain; noted here so nobody assumes it holds a raw FCM token.

DELIVERY IS BEST-EFFORT, ALWAYS
-------------------------------
Nothing in this module may raise into a request. A push failing must never fail
the job/booking/message that triggered it — the in-app notification row is
already committed and Realtime already delivered it. Push is an extra channel,
not the source of truth.
"""

import logging
from typing import Any, Iterable

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Expo accepts up to 100 messages per request.
MAX_BATCH = 100

# Android notification channel — must match the channel the app creates in
# usePushRegistration.ts, or Android silently drops the notification's sound
# and importance settings.
ANDROID_CHANNEL_ID = "default"


def _looks_like_expo_token(token: str) -> bool:
    return isinstance(token, str) and token.startswith(("ExponentPushToken[", "ExpoPushToken["))


def _chunk(items: list, size: int) -> Iterable[list]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


# Notification categories carry the action buttons. Must match the ids
# registered in the app (features/notification/push/usePushRegistration.ts) —
# a categoryId the device doesn't know about renders as a plain notification
# with no buttons, silently.
CATEGORY_INSTANT_JOB = "instant_job"

# Which notification types get action buttons, keyed by `data.type`.
ACTION_CATEGORIES = {
    "new_job_request": CATEGORY_INSTANT_JOB,
}


async def send_push(
    tokens: list[str],
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> list[str]:
    """
    Send one notification to many device tokens.

    Returns the list of tokens Expo reported as permanently invalid
    (`DeviceNotRegistered`) so the caller can deactivate them — otherwise the
    device_tokens table grows a tail of uninstalled apps that we keep paying to
    push to forever.
    """
    tokens = [t for t in dict.fromkeys(tokens) if _looks_like_expo_token(t)]
    if not tokens:
        return []

    dead: list[str] = []

    try:
        import httpx
    except Exception:
        logger.warning("httpx unavailable — skipping push")
        return []

    for batch in _chunk(tokens, MAX_BATCH):
        # Accept/Decline straight from the notification shade, for instant job
        # dispatch only. That flow is a race — the job goes to the next worker
        # after a short timeout — so making the worker unlock, open the app and
        # find the modal is the difference between winning the job and losing
        # it. Nothing else in the app is time-critical enough to justify
        # actions, and buttons on routine notifications train people to ignore
        # them.
        category = ACTION_CATEGORIES.get((data or {}).get("type"))

        messages = []
        for token in batch:
            msg = {
                "to": token,
                "title": title,
                "body": body,
                "data": data or {},
                "sound": "default",
                "channelId": ANDROID_CHANNEL_ID,
                # Job dispatch is time-critical; a delayed "new job request" is
                # worthless because another worker will have taken it.
                "priority": "high",
            }
            if category:
                msg["categoryId"] = category
                # Android: keep it on screen until acted on rather than
                # auto-dismissing — a dispatch you swiped past by accident is
                # a lost job.
                msg["sticky"] = True
            messages.append(msg)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=messages,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                    },
                )

            if resp.status_code != 200:
                logger.error("Expo push HTTP %s: %s", resp.status_code, resp.text[:300])
                continue

            payload = resp.json()
            receipts = payload.get("data") or []

            # Expo returns one receipt per message, IN ORDER — that positional
            # correspondence is the only way to map an error back to a token.
            for token, receipt in zip(batch, receipts):
                if not isinstance(receipt, dict):
                    continue
                if receipt.get("status") == "error":
                    err = (receipt.get("details") or {}).get("error")
                    if err == "DeviceNotRegistered":
                        dead.append(token)
                    else:
                        logger.warning(
                            "Expo push error for one device: %s (%s)",
                            receipt.get("message"), err,
                        )

        except Exception:
            # Broad on purpose — see the module docstring. A push must never
            # take down the request that triggered it.
            logger.exception("Push send failed for a batch of %d", len(batch))

    return dead


async def push_to_user(db, user_id, title: str, body: str, data: dict | None = None) -> None:
    """
    Look up a user's active devices, push, and deactivate any dead tokens.

    Deliberately does NOT commit — the caller owns the transaction. Token
    deactivation rides along on whatever commit follows, which is fine: a stale
    `is_active` flag for one more request costs nothing.
    """
    from sqlalchemy import select
    from models import DeviceToken

    try:
        rows = (await db.execute(
            select(DeviceToken).where(
                DeviceToken.user_id == user_id,
                DeviceToken.is_active == True,  # noqa: E712
            )
        )).scalars().all()

        if not rows:
            return

        dead = await send_push([r.fcm_token for r in rows], title, body, data)

        if dead:
            dead_set = set(dead)
            for row in rows:
                if row.fcm_token in dead_set:
                    row.is_active = False
            logger.info("Deactivated %d unregistered device token(s)", len(dead))

    except Exception:
        logger.exception("push_to_user failed for user %s", user_id)
