from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Category, PuneArea
from schemas import CategoryResponse, PuneAreaResponse
from services.config import get_config
from typing import Optional

router = APIRouter()


@router.get("/pricing-info")
async def get_pricing_info(db: AsyncSession = Depends(get_db)):
    """
    Public, non-sensitive pricing constants used to render an honest price
    breakdown on the client (NewJobPage's Estimate step) — real platform-fee
    and GST rates, sourced from platform_config with the same fallback
    defaults services/matching.calc_commission uses, instead of the
    frontend fabricating its own numbers (which is what caused a permanent,
    unconditional "15% surge" to render for every single instant booking —
    it was never actually demand-driven, just a hardcoded multiplier).
    """
    commission_instant_rate = await get_config(db, "commission_instant_rate", Decimal("0.12"))
    gst_rate = await get_config(db, "gst_rate", Decimal("0.18"))
    return {
        "commission_instant_rate": float(commission_instant_rate),
        "gst_rate": float(gst_rate),
    }


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    mode: Optional[str] = Query(None, pattern="^(instant|discovery|both)$"),
    db: AsyncSession = Depends(get_db),
):
    q = select(Category).where(Category.is_active == True).order_by(Category.sort_order)
    if mode:
        q = q.where((Category.mode == mode) | (Category.mode == "both"))
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/areas", response_model=list[PuneAreaResponse])
async def list_areas(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PuneArea).where(PuneArea.is_active == True).order_by(PuneArea.name)
    )
    return result.scalars().all()
