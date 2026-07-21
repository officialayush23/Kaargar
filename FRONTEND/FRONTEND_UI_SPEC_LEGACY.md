# KAARGAR — Complete Frontend UI Specification
## For Gemini: Build all pages listed below. Backend already exists. Just wire to API endpoints provided.

---

## TECH STACK (DO NOT CHANGE)
- React 18 + Vite + **JSX only** (no TypeScript, no .tsx)
- Tailwind CSS v3
- shadcn/ui components (manually as JSX, not CLI)
- Framer Motion for animations
- Lucide React for icons (use colored variants via style prop or className)
- Zustand for state
- TanStack Query v5 for API calls
- React Router v6
- Mapbox GL JS for maps
- Sonner for toasts

---

## DESIGN SYSTEM

### Light Mode (60/30/10)
- 60% → `#FFFFFF` / `#F9FAFB` (white / off-white backgrounds)
- 30% → `#1C1C1E` / `#374151` (dark text, secondary elements)
- 10% → `#F59E0B` (amber accent — buttons, highlights, active states)

### Dark Mode (60/30/10)
- 60% → `#07090F` / `#0D1117` (near-black backgrounds)
- 30% → liquid glass panels with white border (`rgba(255,255,255,0.07)` border)
- 10% → `#F59E0B` (amber accent) OR `#4B7BFF` (blue) for action buttons

### Liquid Glass (dark mode only, specific elements)
```css
.liquid-glass {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
```
Apply liquid glass ONLY to: bottom navbar, mode toggle pill, floating action buttons, profile menu overlay.

### Typography
- Headings: **Syne** (Google Fonts)
- Body: **DM Sans** (Google Fonts)
- Numbers/stats: **JetBrains Mono** (Google Fonts)

### Logo
- Text: "Kaargar" in Syne Bold
- Color: silvery blue tint (`#A8C4E0` or `linear-gradient(135deg, #B8D4F0, #7BA7C9)`)
- Tagline: "Get help in 30 min" in DM Sans Regular, muted color

### Colored Icons
Use Lucide icons with explicit color classes. Examples:
- Zap → `text-yellow-400`
- Droplets → `text-blue-400`
- Wind → `text-cyan-400`
- Hammer → `text-orange-700`
- Sparkles → `text-emerald-400`
- Camera → `text-pink-400`
- Heart → `text-rose-400`
Never use gray monochrome for category icons.

---

## GLOBAL COMPONENTS (build these first, used everywhere)

### 1. BottomNav (user version)
- Liquid glass pill, rounded-full, NOT full-width
- Centered, `mx-auto max-w-xs`, floats above content
- Icons: Home, CalendarDays, MessageCircle, User (round avatar icon)
- Active state: amber underline dot, icon becomes amber
- User-only routes: / | /bookings | /chats | /profile-menu

### 2. BottomNav (worker version)
- Same liquid glass pill style
- Icons: LayoutDashboard, Briefcase, Wrench, BarChart2, User
- Routes: /worker | /worker/jobs | /worker/services | /worker/analytics | /worker/profile

### 3. ProfileMenuOverlay (replaces top navbar entirely)
- Triggered by tapping avatar/profile icon (top-right of hero)
- Full-screen slide-up overlay with liquid glass background
- Top section: avatar (large, 80px), name, email, role badge
- Menu items (with icons, colored):
  - For users: My Bookings, My Chats, Support Tickets, Settings, Logout
  - For workers: same + Switch to Worker Mode / Switch to User Mode
- Notifications section: last 5 unread notifications listed here
- "Mark all read" button
- Close button (X) top right

### 4. ModeToggle (Instant / Discover)
- Position: directly below the search bar (NOT bottom of screen)
- Liquid glass pill, rounded-full
- Two buttons inside: `⚡ Instant` and `🔍 Discover`
- Active: amber background, white text, subtle glow
- Inactive: transparent, muted text
- Framer Motion `layoutId` for sliding pill animation
- Width fits content, centered

### 5. MapboxJobMap (reusable)
- Full-screen or fixed-height Mapbox GL JS map
- Shows: worker location marker (pulsing green dot), user location (blue dot), route polyline
- Bottom sheet slides up over map showing job details
- Worker marker: custom HTML marker with worker avatar thumbnail + green pulse ring
- Rapido-style: worker moves along route in real time via Supabase Realtime

---

## SECTION 1 — USER PAGES

