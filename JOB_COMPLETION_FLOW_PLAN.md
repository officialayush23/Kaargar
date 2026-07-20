# Job Completion Flow — Implementation Plan

Covers the remaining unbuilt pieces from the UI Cross-Check checklist: worker job-input (photos/extra items), customer bill approval, completion OTP + payment trigger, and chat notifications for each step. Slot display (Section 1) is out of scope here — it already has DB + partial UI support and should be audited separately.

This plan was written against the live schema and code as of today (checked via Supabase MCP + repo read), not assumptions. Nothing has been built yet — this is the design to review before I touch the database or write code.

---

## 1. Current state (confirmed)

- `jobs.job_photos` is a single flat `ARRAY(Text)` — no before/after distinction, no extra items, no approval state.
- `jobs.status` goes `assigned → en_route → arrived → started → completed` directly. No `awaiting_approval` / `disputed` state exists.
- Payment (`routers/payments.py`) is triggered by `POST /payments/create-order`, which trusts `job.final_price` as already set — there's no point in the flow today where a customer approves a bill before payment, and no completion OTP at all.
- `chats` / `messages` tables already support `system_event` (string field on `Message`) for system-generated chat entries, but `ChatPage.jsx` doesn't render them distinctly yet — they'd render as blank/generic messages currently.
- `sos_events` table already exists (`job_id`, `triggered_by`, `status`, `notes`) — built for mid-job SOS, and is the natural mechanism to reuse for "customer rejects bill → dispute", per your requirement that rejection reuse the SOS path rather than a separate one.
- Login OTP (Supabase email OTP) is completely separate infrastructure from what's needed here — confirmed no `job_otp` concept exists anywhere.

---

## 2. Database changes (migration `010_job_completion_flow.sql`)

**`jobs` table — add columns:**
| Column | Type | Purpose |
|---|---|---|
| `before_photos` | `ARRAY(Text)` | replaces ambiguous use of `job_photos` for the "before" phase |
| `after_photos` | `ARRAY(Text)` | "after" phase photos |
| `extra_items_total` | `Numeric(10,2)` | denormalized sum, recomputed server-side on every item add/remove |
| `approved_total` | `Numeric(10,2)` | base + extras, locked at the moment customer approves — this becomes the only amount payments can charge |
| `approved_at` | `timestamptz` | |
| `completion_otp_code` | `String(6)` | generated on approve, never exposed to worker via any response |
| `completion_otp_expires_at` | `timestamptz` | approve time + 4h (long enough for a job running late, short enough to matter) |
| `completion_otp_attempts` | `Integer default 0` | for lockout |
| `completion_otp_locked_until` | `timestamptz` | set after 5 failed attempts, +15 min cooldown |

**New table `job_extra_items`:**
```
id, job_id (FK), name, cost (Numeric 10,2, check > 0 and <= 50000),
item_photo_url, bill_photo_url, created_at, created_by (worker_profiles.id)
```
Row-level: worker can insert/delete while `job.status = 'started'`; becomes immutable once `submitted_for_approval` fires (enforced in the endpoint, not just UI).

**`jobs.status` — new values added to the existing string column (no enum, matches current pattern):**
`awaiting_approval` (worker submitted, waiting on customer) → `approved` (customer approved, OTP live, waiting for worker to enter it) → `disputed` (customer rejected, routed to `sos_events`) → existing `completed`.

No new table needed for approval state — it's just `jobs.status` + the new columns above, kept in the existing model rather than fragmenting job state across tables.

---

## 3. Backend (routers/jobs.py unless noted)

