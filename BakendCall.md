Got you — here’s a clean, production-ready **KAARGAR Backend README** you can drop straight into your repo.
It includes: architecture → DB schema guide → function reference → payment & payout lifecycle → FastAPI usage → examples → testing → best-practices.
No fluff, just a tight, dev-friendly document.

---

# **KAARGAR Backend — README (Backend Architecture + Usage Guide)**

**Tech Stack:** FastAPI · PostgreSQL · Supabase (Auth + Storage) · asyncpg · Razorpay/Stripe

---

# **1. Overview**

KAARGAR is a two-sided + company marketplace that connects:

* **Customers** → Workers (plumbers, electricians…)
* **Companies/Agencies** → Their workers, and can also hire workers
* **Platform Admins** → KYC, disputes, payouts, compliance

Key guarantees:

* All money flows through **platform escrow**.
* Payouts to workers after job completion.
* Platform fee automatically deducted (dynamic per global/company/category/worker rules).
* Complete audit logs, RLS-secured multi-role access, and idempotent webhook flows.

This doc explains *exactly* how backend developers should use:

* All DB tables
* All DB functions
* Payment & payout flows
* FastAPI code calling DB functions
* RLS behavior
* Testing checklist

---

# **2. Database Structure (What Each Table Stores)**

## **2.1 Identity Layer**

### `users`

Auth-mapped table. Contains identity + trust metrics.

| Field                                    | Purpose                                                    |
| ---------------------------------------- | ---------------------------------------------------------- |
| `id`                                     | matches Supabase Auth ID                                   |
| `email`, `phone`, `phone_masked`         | contact + masked version                                   |
| `role[]`                                 | `customer`, `worker`, `company_admin`, `admin`, `platform` |
| `location`                               | worker/customer map location                               |
| `rating_avg`, `rating_count`             | aggregated from `ratings`                                  |
| `cancellation_count`, `complaints_count` | trust metrics                                              |
| `tags[]`                                 | auto-flags like `cancels_often`, `has_complaints`          |
| `trouble_score`                          | numeric risk score                                         |

Use this table for:

* RLS identity
* Filtering (rating, flags)
* Worker & customer linking

---

## **2.2 Worker Layer**

### `worker_profiles`

Detailed worker info.

| Field                                | Purpose                    |
| ------------------------------------ | -------------------------- |
| `professions[]`                      | plumber, carpenter         |
| `skills[]`                           | specific capabilities      |
| `hourly_rate`, `min/max_hourly_rate` | worker preferences         |
| `accepts_remote`                     | remote jobs enabled        |
| `availability`                       | JSON calendar              |
| `search_radius_km`                   | worker’s job search radius |
| `documents`                          | KYCs, certificates         |
| `tags[]`                             | worker flags               |

Used for:

* Matching
* Eligibility
* Payout accounts (stored in metadata)

---

## **2.3 Marketplace**

### `jobs`

Customer/company posted tasks.

Key fields:

* `category` — job type
* `status` — `draft`, `posted`, `assigned`, `in_progress`, `completed`
* `assigned_worker_id`
* `location` OR `is_remote`
* `price_min/price_max` or fixed price

### `bids`

Used when jobs are bidding-based.
Workers post `amount` + message.

### `assignments`

Authoritative booking table.
Contains `scheduled_start/end`, acceptance timestamps.

---

## **2.4 Money Layer**

### `payments`

Single source of truth for money.

| Field              | Meaning                                       |
| ------------------ | --------------------------------------------- |
| `amount_total`     | from provider                                 |
| `platform_fee`     | computed via DB                               |
| `amount_to_worker` | after fee                                     |
| `status`           | initiated → captured → released/refunded      |
| `payout_status`    | not_initiated → scheduled → processing → paid |

### `wallets` / `wallet_transactions`

Ledger.

* `wallets.reserved` holds worker escrow until payout.
* Every money move generates a row in `wallet_transactions`.