---

### PAGE: Login/Signup (`/login`)

**Layout:** Full screen, centered card on desktop, full-mobile.

**Step 1 — Email Entry:**
- Kaargar logo (silvery blue) + tagline "Get help in 30 min"
- Hero illustration or gradient background (amber + blue)
- "Continue with Email" input
- Email field with validation
- "Send OTP" button (amber)
- Tagline below: "Join 10,000+ users in Pune"

**Step 2 — OTP Verify:**
- "Enter the 6-digit code sent to {email}"
- 6 separate OTP input boxes (auto-advance, auto-paste)
- Resend OTP link (30s countdown)
- Back button

**Step 3 — Complete Your Profile (NEW USER ONLY):**
This fills the `users` table. Show fields:
- Full name (required)
- Phone number with +91 prefix (required)
- Profile photo upload (uploads to `profile_photos` Supabase bucket)
- Select "Are you signing up as a worker?" toggle
- If worker: redirect to worker onboarding after this step
- "Continue" button

**Step 4 — Location Permission:**
- "Allow Kaargar to use your location?"
- Uses Mapbox to reverse geocode coordinates to address
- Show detected address with edit option
- Saves: `user_preferences.home_lat`, `home_lon`, `home_address`, `pune_area`
- "Skip for now" option

**API calls:**
- `POST /auth/send-otp` → `{ email }`
- `POST /auth/verify-otp` → `{ email, token }`
- `PATCH /users/me` → `{ full_name, phone, avatar_url }`
- `PUT /users/me/preferences` → `{ home_lat, home_lon, home_address, pune_area }`

---

### PAGE: Home — User (`/`)

**Hero Section (Blinkit/Zomato style):**
- Background: white (light) / near-black (dark)
- Top bar: Logo left, Profile icon right (tapping opens ProfileMenuOverlay)
- NO traditional top navbar
- Large greeting: "Good morning, {name} 👋" in Syne Bold
- Tagline: "Get help in 30 min" in muted smaller text
- Search bar: "Search for electrician, plumber..."
  - Clicking opens search with real-time suggestions
  - Uses Mapbox geocoder for location within search
  - Backend: `GET /search?q=...`

**Mode Toggle (directly below search):**
- Liquid glass pill: [⚡ Instant] [🔍 Discover]
- Smooth animation on switch

**INSTANT MODE content:**

Section: "Need help now?"
- Category grid: 4 columns, compact cards
- Each card: colored icon (Lucide, styled), category name below
- Tap → navigate to `/job/new?category={slug}&mode=instant`
- Cards are small (about 72px tall), not large

Categories shown (14 instant):
Electrician (⚡ yellow), Plumber (💧 blue), AC Repair (🌬️ cyan), Carpenter (🔨 brown), Appliance Repair (🔌 purple), House Cleaning (✨ green), Painter (🖌️ orange), Locksmith (🔑 gray), Computer Repair (💻 violet), Pest Control (🐛 red), Handyman (🔧 stone), Moving Help (📦 sky), Mechanic (🚗 dark), Furniture Assembly (🪑 amber)

Section: "Recent bookings" (horizontal scroll, only if user has history)
- Small chips: worker avatar + service name + status badge

**DISCOVERY MODE content:**

Section: "Find professionals"
- Filter pills: All | Top Rated | Available Today
- Category grid: same 4-col compact style
- 16 discovery categories with colored icons

Section: "Recommended for you" (personalized from search history)
- Horizontal scroll of WorkerCards
- WorkerCard: avatar, name, primary category, rating stars (colored), price from ₹X, "Book" CTA button

---

### PAGE: New Instant Job (`/job/new`)

**Step 1 — Location:**
- "Where do you need help?"
- Mapbox geocoder input (type address OR tap "Use my location")
- Live location uses browser GPS → Mapbox reverse geocode → shows address
- Map preview showing selected point
- Optional note field: "Add landmark or instructions"
- Continue button

**Step 2 — Describe the problem:**
- Category name as heading (e.g., "Electrician")
- Textarea: "Describe your issue (optional)"
- Photo upload: up to 3 photos (uploads to `profile_photos` bucket as job photos)
- Price estimate shown: "Typical cost: ₹150–₹500"
- "Find Workers Now" CTA (amber, large)

**API:** `POST /jobs` → `{ category_id, job_type: 'instant', location_lat, location_lon, location_address, description, photos }`

---

