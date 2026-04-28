"""
Notification service — in-app (Supabase insert) + email (SMTP).
"""

import uuid
from datetime import datetime, timezone

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path

from config import get_settings

settings = get_settings()

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
    try:
        template = _jinja.get_template("otp.html")
        html = template.render(otp=otp, app_name=settings.app_name)
    except Exception:
        html = f"<p>Your Kaargar OTP is: <strong>{otp}</strong></p><p>Valid for 10 minutes.</p>"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your Kaargar OTP: {otp}"
    msg["From"] = settings.smtp_from_email
    msg["To"] = email
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            start_tls=True,
        )
    except Exception as e:
        print(f"[EMAIL] Failed to send OTP to {email}: {e}")


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
