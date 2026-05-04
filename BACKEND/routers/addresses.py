"""
User saved addresses router.
GET    /v1/addresses          — list all saved addresses for current user
POST   /v1/addresses          — create new address
PATCH  /v1/addresses/{id}     — update label/details
DELETE /v1/addresses/{id}     — remove address
POST   /v1/addresses/{id}/default — set as default
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from database import get_db
from models import User, UserAddress
from schemas import UserAddressCreate, UserAddressUpdate, UserAddressResponse, SuccessResponse
from dependencies import get_current_user

router = APIRouter()


@router.get("", response_model=list[UserAddressResponse])
async def list_addresses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAddress)
        .where(UserAddress.user_id == user.id)
        .order_by(UserAddress.is_default.desc(), UserAddress.created_at.asc())
    )
    return result.scalars().all()


@router.post("", response_model=UserAddressResponse, status_code=201)
async def create_address(
    body: UserAddressCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # If this is being set as default, clear any existing default first
    if body.is_default:
        existing = await db.execute(
            select(UserAddress).where(UserAddress.user_id == user.id, UserAddress.is_default == True)
        )
        for addr in existing.scalars():
            addr.is_default = False

    addr = UserAddress(
        user_id=user.id,
        label=body.label,
        address_line=body.address_line,
        area=body.area,
        city=body.city,
        lat=body.lat,
        lon=body.lon,
        place_id=body.place_id,
        is_default=body.is_default,
    )
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    return addr


@router.patch("/{address_id}", response_model=UserAddressResponse)
async def update_address(
    address_id: UUID,
    body: UserAddressUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id)
    )
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(404, "Address not found")

    # If setting as default, clear existing default
    if body.is_default:
        existing = await db.execute(
            select(UserAddress).where(UserAddress.user_id == user.id, UserAddress.is_default == True, UserAddress.id != address_id)
        )
        for a in existing.scalars():
            a.is_default = False

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(addr, field, value)

    await db.commit()
    await db.refresh(addr)
    return addr


@router.delete("/{address_id}", response_model=SuccessResponse)
async def delete_address(
    address_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id)
    )
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(404, "Address not found")

    await db.delete(addr)
    await db.commit()
    return SuccessResponse(message="Address deleted")


@router.post("/{address_id}/default", response_model=UserAddressResponse)
async def set_default_address(
    address_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Clear existing default
    existing = await db.execute(
        select(UserAddress).where(UserAddress.user_id == user.id, UserAddress.is_default == True)
    )
    for a in existing.scalars():
        a.is_default = False

    # Set new default
    result = await db.execute(
        select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id)
    )
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(404, "Address not found")

    addr.is_default = True
    await db.commit()
    await db.refresh(addr)
    return addr