### PAGE: Searching for Worker (`/job/{id}/searching`)

**Full-screen Mapbox map:**
- User location centered
- Expanding ripple animation from user location (CSS keyframes, 3 rings)
- Worker location dots appear on map as they're notified (from Supabase Realtime)
- Worker dots: small colored circles (category color), pulsing

**Bottom sheet (slides up, non-blocking):**
- Rounded top corners
- "Finding your {category}..."
- Animated spinner with brand blue
- "Checking {n} workers within {radius}km"
- Worker avatars appear one by one as they're notified (small row of avatars)
- Radius expanding text: "2km → 3km → 4km..."
- "Cancel Request" button (outline, destructive)

**Real-time:** Subscribe to `jobs` table via Supabase Realtime for status change from `searching` → `assigned`

---

### PAGE: Worker Assigned / Active Job (`/job/{id}/active`)

**Full-screen Mapbox map:**
- Worker's location shown as moving marker (avatar thumbnail in circle with green pulse ring)
- User location shown as static blue marker
- Route polyline between worker and user (Mapbox Directions API)
- Map updates every 5s via Supabase Realtime on `worker_locations`

**Bottom sheet (draggable, slide up):**

State: `en_route` —
- Worker card: avatar, name, rating stars (amber), "X jobs completed"
- ETA badge (green): "{n} min away"
- Status timeline: ● Assigned → ● En Route → ○ Arrived → ○ Started → ○ Done
- Two action buttons: [💬 Chat] [🚨 SOS]

State: `arrived` —
- "Worker has arrived!" heading
- Green checkmark animation
- Same worker card + updated timeline

State: `started` —
- "Work in progress"
- Elapsed timer: "00:42 mins"
- [💬 Chat] button

State: `completed` —
- "Job Complete! 🎉"
- Payment card: "Pay ₹{amount}" with Razorpay button
- After payment: redirect to review page

---

### PAGE: Review (`/job/{id}/review`)

- Worker avatar + name
- "Rate your experience"
- 5 star selector (tap stars, animated fill, amber color)
- Optional sub-ratings: Quality, Punctuality, Communication, Value (each 5 stars)
- Text area: "Tell us more (optional)"
- Photo upload (review photos)
- "Submit Review" button

**API:** `POST /reviews` → `{ job_id, rating, text, photos }`

---

### PAGE: Discovery Browse (`/discovery`)

**Layout:**
- Search bar at top (reused from home)
- Filter row: [All ▾] [Rating ▾] [Price ▾] [Available Today]
- Category filter horizontal scroll: colored chips
- Below: Grid of WorkerCards (2 columns on mobile)

**WorkerCard:**
- Avatar (round, 60px)
- Name in Syne Bold
- Primary category with colored icon
- Star rating (amber, colored) + review count
- "From ₹{min_price}"
- "Book" button (amber, small)
- Tap card → `/worker/{id}`

**API:** `GET /search/workers?category=...&page=1`

---

### PAGE: Worker Public Profile (`/worker/{id}`)

**Hero:**
- Featured media (image or muted autoplay video) — full width, 220px tall
- Gradient overlay bottom
- Worker name (Syne Bold, white)
- Category with colored icon + area name
- Rating: ★★★★★ amber stars + review count + jobs count

**Tabs: Services | Portfolio | Reviews**

**Services tab:**
- Service cards: title, price, duration, avg rating, "Book" button
- Package cards: "20% OFF" badge, bundled services listed
- Offer chips if active

**Portfolio tab:**
- 3-column grid
- Tap photo → full-screen lightbox
- Video thumbnails with play button overlay

**Reviews tab:**
- Rating breakdown bar chart (5★ 80%, 4★ 15%, etc.)
- Review cards: user avatar, stars, text, date, worker reply if any

**Sticky CTA bottom:**
- Glass bar: "Book {Worker Name}" amber button

---

### PAGE: Book Discovery (`/worker/{id}/book`)

- Service selector (radio, pre-selected from previous page)
- Date picker (shadcn Calendar)
- Time picker (hour slots: 9am, 10am, 11am...)
- Location input (Mapbox geocoder)
- Price summary card: service + platform fee + GST = total
- Notes textarea
- "Confirm Booking" → payment

---

### PAGE: My Bookings (`/bookings`)

**Tabs: Active | Upcoming | Past**

**Active:**
- Full-width job card: category icon (colored), worker name, status badge (pulsing green), "Track" button

