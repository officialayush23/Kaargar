"""
Worker calendar — ONE timeline per worker (decided with Ayush, 2026-10-05).

Before this, each booking path checked only its own kind of booking:
  * slot bookings checked only that service's slot row (so a worker with two
    slot-based services could be sold 3 PM twice),
  * window / multi-day bookings checked only other window bookings,
  * instant dispatch checked nothing scheduled at all.

Every path now asks this module. It builds the worker's busy intervals from
EVERY source — slot jobs, window jobs (single + multi-day days), live instant
jobs, time off, manual blocks, blocked slots — and answers three questions:

  1. day_grid()      — which start times can this service still be booked at?
  2. month_summary() — per-day state for the customer calendar.
  3. find_conflict() — does a proposed booking overlap anything? (enforcement)

plus live_status() for the profile ("On a job · free ~4:30 PM").

Times: Kaargar is Pune-only, and slot / window / working-hour times are stored
as naive local times, so everything here is Asia/Kolkata wall-clock. Never use
date.today() on the server — Render runs in UTC, which is "yesterday" in IST
until 5:30 AM.

Slot maths (Ayush's choice: "service duration + buffer"):
  slot length  = service.duration_min (default 60) + slot_duration_buffer_min
  start times  = every GRID_MIN minutes inside working hours
  a start is free when [start, start + length) overlaps nothing busy
  daily cap    = service slot config max_slots_per_day (jobs per day, not starts)
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Job, Service, ServiceSlot, ServiceSlotConfig, WorkerAvailability,
    WorkerProfile, WorkerScheduleBlock, WorkerTimeOff,
)
from services.config import get_config

IST = ZoneInfo("Asia/Kolkata")
GRID_MIN = 30
DEFAULT_OPEN = (time(9, 0), time(21, 0))
NON_BLOCKING = ("completed", "cancelled", "failed")
LIVE_INSTANT = ("assigned", "worker_assigned", "confirmed", "en_route", "arrived", "started", "awaiting_approval", "approved")


def now_ist() -> datetime:
    return datetime.now(IST).replace(tzinfo=None)


def today_ist() -> date:
    return now_ist().date()


@dataclass
class Busy:
    start: datetime          # naive IST
    end: datetime            # naive IST
    kind: str                # 'job' | 'instant' | 'time_off' | 'block'
    job_id: uuid.UUID | None = None
    block_id: uuid.UUID | None = None
    label: str | None = None


@dataclass
class WorkerTimeline:
    worker_id: uuid.UUID
    hours: dict[int, tuple[time, time] | None]            # weekday -> open window (None = day off)
    busy: list[Busy] = field(default_factory=list)

    def busy_on(self, d: date) -> list[Busy]:
        s, e = datetime.combine(d, time.min), datetime.combine(d + timedelta(days=1), time.min)
        return [b for b in self.busy if b.start < e and b.end > s]

    def open_window(self, d: date) -> tuple[datetime, datetime] | None:
        h = self.hours.get(d.weekday())
        if not h:
            return None
        return datetime.combine(d, h[0]), datetime.combine(d, h[1])


def _overlaps(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> bool:
    # Half-open: a job ending 12:00 does not clash with one starting 12:00.
    return a0 < b1 and a1 > b0


async def _buffer_min(db: AsyncSession) -> int:
    return int(await get_config(db, "slot_duration_buffer_min", 60))


async def service_slot_params(db: AsyncSession, service: Service | None) -> tuple[int, int | None]:
    """(slot length in minutes incl. buffer, max jobs per day or None)."""
    buffer = await _buffer_min(db)
    duration = (service.duration_min if service and service.duration_min else 60)
    cap = None
    if service is not None:
        cfg = (await db.execute(
            select(ServiceSlotConfig).where(ServiceSlotConfig.service_id == service.id)
        )).scalar_one_or_none()
        cap = (cfg.max_slots_per_day if cfg else None) or service.max_slots_per_day
    return duration + buffer, cap


async def build_timeline(
    db: AsyncSession,
    worker_id: uuid.UUID,
    d_from: date,
    d_to: date,
    exclude_job_id: uuid.UUID | None = None,
) -> WorkerTimeline:
    """Every busy interval for `worker_id` touching [d_from, d_to] (inclusive)."""
    buffer = await _buffer_min(db)
    range_start = datetime.combine(d_from, time.min)
    range_end = datetime.combine(d_to + timedelta(days=1), time.min)

    # Weekly hours. A worker who never set them gets 9–21 every day (same
    # default the slot generator seeds), so a fresh profile is bookable.
    rows = (await db.execute(
        select(WorkerAvailability).where(WorkerAvailability.worker_id == worker_id)
    )).scalars().all()
    if rows:
        hours: dict[int, tuple[time, time] | None] = {i: None for i in range(7)}
        for r in rows:
            if r.is_open and r.end_time > r.start_time:
                hours[r.day_of_week] = (r.start_time, r.end_time)
    else:
        hours = {i: DEFAULT_OPEN for i in range(7)}

    tl = WorkerTimeline(worker_id=worker_id, hours=hours)

    # Jobs (non-terminal) — all kinds.
    q = select(Job).where(Job.worker_id == worker_id, Job.status.notin_(NON_BLOCKING))
    if exclude_job_id:
        q = q.where(Job.id != exclude_job_id)
    jobs = (await db.execute(q)).scalars().all()

    slot_ids = [j.slot_id for j in jobs if j.slot_id]
    slots = {}
    if slot_ids:
        slots = {s.id: s for s in (await db.execute(select(ServiceSlot).where(ServiceSlot.id.in_(slot_ids)))).scalars().all()}
    svc_ids = {j.service_id for j in jobs if j.service_id}
    durations = {}
    if svc_ids:
        durations = {s.id: (s.duration_min or 60) for s in (await db.execute(select(Service).where(Service.id.in_(svc_ids)))).scalars().all()}

    now = now_ist()
    instant_default = int(await get_config(db, "instant_job_default_minutes", 90))
    for j in jobs:
        label = j.title
        if j.slot_id and j.slot_id in slots:
            s = slots[j.slot_id]
            start = datetime.combine(s.slot_date, s.slot_start)
            # Generated slot rows are already duration + buffer long
            # (slot_duration_min = duration + slot_duration_buffer_min), so
            # no extra buffer here — adding it would double-pad.
            end = datetime.combine(s.slot_date, s.slot_end)
            tl.busy.append(Busy(start, end, "job", job_id=j.id, label=label))
        elif j.window_start and j.window_end and (j.assigned_date or j.preferred_days):
            days = [j.assigned_date] if j.assigned_date else [date.fromisoformat(x) for x in (j.preferred_days or []) if x]
            for d in days:
                tl.busy.append(Busy(
                    datetime.combine(d, j.window_start),
                    datetime.combine(d, j.window_end) + timedelta(minutes=buffer),
                    "job", job_id=j.id, label=label,
                ))
        elif j.scheduled_at:
            start = j.scheduled_at.astimezone(IST).replace(tzinfo=None)
            dur = durations.get(j.service_id, 60)
            tl.busy.append(Busy(start, start + timedelta(minutes=dur + buffer), "job", job_id=j.id, label=label))
        elif j.job_type == "instant" and j.status in LIVE_INSTANT:
            # Live instant job: occupies from acceptance until its estimated
            # end — and never "ends" in the past while still open, so a job
            # running long keeps blocking the next 30 min until it's closed.
            start = (j.assigned_at.astimezone(IST).replace(tzinfo=None) if j.assigned_at else now)
            end = max(start + timedelta(minutes=instant_default), now + timedelta(minutes=30))
            tl.busy.append(Busy(start, end + timedelta(minutes=buffer), "instant", job_id=j.id, label=label))

    # Time off.
    for t in (await db.execute(
        select(WorkerTimeOff).where(
            WorkerTimeOff.worker_id == worker_id,
            WorkerTimeOff.end_datetime > range_start.replace(tzinfo=IST),
            WorkerTimeOff.start_datetime < range_end.replace(tzinfo=IST),
        )
    )).scalars().all():
        tl.busy.append(Busy(
            t.start_datetime.astimezone(IST).replace(tzinfo=None),
            t.end_datetime.astimezone(IST).replace(tzinfo=None),
            "time_off", label=t.reason or "Time off",
        ))

    # Manual blocks (job_id NULL) — job-linked blocks are already covered above.
    for b in (await db.execute(
        select(WorkerScheduleBlock).where(
            WorkerScheduleBlock.worker_id == worker_id,
            WorkerScheduleBlock.job_id.is_(None),
            WorkerScheduleBlock.date >= d_from,
            WorkerScheduleBlock.date <= d_to,
        )
    )).scalars().all():
        tl.busy.append(Busy(datetime.combine(b.date, b.window_start), datetime.combine(b.date, b.window_end), "block", block_id=b.id, label="Blocked"))

    # Slots the worker blocked from the slot manager — worker-level on the
    # shared timeline.
    for s in (await db.execute(
        select(ServiceSlot).where(
            ServiceSlot.worker_id == worker_id, ServiceSlot.is_blocked == True,  # noqa: E712
            ServiceSlot.slot_date >= d_from, ServiceSlot.slot_date <= d_to,
        )
    )).scalars().all():
        tl.busy.append(Busy(datetime.combine(s.slot_date, s.slot_start), datetime.combine(s.slot_date, s.slot_end), "block", label=s.block_reason or "Blocked"))

    tl.busy.sort(key=lambda b: b.start)
    return tl


def _jobs_on(tl: WorkerTimeline, d: date) -> int:
    return len({b.job_id for b in tl.busy_on(d) if b.kind in ("job", "instant") and b.job_id})


def day_grid(tl: WorkerTimeline, d: date, slot_len: int, max_per_day: int | None, lead_min: int = 60) -> list[dict]:
    """
    Every grid start in working hours with a state:
      free | booked | unavailable (time off / block) | no_fit | past
    'booked' cells are shown greyed to customers (no details — Ayush's choice).
    When the day already holds max_per_day jobs, remaining free cells become
    'full'.
    """
    win = tl.open_window(d)
    if not win:
        return []
    open_at, close_at = win
    cutoff = now_ist() + timedelta(minutes=lead_min)
    busy = tl.busy_on(d)
    at_cap = max_per_day is not None and _jobs_on(tl, d) >= max_per_day
    out = []
    cur = open_at
    length = timedelta(minutes=slot_len)
    while cur + length <= close_at + timedelta(minutes=1):
        end = cur + length
        state = "free"
        inside = next((b for b in busy if b.start <= cur < b.end), None)
        hit = inside or next((b for b in busy if _overlaps(cur, end, b.start, b.end)), None)
        if cur < cutoff:
            state = "past"
        elif inside is not None:
            state = "booked" if inside.kind in ("job", "instant") else "unavailable"
        elif hit is not None:
            # Starts in a gap but the job wouldn't finish before the next
            # booking/block. Not "booked" (misleading) — clients hide these.
            state = "no_fit"
        elif at_cap:
            state = "full"
        out.append({"start": cur.strftime("%H:%M"), "end": end.strftime("%H:%M"), "state": state})
        cur += timedelta(minutes=GRID_MIN)
    return out


def day_state(tl: WorkerTimeline, d: date, grid: list[dict]) -> dict:
    today = today_ist()
    free = sum(1 for c in grid if c["state"] == "free")
    total = len(grid)
    if d < today:
        state = "past"
    elif not tl.open_window(d):
        state = "day_off"
    else:
        o, c = tl.open_window(d)
        if any(b.kind == "time_off" and b.start <= o and b.end >= c for b in tl.busy_on(d)):
            state = "leave"
        elif free == 0:
            state = "full"
        elif free <= 2:
            state = "few"
        else:
            state = "available"
    return {"date": d.isoformat(), "state": state, "free": free, "total": total, "jobs": _jobs_on(tl, d)}


def find_conflict(tl: WorkerTimeline, start: datetime, end: datetime) -> Busy | None:
    return next((b for b in tl.busy if _overlaps(start, end, b.start, b.end)), None)


def conflict_message(b: Busy) -> str:
    when = f"{b.start.strftime('%d %b, %I:%M %p').lstrip('0')}"
    if b.kind == "time_off":
        return f"This pro is away on {b.start.strftime('%d %b')}. Pick another day."
    if b.kind == "block":
        return f"This pro isn't taking bookings around {when}. Pick another time."
    return f"This pro is already booked around {when}. Pick another time."


def outside_hours(tl: WorkerTimeline, start: datetime, end: datetime) -> bool:
    win = tl.open_window(start.date())
    return not win or start < win[0] or end > win[1] + timedelta(minutes=1)


async def live_status(db: AsyncSession, wp: WorkerProfile, tl: WorkerTimeline | None = None) -> dict:
    """What the profile shows right now."""
    today = today_ist()
    if tl is None:
        tl = await build_timeline(db, wp.id, today, today + timedelta(days=7))
    now = now_ist()
    cur = next((b for b in tl.busy if b.start <= now < b.end), None)
    if cur and cur.kind == "time_off":
        return {"state": "away", "until": cur.end.isoformat(timespec="minutes")}
    if cur and cur.kind in ("job", "instant"):
        # Round "free from" up to the next quarter hour — exact minutes read as fake precision.
        free_at = cur.end + timedelta(minutes=(15 - cur.end.minute % 15) % 15)
        return {"state": "on_job", "free_from": free_at.replace(second=0, microsecond=0).isoformat(timespec="minutes")}
    if wp.status == "online":
        return {"state": "available_now"}
    win = tl.open_window(today)
    if win and win[0] <= now < win[1]:
        return {"state": "taking_bookings"}
    return {"state": "offline"}


async def next_free(db: AsyncSession, tl: WorkerTimeline, service: Service | None, days: int = 7) -> str | None:
    slot_len, cap = await service_slot_params(db, service)
    d = today_ist()
    for i in range(days):
        day = d + timedelta(days=i)
        for c in day_grid(tl, day, slot_len, cap):
            if c["state"] == "free":
                return f"{day.isoformat()}T{c['start']}"
    return None


async def busy_worker_ids_for_instant(db: AsyncSession, worker_ids: list[uuid.UUID], minutes: int) -> set[uuid.UUID]:
    """
    Workers who can't take an instant job starting now because it would run
    into something already on their timeline within `minutes` (estimated job
    length + buffer). Batched: one timeline per candidate is fine at dispatch
    sizes (≤ a few dozen).
    """
    if not worker_ids:
        return set()
    now = now_ist()
    end = now + timedelta(minutes=minutes)
    blocked = set()
    for wid in worker_ids:
        tl = await build_timeline(db, wid, now.date(), end.date())
        if find_conflict(tl, now, end):
            blocked.add(wid)
    return blocked


async def lock_worker(db: AsyncSession, worker_id: uuid.UUID) -> None:
    """
    Serialise bookings for ONE worker for the rest of this transaction.

    The check-then-insert in every booking path is otherwise racy: two
    customers can both see 3 PM free and both commit. A transaction-scoped
    advisory lock keyed on the worker makes the second request wait for the
    first to commit, then re-check against a timeline that includes it. Scoped
    per worker, so bookings for different workers never contend.
    """
    from sqlalchemy import text
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"worker:{worker_id}"})


async def assert_free(
    db: AsyncSession,
    worker_id: uuid.UUID,
    intervals: list[tuple[datetime, datetime]],
    *,
    exclude_job_id: uuid.UUID | None = None,
    check_hours: bool = True,
    add_buffer: bool = True,
) -> None:
    """409 if any proposed interval (naive IST) overlaps the worker's timeline or falls outside hours."""
    from fastapi import HTTPException
    if not intervals:
        return
    await lock_worker(db, worker_id)
    d_from = min(s.date() for s, _ in intervals)
    d_to = max(e.date() for _, e in intervals)
    tl = await build_timeline(db, worker_id, d_from, d_to, exclude_job_id=exclude_job_id)
    buffer = timedelta(minutes=await _buffer_min(db)) if add_buffer else timedelta(0)
    for s, e in intervals:
        if check_hours and outside_hours(tl, s, e):
            win = tl.open_window(s.date())
            if not win:
                raise HTTPException(409, f"This pro doesn't work on {s.strftime('%A')}s. Pick another day.")
            raise HTTPException(
                409,
                f"This pro works {win[0].strftime('%I:%M %p').lstrip('0')}–{win[1].strftime('%I:%M %p').lstrip('0')} on {s.strftime('%A')}s. Pick a time inside those hours.",
            )
        hit = find_conflict(tl, s, e + buffer)
        if hit:
            raise HTTPException(409, conflict_message(hit))


async def slot_rows(db: AsyncSession, service: Service, d_from: date, d_to: date) -> dict[date, list[ServiceSlot]]:
    rows = (await db.execute(
        select(ServiceSlot).where(
            ServiceSlot.service_id == service.id,
            ServiceSlot.slot_date >= d_from, ServiceSlot.slot_date <= d_to,
        ).order_by(ServiceSlot.slot_date, ServiceSlot.slot_start)
    )).scalars().all()
    out: dict[date, list[ServiceSlot]] = {}
    for r in rows:
        out.setdefault(r.slot_date, []).append(r)
    return out


def slot_grid(tl: WorkerTimeline, d: date, rows: list[ServiceSlot], lead_min: int = 30) -> list[dict]:
    """
    Same cell shape as day_grid, but for slot-based services the bookable
    starts are the generated ServiceSlot rows (what POST /jobs/book-slot
    accepts), not the 30-min grid — otherwise a customer could pick 10:30 on
    the calendar when the slots run 09:00, 11:15, …
    """
    cutoff = now_ist() + timedelta(minutes=lead_min)
    out = []
    for r in rows:
        st, en = datetime.combine(d, r.slot_start), datetime.combine(d, r.slot_end)
        hit = find_conflict(tl, st, en)
        if st < cutoff:
            state = "past"
        elif r.is_blocked:
            state = "unavailable"
        elif r.booked_count >= r.capacity:
            state = "booked"
        elif hit and not (hit.kind == "job" and r.capacity > 1 and hit.start == st):
            state = "booked" if hit.kind in ("job", "instant") else "unavailable"
        else:
            state = "free"
        out.append({"start": r.slot_start.strftime("%H:%M"), "end": r.slot_end.strftime("%H:%M"), "state": state, "slot_id": str(r.id)})
    return out
