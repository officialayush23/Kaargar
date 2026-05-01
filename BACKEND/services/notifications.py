"""
Notification service — in-app (Supabase insert) + email (SMTP).
On production: set SMTP_HOST/PORT/USERNAME/PASSWORD env vars.
Fallback: prints OTP to server logs so you can still test without SMTP.
"""

import uuid
import logging
from datetime import datetime, timezone

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path

from config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_jinja = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent.parent / "templates" / "email")),
    autoescape=select_autoescape(["html"]),
)


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


async def send_otp_email(email: str, otp: str):
    """Send OTP via SMTP. Falls back to console log if SMTP not configured."""

    # Always log for debugging (visible in Render/server logs)
    logger.warning(f"[OTP] email={email} otp={otp} (check SMTP config if not received)")
    print(f"[OTP DEBUG] Sending OTP {otp} to {email}", flush=True)

    # Skip actual send if SMTP not configured
    if not settings.smtp_username or not settings.smtp_password:
        logger.warning(f"[SMTP] No SMTP credentials — OTP {otp} for {email} logged only")
        print(f"[SMTP WARNING] SMTP not configured. OTP={otp} for {email}", flush=True)
        return

    try:
        template = _jinja.get_template("otp.html")
        html = template.render(otp=otp, app_name=settings.app_name)
    except Exception as tmpl_err:
        logger.error(f"[EMAIL] Template error: {tmpl_err}")
        html = f"""
        <div style="font-family:Arial;max-width:400px;margin:40px auto;padding:32px;background:#07090F;border-radius:16px;text-align:center;">
          <h2 style="color:#4B7BFF;margin:0 0 8px">kaargar</h2>
          <p style="color:#94A3B8;margin:0 0 24px">Your one-time password</p>
          <div style="background:#141B26;border-radius:12px;padding:20px;">
            <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#F0F4FF;font-family:monospace">{otp}</span>
          </div>
          <p style="color:#475569;font-size:12px;margin-top:16px">Valid for 10 minutes. Never share this.</p>
        </div>
        """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your Kaargar OTP: {otp}"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = email
    msg.attach(MIMEText(html, "html"))

    smtp_kwargs = dict(
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password,
    )

    # Resend uses port 465 with TLS, Gmail uses 587 with STARTTLS
    if settings.smtp_port == 465:
        smtp_kwargs["use_tls"] = True
    else:
        smtp_kwargs["start_tls"] = True

    try:
        await aiosmtplib.send(msg, **smtp_kwargs)
        logger.info(f"[EMAIL] OTP sent to {email}")
    except Exception as e:
        logger.error(f"[EMAIL] Failed to send OTP to {email}: {e}")
        print(f"[EMAIL ERROR] Failed: {e}. OTP={otp} for {email}", flush=True)


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