**Upcoming:**
- Card: date/time, worker name, service name, "Cancel" link

**Past:**
- Card: date, worker, price paid, rating given (stars) or "Rate Now" CTA

---

### PAGE: Chat (`/chat/{job_id}`)

- Top bar: worker/user avatar, name, job status badge
- Message bubbles: user right (amber), worker left (surface/glass)
- Masked contact notice: if [Number Hidden] appears, show inline toast "Contact sharing is disabled"
- Image messages: thumbnail with expand
- System messages: centered pill (e.g. "Worker has arrived")
- Input bar: text field + image upload button + send
- Real-time via Supabase Realtime on `messages` table

---

## SECTION 2 — USER ONBOARDING

### PAGE: Worker Onboarding Flow (`/worker/onboard`)

Multi-step wizard, progress bar at top (Step X of 5):

**Step 1 — Basic Info:**
- "Set up your worker profile"
- Full name (pre-filled from user)
- Phone (pre-filled)
- Bio textarea: "Tell customers about yourself"
- Experience years: number input or stepper
- Pune area selector: dropdown of 20 areas

**Step 2 — Select Your Categories:**
- Grid of all categories (instant + discovery)
- Multi-select (tap to toggle, amber active state with checkmark)
- "Select at least 1"
- Primary category auto-assigned to first selected

**Step 3 — Upload Documents:**
Progress shown per doc: ✅ Uploaded | ⏳ Pending | ❌ Required

Required:
- Aadhaar Front (image upload)
- Aadhaar Back (image upload)
- Selfie (camera/upload)

Optional:
- PAN Card
- Certificate/License
- Police Clearance

Upload box for each: dashed border, "Tap to upload", preview after upload
File uploads go to `profile_photos` Supabase bucket path: `{user_id}/docs/{type}`
API: `POST /workers/documents`

**Step 4 — Add First Service:**
- Category dropdown (pre-selected from step 2)
- Service title input
- Price input with ₹ prefix
- Price type: Fixed / Hourly / Starting From
- Estimated duration: dropdown (30min, 1hr, 2hr, etc.)
- Description textarea

**Step 5 — Payout Details:**
- UPI ID input with verify button
- OR Bank Account: account number + IFSC + account name
- "Skip for now" option

**Step 6 — Review & Submit:**
- Summary of all entered info
- "Submit for Review" button
- Success screen: "Application submitted! We'll review in 24–48 hours."
- Show verification status with animated pending badge

API calls throughout:
- `POST /workers/profile`
- `POST /workers/documents`
- `POST /workers/me/services`

---

## SECTION 3 — WORKER PAGES

All worker pages use the worker BottomNav and WorkerLayout.

---

### PAGE: Worker Dashboard (`/worker`)

**Top bar:**
- Logo left
- Profile icon right (opens ProfileMenuOverlay with worker options)

**Status Card (most prominent, top):**
- Liquid glass card (dark) / elevated card (light)
- Left: "Status" label, big "ONLINE" (green) or "OFFLINE" (muted) text
- Right: Large toggle Switch
- If OFFLINE: amber button "Go Online"
- If auto-offline: "Automatically offline for {n} min" warning

**Instant Mode Toggle:**
- Card: "Accept Instant Jobs"
- Toggle switch: "When ON, you'll receive instant job requests"
- Only shows if verification_status = 'approved'

**Earnings Card:**
- "Today's Earnings"
- Large number in JetBrains Mono: ₹1,240
- Badges: "3 jobs today" + trend vs yesterday

**3-Column Stats:**
- ★ {avg_rating} | {acceptance}% Accept | {total_jobs} Jobs

**Active Job Card (if any):**
- Colored category icon, job title, user location area, status
- "Continue Job" CTA button

**Pending Verification Banner (if not approved):**
- Amber warning card: "Your profile is under review (24–48 hrs)"
- Link to view document status

**Recent Jobs (last 5):**
- List rows: category icon, title, price, status badge

---

### PAGE: Incoming Job Modal (OVERLAY, not a page)

Triggered when: Supabase Realtime pushes INSERT on `job_worker_requests` table for this worker.

**Behavior:** Full-screen modal, blocks all interaction, cannot be swiped away.

