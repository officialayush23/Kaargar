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

        # Use verified domain if configured, otherwise Resend's test address
        from_addr = "Kaargar <onboarding@resend.dev>"

        params: resend.Emails.SendParams = {
            "from": from_addr,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
        resend.Emails.send(params)
        logger.info(f"[RESEND] Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"[RESEND] Failed to send to {to_email}: {e}")
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

    # Always print to server logs (visible in Render dashboard)
    print(f"[OTP] email={email} otp={otp}", flush=True)
    logger.info(f"[OTP] Sending to {email}")

    html    = _otp_html(otp)
    subject = f"{otp} is your Kaargar OTP"

    # 1. Try Resend
    if await _send_via_resend(email, subject, html):
        return

    # 2. Try SMTP
    if await _send_via_smtp(email, subject, html):
        return

    # 3. Console fallback (always succeeds — OTP visible in logs)
    print(f"[OTP FALLBACK] No email provider configured. OTP={otp} for {email}", flush=True)
    logger.warning(f"[OTP FALLBACK] OTP={otp} for {email} — configure RESEND_API_KEY to send emails")


# ── In-app notifications (Supabase inserts) ───────────────────────────────────
async def create_notification(db, user_id, type: str, title: str, body: str, data: dict):
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


async def notify_worker_new_job(db, worker_user_id: uuid.UUID, job, request_id: uuid.UUID):
    await create_notification(
        db=db,
        user_id=worker_user_id,
        type="new_job_request",
        title="New Job Request",
        body=f"New job in {job.location_area or 'your area'}. Tap to accept.",
        data={"job_id": str(job.id), "request_id": str(request_id)},
    )
