# Kaargar — UI Cross-Check Requirements
### Slots · Worker Job Input · Customer Approval · OTP + Payment

Stack context for this checklist: React (Vite) frontend, Supabase (DB, Auth, Storage), FastAPI backend, Mapbox + Google Places for location, Razorpay for payment. Use this to cross-check the existing build screen-by-screen — each section lists required states, elements, and edge cases.

---

## 1. Slot Display — Customer vs. Worker

### 1.1 Customer-facing (Discover → worker profile → book)
Required states/elements:
- [ ] Week view showing **only open/bookable slots** — no visual indication of which slots are booked (no strikethrough "unavailable," no greyed-out booked slots visible as a list — those slots simply don't appear)
- [ ] Week navigation (prev/next week arrows) — pulls fresh availability from backend per week, not cached from initial load
- [ ] Each open slot shows: date, time range, and a "Book" action
- [ ] If a worker has **zero open slots** for the visible week, show an empty state (e.g. "No slots available this week — try next week or search other workers"), not a blank/broken grid
- [ ] Timezone handling: all times shown in the customer's local time (should be IST throughout for India-only launch, but confirm no UTC leakage in raw values shown to user)
- [ ] Selecting a slot moves to booking confirmation (service + price + address) before final submit — slot isn't locked until submit completes

Data dependency check:
- [ ] Confirm the query backing this view filters by worker's defined availability MINUS already-booked slots MINUS any blocked/leave time — not just raw availability table
- [ ] Confirm double-booking is prevented at the DB layer (unique constraint or transaction check on worker_id + slot), not just UI-level disabling — race condition risk if two customers book the same slot simultaneously

### 1.2 Worker-facing (dashboard)
This is the opposite of customer view — worker needs to see **everything**, not just open slots.

Required states/elements:
- [ ] Full calendar/list view showing all bookings: past, today, upcoming — each with status (scheduled/in-progress/completed/cancelled)
- [ ] Ability to set/edit weekly recurring availability (which days/hours they're open for Scheduled bookings)
- [ ] Ability to block out specific dates/times (leave, personal time) independent of recurring availability
- [ ] Online/offline toggle for Instant-job eligibility — clearly visible, persistent state (confirm it survives page refresh/reconnect, not just local component state)
- [ ] Upcoming appointment reminder — visually distinct as the scheduled time approaches (e.g. "in 30 min" highlight)
- [ ] Tapping a booking opens full detail: customer name, address (with map), service requested, customer's job description/photos if provided at booking time

### 1.3 Alerts (Worker side)
- [ ] **Instant job incoming**: real-time popup/modal with countdown timer (matches the waterfall accept-window, e.g. 8 sec), showing profession/service, base pay, approx. location — Accept / Decline actions
- [ ] Confirm this is pushed via Supabase Realtime (or polling fallback) and actually interrupts/surfaces even if worker is on a different screen in the app — not just a toast that can be missed
- [ ] What happens if the worker doesn't respond in time — does the UI auto-close and mark as declined/expired, matching backend waterfall cascade?
- [ ] **New scheduled booking confirmed**: notification (in-app + email via Supabase, since no SMS/push) when a customer books a slot
- [ ] **Customer approved/rejected the bill**: alert when customer acts on the itemized bill submission (see Section 3) — worker shouldn't have to manually refresh to know
- [ ] **Dispute/SOS raised against them**: alert, distinct styling from normal notifications given urgency

---

## 2. Worker Job-Input UI (Photos, Receipts, Extra Items, Amount)

Screen sequence to check: **Arrived → Before Photos → (work happens) → Extra Items (if any) → After Photos → Submit for Approval**

### 2.1 Before / After Photos
- [ ] Camera/file-upload input, mobile-camera-friendly (accepts direct capture on mobile browsers, not just file picker)
- [ ] Minimum photo count enforced? (e.g. at least 1 before, 1 after) — confirm whether this is required or optional in current build
- [ ] Upload progress indicator; confirm upload actually completes to Supabase Storage before allowing "Next" (no silent failure if upload fails on poor connection)
- [ ] Photos are tied to the correct booking_id and phase (before/after) in storage path/metadata — cross-check they don't get mixed up across concurrent jobs if a worker somehow has two active bookings

### 2.2 Extra Equipment / Items
For each item added:
- [ ] Item name (text input)
- [ ] Cost (numeric input, validate positive number, reasonable max to catch typos e.g. ₹0 or ₹99999 fat-finger)
- [ ] Photo of the item itself
- [ ] Photo/scan of the purchase bill/receipt
- [ ] "Add another item" repeatable — confirm no hard cap that would break on a job with many parts, or a sane cap is enforced
- [ ] Ability to remove/edit an item before final submission
- [ ] Running itemized total displayed live: base pay + sum of extra items = total, updates as items are added/removed

### 2.3 Submit for Approval
- [ ] Final review screen before submit: shows before photos, after photos, itemized list with all item photos/bills, and total — worker should see exactly what the customer is about to see
- [ ] "Submit for customer approval" action locks this record (worker shouldn't be able to edit items after submission without going through the dispute/re-quote path)
- [ ] Confirm booking status correctly transitions to `awaiting_customer_approval` in DB on submit
- [ ] Worker-side screen after submit: waiting state ("Waiting for customer approval") — not a dead end, should update automatically when customer responds

---

## 3. Customer Approval UI

- [ ] Customer receives alert/notification that a bill is ready for review (matches worker-side submit action)
- [ ] Approval screen shows: before photos, after photos, base pay line item, each extra item as its own line (name, cost, item photo, bill photo — tappable to zoom/view full size), total amount
- [ ] Photos/bills must be clearly viewable at full resolution on tap (not just thumbnails) — a customer approving a bill should be able to actually read the receipt
- [ ] Two clear actions: **Approve** and **Reject / Raise Dispute** — visually distinct (Approve should not be a default/pre-selected or easily-mis-tapped action next to Reject)
- [ ] **On Approve**: booking moves to next state (OTP step, Section 4) — confirm this transition happens correctly and worker is notified immediately
- [ ] **On Reject**: routes into the Dispute SOS flow (should reuse the same dispute mechanism as mid-job SOS, not a separate disconnected path) — customer should be prompted for a reason/description before submitting the dispute
- [ ] Confirm a customer cannot approve twice or approve after already rejecting (state should lock once acted on)
- [ ] Timeout/reminder handling: if customer doesn't respond for a long period, is there a reminder notification? (worth checking even if not solved yet — flag as open item if missing)

---

## 4. OTP + Payment (Razorpay)

Given OTP can't use SMS (no SMTP/telecom setup) and Supabase Auth handles login separately — this job-completion OTP is a **separate, app-generated verification code**, not tied to Supabase Auth's own OTP system. Confirm this distinction is correctly implemented (i.e., a `job_otp` field/table generated per booking at approval time, not reusing auth OTP infrastructure).

### 4.1 OTP Generation & Display (Customer side)
- [ ] On customer's **Approve** action, backend generates a short numeric code (e.g. 4–6 digits) tied to that specific booking
- [ ] Code is displayed clearly on the customer's screen (large, easy to read aloud) — with context text like "Share this code with your service provider to complete the job"
- [ ] Confirm the code is NOT sent anywhere the worker could see it directly (it must only reach the worker verbally from the customer) — check it's not accidentally exposed in the worker's booking detail view or API response
- [ ] Code expiry: confirm there's a reasonable expiry/regeneration path if the job runs long (e.g. code valid for X hours, or regenerate-on-request option) so a stale code doesn't block payment

### 4.2 OTP Entry (Worker side)
- [ ] Worker sees an "Enter completion code" input after customer approval, before payment can be triggered
- [ ] Numeric input, appropriately sized/styled for quick entry
- [ ] Clear error state on wrong code (with attempt limit — confirm there's a lockout/cooldown after N wrong attempts to prevent brute-forcing a short numeric code)
- [ ] On correct code: booking status transitions (e.g. to `completed` or `payment_processing`), and this triggers the Razorpay flow

### 4.3 Payment (Razorpay)
- [ ] Correct OTP verification server-side (FastAPI) creates a Razorpay order for the approved total amount — confirm amount matches exactly what customer approved (base + extras), not just base pay
- [ ] Razorpay checkout triggers on the **customer's** side (payment should be customer-initiated/authorized, confirm it's not somehow triggered from the worker's device)
- [ ] Loading/processing state shown during payment while waiting for Razorpay callback/webhook
- [ ] Success state: booking marked `completed`, receipt generated/viewable, worker notified payment is confirmed and released (minus commission) to their earnings
- [ ] Failure state: clear retry option for the customer; booking should NOT be marked completed if payment fails; worker should see "payment pending" rather than a false completion
- [ ] Webhook handling: confirm FastAPI has a Razorpay webhook endpoint to reconcile payment status server-side (don't rely solely on client-side success callback, which can be spoofed or dropped on connection loss)
- [ ] Commission split: confirm the worker payout amount shown post-payment correctly deducts the 10–15% platform commission, and this math is server-side, not computed/trusted from the frontend

---

## 5. Quick Cross-Check Summary Table

| Area | Key risk if wrong |
|---|---|
| Customer slot view | Showing booked slots leaks worker busyness, reintroduces bias flagged earlier |
| Worker dashboard alerts | Missed Instant-job popup = broken waterfall in practice, even if backend logic is correct |
| Extra item input | No server-side validation on cost/photos = reopens on-site price inflation risk the whole model is built to prevent |
| Customer approval | Approve/Reject not clearly separated = accidental approvals, erodes the exact trust mechanism this flow exists for |
| OTP generation | Code visible to worker before customer shares it = defeats the purpose of the verification step entirely |
| Payment amount | Frontend-trusted amount instead of server-verified = commission/price tampering risk |

---

*Use this as a literal checklist against the current build — each unchecked box is either confirmed missing, or needs a direct "yes, this exists" verification pass against the running app.*