**Design:**
- Dark overlay with glass card center
- Pulsing "NEW JOB" badge (amber, animated)
- Category name in Syne Bold, large
- Location area + distance: "Kothrud • 1.4km away"
- Estimated earnings: "~₹350–₹500"
- Job description (if provided): truncated to 2 lines
- Progress bar draining: 10s → 0s (red when < 3s)
- "Auto-declines in {n}s" text
- Two large buttons: [✗ Decline] [✓ Accept]
- Sound/vibration hook (if browser supports)

On Accept: `POST /jobs/{id}/accept`
On Decline or timeout: `POST /jobs/{id}/reject`
After accept: navigate to active job view `/worker/job/{id}/active`

---

### PAGE: Worker Active Job (`/worker/job/{id}/active`)

**Full-screen Mapbox map:**
- User location (customer) as pin marker
- Route from worker to customer
- Worker can update their own location (GPS)

**Bottom sheet:**
- Customer area (hidden full address until arrived)
- Job description
- Status progression buttons:
  - "I've Arrived" → `POST /jobs/{id}/arrived`
  - "Start Job" → `POST /jobs/{id}/start`
  - "Complete Job" → `POST /jobs/{id}/complete`
- Price field (editable) before completing
- [💬 Chat Customer] [🚨 SOS]

---

### PAGE: Worker Job History (`/worker/jobs`)

**Tabs: Active | Upcoming | Completed | Cancelled**

Filter: [This Week ▾] [Category ▾]

Job rows: date, user area, service, price earned (green), status badge
Tap row → job detail modal showing full timeline

---

### PAGE: Worker Services (`/worker/services`)

**Header:** "My Services" + "+ Add Service" button

**Service Cards (list):**
- Title, price, category colored chip
- Toggle: active/inactive
- Edit (pencil) and delete (trash) icon buttons
- Rating + bookings count

**Add/Edit Service Sheet (shadcn Sheet from bottom):**
- Category selector (dropdown)
- Title input
- Description textarea
- Price input + price type selector
- Duration selector
- Save button

**Packages section below:**
- Package cards: title, original vs discounted price, included services list
- "+ Create Package" button
- Edit/delete per package

**Offers section below:**
- Offer chips: title, discount value, expiry date
- "+ Add Offer" button
- Toggle active/inactive

---

### PAGE: Worker Media / Portfolio (`/worker/media`)

**Top:** "My Portfolio" heading + "+ Add" button

**Grid:** 3-column masonry
- Images: full thumbnail
- Videos: thumbnail with play button overlay, duration badge
- Featured badge (star icon) on featured items
- Long-press or 3-dot menu: "Set as Featured", "Delete", "Edit Caption"

**Add Media Sheet:**
- Upload area: large dashed box
  - "Tap to upload photo or video"
  - Accepts: jpg, png, webp, mp4, mov, webm
  - Images: max 10MB, Videos: max 100MB
- Caption input
- Link to service (optional dropdown)
- "Mark as Featured" toggle
- Upload goes to `worker_posts` Supabase bucket
- Shows upload progress bar
- On success: adds to grid with animation

**API:**
- `POST /upload/worker-post` (multipart)
- `DELETE /upload/worker-post/{media_id}`

---

### PAGE: Worker Analytics (`/worker/analytics`)

**Period Tabs:** Today | Week | Month | All Time

**Earnings Chart:**
- Recharts LineChart
- Light mode: amber line on white
- Dark mode: amber/blue gradient line
- Tooltip on hover showing date + amount

**Revenue Card:**
- ₹{amount} large (JetBrains Mono)
- Trend arrow: +12% vs last period

**Jobs Breakdown:**
- Instant vs Discovery donut chart (Recharts PieChart)
- Colors: green (instant) + amber (discovery)

**Performance Metrics:**
- Progress bars with labels:
  - Acceptance Rate: green bar
  - Completion Rate: blue bar
  - Cancellation Score: amber bar
- Each bar shows percentage and label

**Top Services:**
- Ranked list: service name, bookings count, revenue generated

**Ratings Breakdown:**
- 5 bar rows (5★, 4★, 3★, 2★, 1★) with proportional fill

---

### PAGE: Worker Profile Edit (`/worker/profile`)

**Sections:**

**1. Profile Photo:**
- Large avatar (100px) with camera overlay
- Tap → opens image picker → uploads to `profile_photos` bucket
- API: `POST /upload/profile-photo`

**2. Basic Info:**
- Full name (editable)
- Phone (editable)
- Bio (textarea)
- Experience years
- Pune area (dropdown)
- Service radius (slider: 1–10km)