| Endpoint | Who | Effect |
|---|---|---|
| `POST /jobs/{id}/photos` | worker | `phase: before\|after`, appends to `before_photos`/`after_photos` (reuses `services/storage.py` upload helper, same pattern as `upload.py`) |
| `POST /jobs/{id}/extra-items` | worker | validates cost 0 < x <= 50000 server-side (not just frontend), requires both `item_photo_url` and `bill_photo_url` already uploaded, recomputes `extra_items_total` |
| `DELETE /jobs/{id}/extra-items/{item_id}` | worker | only while `status = 'started'` |
| `POST /jobs/{id}/submit-for-approval` | worker | requires ≥1 before photo, ≥1 after photo; sets `status = 'awaiting_approval'`; posts a `system_event` chat message ("Bill ready for review") + a `notifications` row for the customer |
| `POST /jobs/{id}/approve` | customer | server computes `approved_total = final_price(base) + extra_items_total`, generates 6-digit `completion_otp_code` via `secrets.randbelow`, sets `completion_otp_expires_at`, `status = 'approved'`; posts system chat message + notification to worker ("Customer approved — share the code they give you"). **OTP code itself is never included in any response the worker's client can reach** — only a boolean `otp_generated: true`. |
| `POST /jobs/{id}/reject` | customer | requires `reason` text; creates a `SosEvent` row (`triggered_by_role='user'`, `notes=reason`) reusing the existing SOS mechanism per your requirement; sets `status = 'disputed'`; notifies worker + admin |
| `GET /jobs/{id}/completion-code` | customer only | returns the plaintext OTP for display — 403 for worker role even if they guess the endpoint |
| `POST /jobs/{id}/verify-otp` | worker | checks `completion_otp_locked_until`, compares code, increments `completion_otp_attempts` on mismatch (locks after 5), on match sets `status = 'completed'`, `completed_at`, clears the OTP fields, and **synchronously calls `payments.create_order` internally** using `approved_total` — not `final_price` — so the frontend never supplies the charged amount |
| `routers/payments.py::create_order` | — | change source of truth from `job.final_price` to `job.approved_total` when it's set (falls back to `final_price` for instant/discovery jobs that skip this flow, e.g. package redemptions) |

All chat system messages route through a small helper in `services/notifications.py` (already exists for DB notifications) extended to also insert a `Message(system_event=...)` row on the job's chat — one call site, reused for every transition above plus dispute/SOS.

---

## 4. Frontend

**Worker side** (extends `ActiveJobPage.jsx`, which currently jumps `started → completed` with no intermediate steps):
- `BeforePhotosStep` — camera-capture input (`capture="environment"` attribute for mobile camera), min 1 photo enforced before "Next" enables, upload progress + failure retry (no silent fail)
- `ExtraItemsStep` — repeatable form (name, cost, item photo, bill photo), live running total, edit/remove before submit, sane cap (e.g. 20 items) rather than a hard block
- `AfterPhotosStep` — same pattern as before-photos
- `SubmitReviewStep` — read-only recap of everything (this is literally what the customer will see next), single "Submit for approval" action, then a persistent "Waiting for customer…" state that flips automatically via the existing Supabase Realtime job-status subscription (already wired in `ActiveJobPage.jsx`)
- `CompletionCodeEntry` — numeric input, shown once `status='approved'`, wrong-code error state + attempt counter surfaced from the 429/423-style response

