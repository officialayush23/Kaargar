"""
Payments router — Razorpay order creation + webhook.
"""

import hmac
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from database import get_db
from models import User, Job, Payment
from schemas import PaymentOrderCreate, PaymentOrderResponse, PaymentResponse, SuccessResponse
from dependencies import get_current_user
from config import get_settings

settings = get_settings()
router = APIRouter()


def _razorpay_client():
    import razorpay
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


@router.post("/create-order", response_model=PaymentOrderResponse)
async def create_order(
    body: PaymentOrderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job_result = await db.execute(select(Job).where(Job.id == body.job_id, Job.user_id == user.id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if not job.final_price:
        raise HTTPException(400, "Job price not set yet")

    amount_paise = int(job.final_price * 100)
    client = _razorpay_client()
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": f"job_{job.id}",
    })

    existing = await db.execute(select(Payment).where(Payment.job_id == job.id))
    payment = existing.scalar_one_or_none()
    if payment:
        payment.razorpay_order_id = order["id"]
        payment.amount = job.final_price
    else:
        payment = Payment(
            job_id=job.id,
            user_id=user.id,
            amount=job.final_price,
            currency="INR",
            status="pending",
            razorpay_order_id=order["id"],
        )
        db.add(payment)
    await db.commit()

    return PaymentOrderResponse(
        razorpay_order_id=order["id"],
        amount=amount_paise,
        currency="INR",
        key_id=settings.razorpay_key_id,
    )


@router.post("/webhook")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if settings.razorpay_webhook_secret:
        expected = hmac.new(
            settings.razorpay_webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(400, "Invalid signature")

    import json
    payload = json.loads(body)
    event = payload.get("event", "")

    if event == "payment.captured":
        rp_payment = payload["payload"]["payment"]["entity"]
        rz_order_id = rp_payment.get("order_id")
        rz_payment_id = rp_payment.get("id")

        result = await db.execute(
            select(Payment).where(Payment.razorpay_order_id == rz_order_id)
        )
        payment = result.scalar_one_or_none()
        if payment:
            from datetime import datetime, timezone
            payment.status = "held"
            payment.razorpay_payment_id = rz_payment_id
            payment.payment_method = rp_payment.get("method")
            payment.held_at = datetime.now(timezone.utc)
            from datetime import timedelta
            payment.escrow_release_due_at = datetime.now(timezone.utc) + timedelta(hours=2)
            payment.last_webhook_event = event
            payment.last_webhook_at = datetime.now(timezone.utc)
            await db.commit()

    return {"status": "ok"}


@router.get("/{job_id}", response_model=PaymentResponse)
async def get_payment(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Payment).where(Payment.job_id == job_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(404)
    if payment.user_id != user.id:
        raise HTTPException(403)
    return payment