**3. Availability:**
- "Accept Instant Jobs" toggle
- "Accept Discovery Jobs" toggle

**4. Documents:**
- Same grid as onboarding step 3
- Shows current status per document (✅/⏳/❌)
- Re-upload button for rejected docs

**5. Payout Details:**
- UPI ID input + "Verify" button
- Bank details form
- Verified badge (green checkmark) if verified

**6. Danger Zone:**
- "Pause Account" button

---

## SECTION 4 — ADMIN PAGES

Admin uses a sidebar layout (desktop-first), NOT bottom nav.

---

### PAGE: Admin Login (`/admin/login`)

- Simple centered card
- Email + password fields (admin uses password auth, not OTP)
- Logo + "Admin Panel" title
- Login button

---

### PAGE: Admin Dashboard (`/admin/dashboard`)

**Top bar:** Kaargar logo + admin name + logout button

**Sidebar navigation:**
- Dashboard (LayoutDashboard icon)
- Verification Queue (ShieldCheck icon) — with badge count of pending
- Workers (Users icon)
- Jobs (Briefcase icon)
- Users (UserCircle icon)
- Support Tickets (MessageSquare icon) — with badge count
- Payments (CreditCard icon)
- Platform Config (Settings icon)

**Main content:**

**4 KPI Cards (top row):**
- Active Jobs: number + green dot
- Online Workers: number + green dot
- Today's Revenue: ₹ amount
- Fill Rate: % (jobs matched / jobs created)

**Live Jobs Map (Mapbox):**
- All active jobs as pins (colored by status)
- Online workers as green dots
- Click pin → popup with job details
- Height: 400px

**Recent Jobs DataTable:**
- Columns: ID (short), Category, User, Worker, Status badge, Amount, Time
- Filters: Status dropdown, Category dropdown
- Pagination
- Click row → job detail modal

---

### PAGE: Admin Verification Queue (`/admin/verification`)

**Header:** "Pending Verification ({count})"

Filter: [All] [Pending] [In Review] [Rejected]

**Worker Cards (list):**
Each card:
- Worker avatar + name + email + phone
- Applied: "X hours ago"
- Pune area + selected categories
- Documents grid (show thumbnails):
  - Aadhaar Front / Back — tap to view full-size lightbox
  - Selfie — tap to view
  - Optional docs if uploaded
- Status per doc: Pending / Approved / Rejected
- Rejection reason input (shows if rejecting)
- Action buttons: [✅ Approve] [❌ Reject with Reason] [👁 View Full Profile]

On Approve: `POST /admin/workers/{id}/approve`
On Reject: `POST /admin/workers/{id}/reject` + `{ reason: "..." }`

After action: card updates status badge, stays in list with new status

**Detail drawer (right side on desktop):**
- Full worker profile preview
- All document images
- Services they've listed
- Timeline of their application

---

### PAGE: Admin Worker Detail (`/admin/workers/{id}`)

- Full worker profile (all fields)
- Document images with approve/reject per document
- Service listings (read-only)
- Job history table
- Earnings summary
- Actions: [Suspend] [Approve] [Reject] [Ban User]
- Activity log at bottom

---

### PAGE: Admin Support Tickets (`/admin/support`)

**Filter tabs:** Open | In Progress | Awaiting | Resolved | All

**Priority filter:** All | Urgent | High | Medium | Low

**Ticket Cards:**
- Priority badge (red=urgent, orange=high, yellow=medium, gray=low)
- Ticket title
- User name + worker name (if job-linked)
- Type badge: Dispute / Refund / Complaint / etc.
- Created time
- Assigned to (admin dropdown)
- Status badge
- "Open" button → ticket detail

**Ticket Detail Page (`/admin/support/{id}`):**

Left column (2/3 width):
- Ticket title + type + priority
- Description
- Message thread (like a chat: user messages, worker messages, admin messages)
- Reply input area for admin
- Attachment support

Right column (1/3 width):
- **Job Timeline Card:** full job lifecycle events
  - Each event: status, actor, timestamp, location if available
- **Payment Card:** amount paid, escrow status, release date
- **Users Card:** user info + worker info side by side
- **Actions:**
  - [Issue Refund] → amount input + confirm
  - [Mark Resolved]
  - [Change Priority]
  - [Assign to Me]
  - [Close Ticket]