**Customer side** (new `JobApprovalPage.jsx`):
- Before/after photos, itemized list (each row: name, cost, tappable item photo, tappable bill photo — full-resolution on tap via a lightbox, not just a thumbnail), total
- Approve / Reject, visually separated (not adjacent same-style buttons — Approve as primary filled button, Reject as a secondary/outline action requiring a confirm + reason field)
- On approve → `CompletionCodeDisplay` (large digits, "share this with your service provider", copy-safe against accidental worker visibility since it's a separate endpoint gated by role)
- On reject → reason form → routes into existing SOS/dispute UI rather than a new disconnected flow

**Payment:** unchanged trigger point technically (Razorpay checkout still opens client-side on the customer's device), but now fires automatically once realtime shows `status='completed'` rather than being a manually-initiated action — customer sees a "processing" state, not a button they have to hunt for.

**Chat (both worker and user, `ChatPage.jsx`):** render `system_event` messages as centered pill-style system rows (not bubbles), one per transition: bill submitted / approved / rejected+dispute / payment confirmed. This is the concrete "chat to everything" piece — today these events are invisible in chat because the frontend doesn't render `system_event` at all.

---

## 5. Sequencing

1. Migration `010_job_completion_flow.sql` (jobs columns + `job_extra_items` table) — I'll show you the SQL before applying via the Supabase MCP.
2. Backend: photos → extra-items → submit-for-approval → approve/reject → verify-otp → payment source change. Each testable independently via the existing admin/job endpoints before frontend exists.
3. Frontend worker flow (before → items → after → submit → waiting → OTP entry).
4. Frontend customer flow (approval screen → OTP display).
5. Chat system-message rendering (small, can land any time after step 1 since it only needs `system_event` to start appearing).
6. End-to-end test: create a test job through the full lifecycle in Supabase, verify commission math still matches `calculate_commission()` against `approved_total`.

## 6. Assumptions (flag if wrong)

- Completion OTP is numeric, 6 digits, 4-hour expiry, 5-attempt lockout with 15-min cooldown — no source in your checklist specified exact numbers, these are reasonable defaults.
- Extra item cap: ₹50,000 per item (typo-catch ceiling) and 20 items per job — adjust if a real job could exceed either.
- Dispute reuses `sos_events` verbatim rather than a new `job_disputes` table, per your explicit requirement in Section 3. (no make another table)
- Package-redemption jobs (`source='package'`) and instant jobs without extra work stay on the existing `final_price` → `create_order` path untouched; this flow only applies where a worker actually submits a bill for approval.



job_before_after is the bucket in supabase to store the photos / video for before and after.

job_item_photos for item photos and slips.


i want a table which connects jobs to the items photos , their recipets and their amt and then approved or not.

then also make sure the queries are fast and efficient.

Integrate Razorpay Standard Web Checkout into this codebase.

=== CREDENTIALS ===

RAZORPAY_KEY_ID: rzp_test_TFm85p0HKJ3312
RAZORPAY_KEY_SECRET: BYTkq4UURSmxu76DW3WSXePt

=== TASK ===

Detect the project stack and implement Razorpay Standard Checkout with:
1. Backend endpoint to create orders
2. Frontend checkout button with payment modal
3. Backend endpoint to verify payment signature

=== IMPLEMENTATION DETAILS ===

STEP 1: BACKEND - Create Order
- Endpoint: POST /api/create-order (or framework equivalent)
- Call Razorpay API: POST https://api.razorpay.com/v1/orders
- Request: { amount (paise), currency, receipt }
- Return: { order_id, amount, currency }
- Minimum amount: 100 paise

STEP 2: FRONTEND - Checkout
- Script: <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
- On button click: call create-order, then open Razorpay modal with order_id
- On success: receive razorpay_payment_id, razorpay_order_id, razorpay_signature
- Send all three to verify endpoint

STEP 3: BACKEND - Verify Signature
- Endpoint: POST /api/verify-payment (or framework equivalent)
- Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
- Compare generated signature with razorpay_signature
- Return success only if signatures match

=== ENVIRONMENT SETUP ===

Create .env file:
RAZORPAY_KEY_ID=rzp_test_TFm85p0HKJ3312
RAZORPAY_KEY_SECRET=BYTkq4UURSmxu76DW3WSXePt

Frontend framework prefixes (KEY_ID only, never KEY_SECRET):
- Next.js: NEXT_PUBLIC_RAZORPAY_KEY_ID
- Vite: VITE_RAZORPAY_KEY_ID
- CRA: REACT_APP_RAZORPAY_KEY_ID

Add .env to .gitignore.

=== SDK INSTALLATION ===

Node.js: npm install razorpay
Python: pip install razorpay
PHP: composer require razorpay/razorpay
Ruby: gem install razorpay
Go: go get github.com/razorpay/razorpay-go

=== OPERATION ORDER ===

Execute in this sequence:
1. Install dependencies first
2. Create .env file
3. Create or modify code files
4. Verify setup

=== ERROR HANDLING ===

Backend - Create Order:
- Validate amount >= 100 paise
- Handle Razorpay API errors (return 500)
- Handle auth failures (return 401)

Backend - Verify Signature:
- Signature mismatch: return 400, do NOT mark as paid
- Missing fields: return 400

Frontend:
- Handle modal dismiss (user cancelled)
- Handle payment.failed event
- Show error messages to user

=== EDGE CASES ===

If no backend framework detected:
- Stop and explain that Razorpay requires a backend for order creation
- Suggest serverless functions (Vercel/Netlify) or Razorpay Payment Links

If Razorpay already integrated:
- Do not duplicate code
- Only fix or complete missing parts

If static site only:
- Suggest adding serverless API routes
- Or suggest Razorpay Payment Links as alternative

=== REQUIREMENTS ===

- Never hardcode credentials in source files
- KEY_SECRET must never reach frontend code
- Use environment variables everywhere
- Follow existing code style in the project
- Do not create database tables unless project already has a database

=== REFERENCE ===

Documentation: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/

=== OUTPUT ===

After completing integration:
1. List files created or modified
2. Explain how to test (e.g., start server, click pay button)
3. Note any manual steps required

Begin integration now.