### `payouts`

Tracks each payout to worker bank account.
Includes provider payout ID + status.

---

## **2.5 Trust, Support, Compliance**

| Table                                | Purpose               |
| ------------------------------------ | --------------------- |
| `kyc_documents`                      | worker KYC pipeline   |
| `ratings`                            | reviews               |
| `disputes`                           | conflict resolution   |
| `media_attachments`                  | bills/images          |
| `events`                             | audit log             |
| `webhook_logs`                       | webhook idempotency   |
| `push_notifications` / `push_tokens` | all notification logs |

---

## **2.6 Company Support**

| Table               | Purpose                     |
| ------------------- | --------------------------- |
| `companies`         | hospitals, agencies         |
| `company_users`     | admins for companies        |
| `company_employees` | link company → worker users |

---

# **3. DB Functions (Why They Exist & How to Use Them)**

## **3.1 Worker Search**

### `search_workers(lat, lon, radius, category, min_rate, max_rate, limit)`

Returns nearest + highest rated workers, ordered by platform rules.

Use in customer search page.

---

## **3.2 Fee Engine**

### `get_effective_fee_pct(job, company, worker, category)`

Resolves fee using precedence:
**worker → company → category → global**

Used internally by payment capture processing.

---

## **3.3 Payment Capture Processor**

### `process_payment_captured(payment_id, provider_payment_id, amount)`

Does everything:

* Validates idempotency
* Computes fee
* Sets `payments.status='captured'`
* Writes `platform_fee` & `amount_to_worker`
* Moves money into `wallets.reserved`
* Logs ledger entries
* Logs `events`

Called from provider webhook.

---

## **3.4 Schedule Payout**

### `schedule_payout_for_payment(payment_id, provider)`

Creates:

* new `payouts` row
* sets `payments.payout_status='scheduled'`

Then backend calls provider payout API.

---

## **3.5 Mark Payout Result**

### `mark_payout_result(payout_id, provider_payout_id, status, error)`

Handles:

* success → moves reserved → payout ledger
* failed → marks for retry
* writes event

Called from provider payout webhook.

---

# **4. Payment & Payout Lifecycle (Backend View)**

This is **the exact flow** your FastAPI backend must implement.

---

## **4.1 Customer Pays**

### Step 1 — Backend creates `payments` row

Status = `initiated`.

### Step 2 — Backend creates provider order

Add `{payment_id: <uuid>}` to provider metadata.

### Step 3 — Provider webhook → backend verifies → calls:

```
SELECT process_payment_captured(payment_id, provider_payment_id, amount);
```

DB computes fee + reserves worker funds.

---

## **4.2 Worker Completes Job**

When job is completed + confirmed:

Backend calls:

```
SELECT schedule_payout_for_payment(payment_id, 'razorpay');
```

DB creates payout row.

---

## **4.3 Backend calls provider transfer API**

Uses:

* worker beneficiary ID
* amount_to_worker

Marks payout row as processing.

---

## **4.4 Provider payout webhook → backend verifies → calls**

```
SELECT mark_payout_result(payout_id, provider_payout_id, 'success', NULL);
```

DB updates:

* `payouts.status = success`
* `payments.payout_status = paid`
* moves reserved → final ledger

---

# **5. FastAPI Usage Snippets**

## **5.1 Database Pool**

```python
import asyncpg, os
_pool = None

async def db():
    global _pool
    if not _pool:
        _pool = await asyncpg.create_pool(os.getenv("DATABASE_URL"))
    return _pool
```

---

## **5.2 Call search_workers()**

```python
rows = await conn.fetch(
    "SELECT * FROM public.search_workers($1,$2,$3,$4,$5,$6,$7)",
    lat, lon, radius, category, min_rate, max_rate, limit
)
```

---

## **5.3 Create payment intent**