API:
- `GET /admin/support/tickets`
- `PATCH /admin/support/{id}`
- `POST /admin/support/{id}/messages`
- `POST /admin/payments/{id}/refund`

---

### PAGE: Admin Workers List (`/admin/workers`)

**Search bar + filters:** Status | Verification | Area | Category

**DataTable columns:**
- Avatar + Name (linked to detail)
- Email / Phone
- Categories (chips)
- Rating
- Jobs completed
- Earnings total
- Status badge (Online / Offline / Busy)
- Verification badge
- Actions (3-dot menu): View | Suspend | Ban

---

### PAGE: Admin Jobs List (`/admin/jobs`)

**Filters:** Status | Category | Job Type | Date Range

**DataTable:**
- Job ID (short)
- Category (icon + name)
- User name
- Worker name (or "Unassigned")
- Status badge (with color)
- Type: Instant / Discovery
- Amount
- Created time
- Actions: View Details

**Job Detail Modal:**
- Full job info
- Map showing job location
- Status timeline
- Worker/User contact (admin can see all)
- Chat log (admin view, includes raw_content)
- Payment info
- Action: Cancel Job / Issue Refund

---

### PAGE: Admin Platform Config (`/admin/config`)

**Layout:** Two-column key-value editor

Each config item:
- Key label (human readable)
- Current value (inline editable input)
- Description text
- Save button per row (or bulk save)

Config keys displayed:
- Instant commission rate (%)
- Discovery commission min/max (%)
- GST rate (%)
- Escrow release hours
- Cancellation penalty - user (₹)
- Cancellation penalty - worker (₹)
- Matching initial radius (km)
- Matching max radius (km)
- Auto-offline threshold (rejects)
- Auto-offline duration (min)

API: `PATCH /admin/config` per change

---

## SECTION 5 — MAPBOX INTEGRATION DETAILS

### Required Mapbox Features:
1. **Geocoding (address → coordinates):** `mapbox-gl-geocoder` for address search inputs
2. **Reverse geocoding (coordinates → address):** Mapbox API `GET /geocoding/v5/mapbox.places/{lon},{lat}.json`
3. **Directions/Route:** Mapbox Directions API for worker → user route polyline
4. **Real-time worker location:** Update marker position via Supabase Realtime

### Location Input Flow (replaces area selector):
- User enters address in geocoder OR taps "Use my location"
- GPS → `navigator.geolocation.getCurrentPosition()`
- Coordinates → Mapbox reverse geocode → human address
- Address stored in `location_address`, coordinates in `location_lat/lon`
- NO area dropdown selector (removed entirely)

### Searching Animation (Rapido-style):
```
1. User location centered on map
2. 3 concentric rings expand outward from user pin (CSS animation, brand blue)
3. As workers are notified (Supabase Realtime): small colored dots appear on map at worker positions
4. Dots pulse (green) showing they've been notified
5. When accepted: one dot turns into worker avatar marker with green ring
6. Route polyline draws from worker to user (animated dash-array)
7. Bottom sheet updates: searching → found
```

Worker marker HTML:
```html
<div class="worker-marker">
  <img src="{avatar_url}" class="worker-avatar" />
  <div class="pulse-ring"></div>
</div>
```

---

## SECTION 6 — API ENDPOINTS USED (for wiring)

Frontend should call these. Backend serves them at `http://localhost:8000/v1`:

