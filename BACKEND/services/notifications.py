"""
Notification service — Resend SDK (primary) + SMTP fallback + console log.

Email priority:
  1. Resend SDK  — if RESEND_API_KEY is set
  2. SMTP        — if SMTP_USERNAME + SMTP_PASSWORD are set
  3. Console log — always (visible in Render logs, useful for debugging)
"""

import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_jinja = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent.parent / "templates" / "email")),
    autoescape=select_autoescape(["html"]),
)

# ── OTP email HTML (inline fallback if template missing) ─────────────────────
def _otp_html(otp: str) -> str:
    try:
        return _jinja.get_template("otp.html").render(otp=otp, app_name="Kaargar")
    except Exception:
        return f"""
        <div style="font-family:Arial,sans-serif;max-width:420px;margin:40px auto;
                    padding:32px;background:#07090F;border-radius:16px;text-align:center;">
          <h2 style="color:#4B7BFF;margin:0 0 6px;font-size:24px;letter-spacing:-0.5px">Kaargar</h2>
          <p style="color:#94A3B8;margin:0 0 28px;font-size:14px">Your one-time password</p>
          <div style="background:#141B26;border-radius:12px;padding:24px 32px;display:inline-block;">
            <span style="font-size:42px;font-weight:700;letter-spacing:12px;
                         color:#F0F4FF;font-family:monospace">{otp}</span>
          </div>
          <p style="color:#475569;font-size:12px;margin-top:20px;line-height:1.6">
            Valid for <strong style="color:#94A3B8">10 minutes</strong>.<br>
            Never share this code with anyone.
          </p>
        </div>
        """


# ── Send via Resend SDK ───────────────────────────────────────────────────────
async def _send_via_resend(to_email: str, subject: str, html: str) -> bool:
    """Returns True on success."""
    if not settings.resend_api_key:
        return False
    try:
        import resend
        resend.api_key = settings.resend_api_key

        # Use configured from-email if it's on a verified domain,
        # otherwise fall back to Resend's shared test address.
        # NOTE: onboarding@resend.dev only delivers to the Resend account-owner's
        # email. For any recipient, you must verify kaargar.in in Resend dashboard
        # and set SMTP_FROM_EMAIL=noreply@kaargar.in in Render env vars.
        configured = settings.smtp_from_email or ""
        if configured and not configured.endswith("@kaargar.in"):
            # Not a verified domain yet — use resend test address
            from_addr = "Kaargar <onboarding@resend.dev>"
        elif configured:
            from_addr = f"{settings.smtp_from_name} <{configured}>"
        else:
            from_addr = "Kaargar <onboarding@resend.dev>"

        params: resend.Emails.SendParams = {
            "from": from_addr,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
        result = resend.Emails.send(params)
        logger.info(f"[RESEND] Email sent to {to_email} — id={result.get('id', 'n/a')}")
        return True
    except Exception as e:
        logger.error(f"[RESEND] Failed to send to {to_email}: {e}", exc_info=True)
        return False


# ── Send via SMTP (aiosmtplib) ────────────────────────────────────────────────
async def _send_via_smtp(to_email: str, subject: str, html: str) -> bool:
    """Returns True on success."""
    if not settings.smtp_username or not settings.smtp_password:
        return False
    try:
        import aiosmtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))

        smtp_kwargs = dict(
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
        )
        if settings.smtp_port == 465:
            smtp_kwargs["use_tls"] = True
        else:
            smtp_kwargs["start_tls"] = True

        await aiosmtplib.send(msg, **smtp_kwargs)
        logger.info(f"[SMTP] Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"[SMTP] Failed to send to {to_email}: {e}")
        return False


# ── Public API ────────────────────────────────────────────────────────────────
async def send_otp_email(email: str, otp: str):
    """Send OTP email. Tries Resend → SMTP → console log."""

    # The OTP value itself is only ever logged outside production — an OTP
    # is a short-lived password, and logging it in cleartext in production
    # (where logs may be aggregated/retained/exported, e.g. to Sentry
    # breadcrumbs or a log platform) is a real credential-exposure risk for
    # anyone with log access. In development there's no real inbox to check
    # against, so this is the only way to see the code while testing.
    if settings.app_env == "production":
        logger.info("[OTP] Sending", extra={"email": email})
    else:
        logger.info("[OTP] Sending (dev — value included)", extra={"email": email, "otp": otp})

    html    = _otp_html(otp)
    subject = f"{otp} is your Kaargar OTP"

    # 1. Try Resend
    if await _send_via_resend(email, subject, html):
        return

    # 2. Try SMTP
    if await _send_via_smtp(email, subject, html):
        return

    # 3. Console fallback — still gated the same way as above.
    if settings.app_env == "production":
        logger.error("[OTP FALLBACK] No email provider configured — delivery failed", extra={"email": email})
    else:
        logger.warning(f"[OTP FALLBACK] No email provider configured. OTP={otp} for {email}")


# ── In-app notifications (Supabase inserts) ───────────────────────────────────
async def create_notification(db, user_id, type: str, title: str, body: str, data: dict):
    """
    Create the in-app notification row AND push it to the user's devices.

    Hooked here rather than at each call site on purpose: every notification in
    the app already funnels through this one function (job assigned, worker
    approved, bill approved, support reply, …), so wiring push here means all
    of them gain it at once and none can be forgotten later. A new notification
    type gets push for free by construction.

    Push is fire-and-forget and swallows its own errors — see services/push.py.
    The row is the source of truth; the notification bell and Realtime already
    work without any of this.
    """
    from models import Notification
    n = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        data=data or {},
    )
    db.add(n)
    await db.flush()

    from services.push import push_to_user
    await push_to_user(
        db,
        user_id,
        title,
        body,
        # `type` travels in the payload so the app can deep-link on tap
        # (job -> the job screen, support_reply -> the ticket thread).
        {**(data or {}), "type": type},
    )

    return n


async def notify_job_assigned(db, job):
    await create_notification(
        db=db,
        user_id=job.user_id,
        type="job_assigned",
        title="Worker Found!",
        body="A worker has been assigned to your job and is on the way.",
        data={"job_id": str(job.id)},
    )


async def post_system_message(db, job, event: str, text: str):
    """
    Insert a system_event chat message on the job's chat (created if missing).
    Used for job-completion-flow transitions: bill submitted, approved,
    disputed, payment confirmed. sender_id is required by the schema so we
    attribute it to the job owner; the frontend renders based on `type='system'`
    / `system_event`, not on sender, so this is invisible to the reader.
    """
    from sqlalchemy import select
    from models import Chat, Message

    result = await db.execute(select(Chat).where(Chat.job_id == job.id))
    chat = result.scalar_one_or_none()
    if not chat and job.worker_id:
        chat = Chat(job_id=job.id, user_id=job.user_id, worker_id=job.worker_id)
        db.add(chat)
        await db.flush()
    if not chat:
        return  # no worker assigned yet — nothing to post to

    db.add(Message(
        chat_id=chat.id,
        sender_id=job.user_id,
        sender_role="system",
        type="system",
        system_event=event,
        content=text,
        raw_content=text,
    ))
    await db.flush()


async def notify_worker_new_job(db, worker_user_id: uuid.UUID, job, request_id: uuid.UUID):
    await create_notification(
        db=db,
        user_id=worker_user_id,
        type="new_job_request",
        title="New Job Request",
        body=f"New job in {job.location_area or 'your area'}. Tap to accept.",
        data={"job_id": str(job.id), "request_id": str(request_id)},
    )