```python
payment = await conn.fetchrow("""
  INSERT INTO payments (id, job_id, payer_id, amount_total, status)
  VALUES (gen_random_uuid(), $1, $2, $3, 'initiated')
  RETURNING id
""", job_id, user_id, amount)
```

---

## **5.4 Payment captured webhook**

```python
await conn.execute("""
  SELECT public.process_payment_captured($1, $2, $3)
""", payment_id, provider_payment_id, amount)
```

---

## **5.5 Schedule payout**

```python
payout = await conn.fetchrow("""
  SELECT public.schedule_payout_for_payment($1, $2) AS payout_id
""", payment_id, 'razorpay')
```

---

## **5.6 Mark payout result**

```python
await conn.execute("""
  SELECT public.mark_payout_result($1, $2, $3, $4)
""", payout_id, provider_id, 'success', None)
```

---

# **6. Where to put the code in your backend**

| Layer                | Responsibility                                         | Lives in             |
| -------------------- | ------------------------------------------------------ | -------------------- |
| Webhook Verification | signature checks, idempotency                          | `routes/webhook.py`  |
| Payment Initiation   | create DB row + provider order                         | `routes/payments.py` |
| Payout Initiation    | call `schedule_payout_for_payment` + provider transfer | `routes/payouts.py`  |
| Worker Search        | call `search_workers`                                  | `routes/search.py`   |
| KYC/Admin            | modify users, kyc_documents                            | `routes/admin.py`    |
| Background Workers   | retries, tagging, analytics                            | `tasks/worker.py`    |

---

# **7. RLS Behavior (What Each Role Can Do)**

| Role              | Can Read                      | Can Write                             |
| ----------------- | ----------------------------- | ------------------------------------- |
| **Customer**      | workers, jobs                 | own jobs, own payments, own messages  |
| **Worker**        | jobs in radius, assignments   | own worker_profile, bids, job updates |
| **Company Admin** | company workers, company jobs | manage company_employees, post jobs   |
| **Admin**         | everything                    | everything                            |
| **Service Role**  | bypasses RLS                  | used for webhooks/payouts             |

Backend always uses **service role** for:

* payment webhooks
* payout results
* admin-level flows
* internal batch jobs

---

# **8. Testing Scenarios (You MUST test these)**

### **A. Payment capture idempotency**

Run webhook twice → DB should update once.
`payments.status` should remain `captured`.
No duplicate `wallet_transactions`.

---

### **B. Payout success → ledger correctness**

* `wallets.reserved` decreases by payout amount
* `wallet_transactions` contains `payout` entry
* `payouts.status = success`
* `payments.payout_status = paid`

---

### **C. Customer search**

Search returns workers sorted by:

1. matches job type
2. highest-paying jobs
3. rating
4. distance

---

### **D. RLS correctness**

Try reading data using anon key:

* No private fields (phone) should leak
* Workers cannot read unrelated jobs
* Customers cannot view worker private metadata

---

# **9. Best Practices**

* Always log provider events in `webhook_logs` (unique index for event IDs).
* All money moves must create `wallet_transactions`.
* Use DB for final calculation of platform fee to avoid drift.
* Protect payout endpoint — only admin/service role.
* Validate assigned worker before allowing payout.
* Use exception-safe transactions (`asyncpg.transaction()`).
* Do NOT expose service role key to frontend.
* Use PG indexes: location GIST, rating, status.

---

# **10. Summary Cheat Sheet**

```
Payments:
  initiated -> captured -> (job completed) -> payout scheduled -> processing -> paid

DB Functions:
  process_payment_captured()  --> compute fee, reserve funds
  schedule_payout_for_payment()  --> create payout row
  mark_payout_result()  --> finalize money movement
  search_workers()  --> best-worker matching
  get_effective_fee_pct() --> fee rules engine

Service Role:
  Used for webhooks, payout updates, admin operations
```

---

# **11. Want a downloadable PDF?**

If you want, I can export this README as a formatted PDF with sections and diagrams.

Just say **“export README as PDF”**.