```
POST   /auth/send-otp
POST   /auth/verify-otp
GET    /users/me
PATCH  /users/me
PUT    /users/me/preferences
GET    /categories?mode=instant|discovery|both
GET    /categories/areas
GET    /search?q=...
GET    /search/recommendations
GET    /search/workers?category=...
POST   /jobs
GET    /jobs/me?status=active|past
GET    /jobs/{id}
POST   /jobs/{id}/cancel
POST   /jobs/{id}/accept
POST   /jobs/{id}/reject
POST   /jobs/{id}/arrived
POST   /jobs/{id}/start
POST   /jobs/{id}/complete
POST   /jobs/{id}/sos
GET    /workers/{id}
GET    /workers/{id}/services
GET    /workers/{id}/media
GET    /workers/{id}/reviews
POST   /workers/profile
PATCH  /workers/profile
PATCH  /workers/status
POST   /workers/location
POST   /workers/documents
GET    /workers/me/services
POST   /workers/me/services
PATCH  /workers/me/services/{id}
DELETE /workers/me/services/{id}
GET    /workers/me/analytics?period=today|week|month|all
GET    /workers/me/media
POST   /upload/profile-photo
POST   /upload/worker-post
DELETE /upload/worker-post/{media_id}
GET    /chat/{job_id}
GET    /chat/{job_id}/messages
POST   /chat/{job_id}/messages
PATCH  /chat/{job_id}/read
POST   /payments/create-order
POST   /payments/webhook
GET    /payments/{job_id}
POST   /reviews
GET    /reviews/worker/{id}
POST   /reviews/{id}/reply
GET    /notifications
PATCH  /notifications/read-all
PATCH  /notifications/{id}/read
POST   /support/tickets
GET    /support/tickets
GET    /support/tickets/{id}
POST   /support/tickets/{id}/messages
GET    /admin/dashboard/live
GET    /admin/workers/pending
POST   /admin/workers/{id}/approve
POST   /admin/workers/{id}/reject
GET    /admin/workers
GET    /admin/jobs
GET    /admin/support/tickets
PATCH  /admin/support/{id}
POST   /admin/support/{id}/messages
POST   /admin/payments/{id}/refund
GET    /admin/config
PATCH  /admin/config
```

---

## SECTION 7 — SUPABASE REALTIME SUBSCRIPTIONS

Wire these in the relevant pages:

```javascript
// 1. Notifications (all authenticated pages)
supabase.channel(`notif:${userId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, handleNotification)
  .subscribe()

// 2. Job status updates (job tracking pages)
supabase.channel(`job:${jobId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` }, handleJobUpdate)
  .subscribe()

// 3. Chat messages
supabase.channel(`chat:${chatId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, handleMessage)
  .subscribe()

// 4. Worker incoming job requests (worker dashboard)
supabase.channel(`worker-req:${workerId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_worker_requests', filter: `worker_id=eq.${workerId}` }, handleIncomingJob)
  .subscribe()

// 5. Worker location (job tracking map)
supabase.channel(`worker-loc:${workerId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'worker_locations', filter: `worker_id=eq.${workerId}` }, handleLocationUpdate)
  .subscribe()
```

---

## ROUTING MAP

```
/login                          LoginPage
/onboard/worker                 WorkerOnboardPage

/                               HomePage (user)
/job/new                        NewJobPage
/job/:id/searching              SearchingPage
/job/:id/active                 ActiveJobPage
/job/:id/review                 ReviewPage
/discovery                      DiscoveryPage
/worker/:id                     WorkerPublicProfilePage
/worker/:id/book                BookDiscoveryPage
/bookings                       BookingsPage
/chat/:job_id                   ChatPage
/profile-menu                   ProfileMenuOverlay (as modal/page)

/worker                         WorkerDashboard
/worker/jobs                    WorkerJobsPage
/worker/job/:id/active          WorkerActiveJobPage
/worker/services                WorkerServicesPage
/worker/analytics               WorkerAnalyticsPage
/worker/media                   WorkerMediaPage
/worker/profile                 WorkerProfileEditPage

/admin/login                    AdminLoginPage
/admin/dashboard                AdminDashboard
/admin/verification             AdminVerificationQueue
/admin/workers                  AdminWorkersPage
/admin/workers/:id              AdminWorkerDetailPage
/admin/jobs                     AdminJobsPage
/admin/support                  AdminSupportPage
/admin/support/:id               AdminTicketDetailPage
/admin/config                   AdminConfigPage
```

---

## WHAT GEMINI SHOULD BUILD

1. All JSX files in the structure above
2. Global CSS in globals.css (design tokens, liquid glass classes, animations)
3. Tailwind config (light/dark mode tokens)
4. Zustand stores: auth.js, app.js, worker.js
5. TanStack Query hooks: useCategories.js, useJobs.js, useWorker.js, useNotifications.js
6. lib/api.js (axios instance with JWT interceptor)
7. lib/supabase.js (Supabase client with anon key)
8. lib/mapbox.js (Mapbox token, geocoder helper functions)
9. All routing in App.jsx with protected routes

## WHAT GEMINI SHOULD NOT BUILD
- Backend (already exists)
- Any .ts or .tsx files
- Any TypeScript type definitions

## ENVIRONMENT VARIABLES GEMINI NEEDS TO USE
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:8000/v1
VITE_RAZORPAY_KEY_ID=
VITE_MAPBOX_TOKEN=
```
