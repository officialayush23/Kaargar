from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Category, PuneArea
from schemas import CategoryResponse, PuneAreaResponse
from typing import Optional

router = APIRouter()


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
