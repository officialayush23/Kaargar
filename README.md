# Kaargar - Marketplace System Design Documentation

## Executive Summary

**Kaargar** is a two-sided marketplace platform connecting blue-collar workers (plumbers, electricians, mechanics, carpenters, maids, drivers) and freelancers with customers seeking their services. The platform facilitates job posting, bidding, direct booking, real-time communication, payment escrow, and worker verification.

**Platform Type:** B2C Marketplace with Multi-Role Support (Customers, Workers, Agencies, Companies, Admins)

**Current Version:** 3.3.0 (Stable)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   React SPA     │────────▶│   FastAPI        │────────▶│   PostgreSQL    │
│   (Frontend)    │  HTTPS  │   (Backend)      │  SQL    │   + PostGIS     │
│   Vercel        │         │   Python 3.10    │         │   Supabase      │
└─────────────────┘         └─────────────────┘         └─────────────────┘
         │                          │                              │
         │                          │                              │
         ▼                          ▼                              ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Supabase      │         │   Supabase       │         │   Supabase       │
│   Auth          │         │   Realtime       │         │   Storage        │
│   (JWT)         │         │   (WebSockets)   │         │   (Files)       │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

### 1.2 Technology Stack

#### Frontend
- **Framework:** React 19.1.1 with Vite 7.1.2
- **UI Library:** Radix UI components with Tailwind CSS 4.1.17
- **State Management:** React Hooks (useState, useEffect)
- **Routing:** React Router DOM 7.8.0
- **Authentication:** Supabase Auth (JWT-based)
- **Real-time:** Supabase Realtime (PostgreSQL changes)
- **HTTP Client:** Native Fetch API
- **Deployment:** Vercel (SPA with rewrites)

#### Backend
- **Framework:** FastAPI 0.121.3
- **Language:** Python 3.10+
- **Database:** PostgreSQL with PostGIS extension
- **ORM/Driver:** asyncpg 0.30.0 (async PostgreSQL driver)
- **Authentication:** Supabase JWT verification
- **API Documentation:** OpenAPI/Swagger (auto-generated)
- **CORS:** Configured for all origins (*)

#### Database & Infrastructure
- **Database:** Supabase PostgreSQL (managed)
- **Spatial Data:** PostGIS for geolocation queries
- **Connection Pooling:** asyncpg pool (min: 1, max: 20)
- **File Storage:** Supabase Storage buckets
- **Real-time:** Supabase Realtime (PostgreSQL change streams)

#### Third-Party Services
- **Payment Gateway:** Razorpay/Stripe (planned, not fully implemented)
- **Push Notifications:** Device token registration (infrastructure ready)
- **Geolocation:** Browser Geolocation API + PostGIS

---

## 2. Core System Components

### 2.1 User Management & Authentication

**Architecture:**
- Supabase Auth handles user registration, login, password reset
- Backend validates JWT tokens on every request
- Token caching (TTLCache, 4096 entries, 5min TTL) for performance
- User roles: `customer`, `worker`, `agency`, `company`, `admin`

**Data Flow:**
1. User signs up/logs in via Supabase Auth
2. Frontend receives JWT access token
3. Frontend stores token in memory/session
4. All API requests include `Authorization: Bearer <token>`
5. Backend verifies token signature, audience, expiration
6. Backend extracts user ID from token payload

**Tables:**
- `users` - Core user identity (linked to Supabase Auth `sub`)
- `worker_profiles` - Extended worker information
- `wallets` - User wallet balance (escrow funds)

### 2.2 Job Marketplace

**Job Lifecycle:**
```
draft → open → bidding → assigned → in_progress → completed
                ↓
            cancelled (at any stage before completion)
```

**Job Types:**
1. **Open Jobs (Bidding):** Customer posts job, workers bid, customer selects winner
2. **Direct Booking:** Customer directly assigns worker (if worker accepts auto-assign)

**Key Features:**
- Location-based job posting (PostGIS geography)
- Category/profession matching
- Budget range (min/max in cents)
- Remote job support
- Job expiration dates

**Tables:**
- `jobs` - Job postings with location, budget, status
- `bids` - Worker bids on open jobs
- `job_proofs` - Worker-submitted proof of completion (photos, bills)

### 2.3 Search & Discovery

**Worker Search:**
- Location-based (PostGIS distance queries)
- Profession/category filtering
- Service tag matching
- Rating-based sorting
- Distance-based sorting
- Gender filtering (optional)

**Job Feed (for Workers):**
- Location-based job discovery
- Profession matching
- Service tag matching
- Budget filtering
- Status filtering (open, bidding)

**Implementation:**
- Database functions: `search_workers()`, `search_jobs()`
- Uses PostGIS `ST_DWithin` for radius queries
- GIN indexes on arrays (professions, services, tags)

### 2.4 Real-time Chat

**Architecture:**
- Supabase Realtime for message delivery
- PostgreSQL triggers notify on `messages` table INSERT
- Channel-based subscription: `room:{chat_id}:messages`
- Optimistic UI updates for better UX

**Features:**
- Text messages
- Media attachments (images, files via Supabase Storage)
- Read receipts (planned)
- Message history persistence

**Data Flow:**
1. User opens chat → Backend creates/retrieves chat room
2. Frontend subscribes to Supabase Realtime channel
3. User sends message → Optimistic UI update
4. Backend inserts message → PostgreSQL trigger fires
5. Supabase Realtime broadcasts to subscribed clients
6. Frontend receives update → Replaces optimistic message

**Tables:**
- `chats` - Chat rooms (one per job)
- `messages` - Individual messages with content/media

### 2.5 Payment & Escrow System

**Current State:** Infrastructure designed but not fully implemented

**Planned Architecture:**
1. **Payment Capture:**
   - Customer pays via Razorpay/Stripe
   - Funds held in platform escrow
   - Platform fee calculated (dynamic rules)
   - Worker amount reserved in wallet

2. **Job Completion:**
   - Worker submits proof (photos, bills)
   - Customer approves
   - Funds released from escrow
   - Worker receives payout (minus platform fee)

3. **Payout Flow:**
   - Scheduled payout to worker bank account
   - Provider webhook confirms success/failure
   - Wallet balance updated

**Tables:**
- `payments` - Payment records (initiated → captured → released)
- `escrows` - Escrow holds
- `wallets` - User balances (balance_cents, reserved_cents)
- `wallet_transactions` - Ledger entries
- `payouts` - Payout records to workers

**Database Functions (Planned):**
- `process_payment_captured()` - Handle payment webhook
- `schedule_payout_for_payment()` - Create payout
- `mark_payout_result()` - Update payout status
- `get_effective_fee_pct()` - Calculate platform fee

### 2.6 Ratings & Reviews

**Features:**
- Bidirectional ratings (customer rates worker, worker rates customer)
- 1-5 star ratings
- Text comments
- Aggregated ratings (avg, count) on user profiles

**Tables:**
- `worker_ratings` - Customer → Worker ratings
- `user_ratings` - Worker → Customer ratings

### 2.7 KYC & Verification

**Features:**
- Document upload (Aadhaar, PAN, etc.)
- Admin review workflow
- Status tracking (uploaded → approved/rejected)

**Tables:**
- `kyc_documents` - KYC document records

### 2.8 Complaints & Disputes

**Features:**
- User-reported complaints
- Job-related disputes
- Admin resolution workflow

**Tables:**
- `complaints` - Complaint records

---

## 3. Database Schema Design

### 3.1 Core Tables

**users**
- Primary key: `id` (UUID, matches Supabase Auth `sub`)
- Location: `location` (PostGIS geography Point)
- Trust metrics: `rating_avg`, `rating_count`, `cancellation_count`, `complaints_count`, `trouble_score`
- Roles: `role[]` (array of roles)

**worker_profiles**
- One-to-one with `users`
- Professions: `professions[]` (array)
- Services: `services[]` (array)
- Pricing: `min_hourly_rate_cents`, `max_hourly_rate_cents`
- Availability: `is_online`, `accepts_auto_assign`
- Search radius: `search_radius_meters`

**jobs**
- Location: `job_location` (PostGIS geography)
- Status: `status` (draft, open, bidding, assigned, in_progress, completed, cancelled)
- Pricing: `budget_max_cents`, `price_type` (fixed, hourly, bidding)
- Relationships: `customer_id`, `worker_id` (assigned)

**bids**
- Worker bids on jobs
- Fields: `amount_cents`, `message`, `status`

### 3.2 Indexes

**Performance-Critical Indexes:**
- `idx_users_location` - GIST index on `users.location`
- `idx_jobs_location` - GIST index on `jobs.job_location`
- `idx_worker_professions_gin` - GIN index on `worker_profiles.professions`
- `idx_worker_skills_gin` - GIN index on `worker_profiles.services`
- `idx_bids_job` - B-tree on `bids.job_id`
- `idx_ratings_to` - B-tree on `ratings.to_user_id`

### 3.3 Database Functions

**search_workers(lat, lon, profession, service, radius, gender, sort_by)**
- Returns ranked list of workers within radius
- Filters by profession, service, gender
- Sorts by rating, distance, or recommended

**search_jobs(lat, lon, query, radius, min_budget, profession, services)**
- Returns jobs within radius
- Text search on title/description
- Budget filtering
- Profession/service matching

---

## 4. API Design

### 4.1 RESTful Endpoints

**Authentication:**
- `POST /api/auth/upsert_user` - Create/update user from Supabase Auth

**Profile Management:**
- `GET /api/me` - Get current user profile
- `PATCH /api/me/profile` - Update user profile
- `PATCH /api/me/worker` - Update worker profile
- `PATCH /api/me/location` - Update user location
- `POST /api/profiles/onboard` - Worker onboarding

**Search & Discovery:**
- `GET /api/search` - Search workers
- `GET /api/jobs/search` - Search jobs
- `GET /api/jobs/feed` - Get job feed for workers

**Job Management:**
- `POST /api/jobs` - Create open job
- `POST /api/jobs/book` - Direct book worker
- `GET /api/jobs/{job_id}` - Get job details
- `DELETE /api/jobs/{job_id}` - Delete job
- `PATCH /api/jobs/{job_id}/status` - Update job status
- `POST /api/jobs/{job_id}/bids` - Place bid
- `POST /api/jobs/hire` - Hire worker from bid
- `GET /api/me/jobs/posted` - Get customer's posted jobs
- `GET /api/me/jobs/worked` - Get worker's jobs

**Chat:**
- `POST /api/jobs/{job_id}/chat` - Get/create chat room
- `GET /api/chats` - List user's chats
- `GET /api/chats/{chat_id}/messages` - Get messages
- `POST /api/chats/{chat_id}/messages` - Send message

**Ratings:**
- `POST /api/ratings/worker` - Rate worker
- `POST /api/ratings/user` - Rate customer
- `GET /api/ratings/{user_id}` - Get user reviews

**Job Completion:**
- `POST /api/jobs/{job_id}/proof` - Submit job proof
- `POST /api/jobs/{job_id}/approve` - Approve job completion

**Other:**
- `GET /api/me/stats` - Get financial stats
- `POST /api/kyc` - Upload KYC document
- `POST /api/complaints` - File complaint
- `POST /api/notifications/device` - Register push token

### 4.2 Request/Response Format

**Standard Response:**
```json
{
  "ok": true,
  "data": { ... },
  "message": "Success"
}
```

**Error Response:**
```json
{
  "detail": "Error message"
}
```

**Authentication:**
- All protected endpoints require `Authorization: Bearer <jwt_token>`
- Token extracted from header, verified, user ID extracted

---

## 5. Security Architecture

### 5.1 Authentication & Authorization

**JWT Verification:**
- HS256 algorithm
- Audience check (`authenticated`)
- Issuer validation (optional, configurable)
- Expiration validation
- Token caching for performance

**Authorization:**
- Role-based access control (RBAC)
- Endpoint-level permission checks
- User can only access their own data
- Admin endpoints require admin role

**Security Measures:**
- CORS configured (currently `*` - **WEAKNESS**)
- SQL injection prevention (parameterized queries via asyncpg)
- XSS prevention (React auto-escaping)
- CSRF protection (JWT tokens)

### 5.2 Data Privacy

**Phone Number Masking:**
- `phone_masked` field for public display
- Full `phone` only visible to authorized users

**Location Privacy:**
- User locations stored as PostGIS geography
- Only used for distance calculations
- Not exposed in raw form to frontend

### 5.3 Vulnerabilities Identified

1. **CORS too permissive:** `allow_origins=["*"]` allows any origin
2. **No rate limiting:** API endpoints vulnerable to abuse
3. **No request size limits:** File uploads could be exploited
4. **Token refresh not implemented:** Long-lived tokens increase risk
5. **No API versioning:** Breaking changes affect all clients
6. **Hardcoded locations:** Some frontend code uses hardcoded coordinates

---

## 6. Weak Points & Critical Issues

### 6.1 Architecture Weaknesses

#### 6.1.1 Payment System Incomplete
**Issue:** Payment infrastructure is designed but not fully implemented. No actual payment gateway integration.

**Impact:**
- Platform cannot process payments
- Escrow system non-functional
- Workers cannot receive payouts
- Revenue generation blocked

**Recommendation:**
- Integrate Razorpay/Stripe SDK
- Implement webhook handlers for payment events
- Complete escrow release flow
- Add payment retry logic
- Implement refund handling

#### 6.1.2 No Caching Layer
**Issue:** All database queries hit PostgreSQL directly. No Redis or in-memory caching.

**Impact:**
- High database load
- Slow response times for frequently accessed data
- Increased database costs
- Poor scalability

**Recommendation:**
- Add Redis for:
  - User profile caching (TTL: 5-10 minutes)
  - Search result caching (TTL: 1-2 minutes)
  - Job feed caching (TTL: 30 seconds)
  - Rate limiting counters
- Implement cache invalidation on updates

#### 6.1.3 Real-time Chat Scalability
**Issue:** Supabase Realtime may not scale well for high message volumes. No message queuing.

**Impact:**
- Message delivery failures under load
- No offline message queuing
- No message persistence guarantees
- Potential message loss

**Recommendation:**
- Add message queue (RabbitMQ/Redis Pub/Sub) for high-volume scenarios
- Implement message delivery receipts
- Add offline message queuing
- Consider WebSocket server (Socket.io) for custom scaling

#### 6.1.4 No Background Job Processing
**Issue:** All operations are synchronous. No async job processing for heavy tasks.

**Impact:**
- Slow API responses for heavy operations
- No scheduled tasks (cleanup, notifications)
- No retry logic for failed operations
- Poor user experience

**Recommendation:**
- Add Celery or RQ for background jobs
- Implement job queues for:
  - Email notifications
  - Push notifications
  - Payment processing
  - Image processing/resizing
  - Analytics aggregation
  - Cleanup tasks

#### 6.1.5 Database Connection Pooling Limitations
**Issue:** Connection pool size (max: 20) may be insufficient under high load.

**Impact:**
- Connection exhaustion
- Request timeouts
- Poor performance under load

**Recommendation:**
- Increase pool size based on load testing
- Implement connection pool monitoring
- Add connection pool health checks
- Consider PgBouncer for connection pooling

### 6.2 Security Weaknesses

#### 6.2.1 CORS Configuration
**Issue:** `allow_origins=["*"]` allows any origin to access API.

**Impact:**
- CSRF attacks possible
- Unauthorized access from malicious sites
- Data leakage risk

**Recommendation:**
- Whitelist specific origins (production, staging)
- Use environment variables for allowed origins
- Implement CORS preflight validation

#### 6.2.2 No Rate Limiting
**Issue:** No rate limiting on API endpoints.

**Impact:**
- DDoS vulnerability
- API abuse
- Resource exhaustion
- Cost escalation

**Recommendation:**
- Implement rate limiting (Redis-based):
  - Per-user limits (e.g., 100 req/min)
  - Per-IP limits (e.g., 1000 req/min)
  - Endpoint-specific limits (e.g., search: 10 req/min)
- Use FastAPI middleware or Nginx rate limiting
- Return 429 status on rate limit exceeded

#### 6.2.3 No Input Validation on Some Endpoints
**Issue:** Some endpoints may not validate all inputs thoroughly.

**Impact:**
- SQL injection risk (mitigated by asyncpg, but still risky)
- Data corruption
- Invalid state transitions

**Recommendation:**
- Use Pydantic models for all inputs
- Add custom validators for business logic
- Validate file uploads (size, type, content)
- Sanitize user inputs

#### 6.2.4 Token Management
**Issue:** No token refresh mechanism. Long-lived tokens increase risk.

**Impact:**
- Compromised tokens remain valid longer
- No way to revoke tokens without Supabase
- Security risk if token leaked

**Recommendation:**
- Implement token refresh flow
- Add token blacklist (Redis) for revoked tokens
- Reduce token TTL
- Implement token rotation

### 6.3 Performance Weaknesses

#### 6.3.1 N+1 Query Problem
**Issue:** Some endpoints may fetch related data in separate queries.

**Impact:**
- Slow response times
- High database load
- Poor scalability

**Recommendation:**
- Use JOINs to fetch related data in single query
- Implement data loaders (GraphQL-style)
- Add database query logging to identify N+1 patterns

#### 6.3.2 No Database Query Optimization
**Issue:** Some queries may not be optimized. Missing indexes on some columns.

**Impact:**
- Slow queries
- High database CPU usage
- Poor user experience

**Recommendation:**
- Analyze slow queries (PostgreSQL `pg_stat_statements`)
- Add missing indexes:
  - `jobs.status` (for filtering)
  - `jobs.created_at` (for sorting)
  - `messages.chat_id, created_at` (for chat history)
- Use EXPLAIN ANALYZE to optimize queries
- Consider materialized views for complex aggregations

#### 6.3.3 Frontend Bundle Size
**Issue:** No code splitting or lazy loading visible.

**Impact:**
- Large initial bundle size
- Slow page load times
- Poor mobile experience

**Recommendation:**
- Implement route-based code splitting
- Lazy load heavy components (charts, maps)
- Optimize images (WebP, lazy loading)
- Use Vite's code splitting features

### 6.4 Data & Business Logic Weaknesses

#### 6.4.1 Hardcoded Locations
**Issue:** Frontend has hardcoded coordinates (Nagpur: 21.1458, 79.0882).

**Impact:**
- Incorrect location-based results
- Poor user experience
- Limited to single city

**Recommendation:**
- Always use browser Geolocation API
- Fallback to IP-based geolocation
- Allow manual location selection
- Store user's preferred location

#### 6.4.2 No Data Validation on Job Status Transitions
**Issue:** Job status can be changed without validating allowed transitions.

**Impact:**
- Invalid state transitions (e.g., completed → open)
- Data inconsistency
- Business logic errors

**Recommendation:**
- Implement state machine for job status
- Validate transitions in backend
- Use database constraints or triggers
- Add audit log for status changes

#### 6.4.3 No Duplicate Prevention
**Issue:** No mechanism to prevent duplicate job postings or bids.

**Impact:**
- Spam/junk data
- Poor user experience
- Database bloat

**Recommendation:**
- Add duplicate detection (hash-based)
- Implement idempotency keys for critical operations
- Add rate limiting on job posting
- Validate job uniqueness (title + location + customer)

#### 6.4.4 Incomplete Error Handling
**Issue:** Some errors may not be handled gracefully. Generic error messages.

**Impact:**
- Poor debugging
- Confusing user experience
- Security information leakage

**Recommendation:**
- Implement structured error responses
- Log errors with context (user ID, request ID, stack trace)
- Use error tracking (Sentry)
- Return user-friendly error messages
- Hide sensitive error details in production

### 6.5 Monitoring & Observability Weaknesses

#### 6.5.1 No Application Monitoring
**Issue:** No APM (Application Performance Monitoring) or error tracking.

**Impact:**
- Cannot identify performance bottlenecks
- Errors go unnoticed
- No visibility into system health

**Recommendation:**
- Integrate Sentry for error tracking
- Add APM (New Relic, Datadog, or OpenTelemetry)
- Implement structured logging (JSON logs)
- Add health check endpoints
- Monitor database query performance

#### 6.5.2 No Analytics
**Issue:** No user behavior analytics or business metrics tracking.

**Impact:**
- Cannot make data-driven decisions
- No visibility into user engagement
- Cannot optimize conversion funnel

**Recommendation:**
- Add analytics (Google Analytics, Mixpanel, or custom)
- Track key events:
  - User signups
  - Job postings
  - Bids placed
  - Jobs completed
  - Payments processed
- Implement dashboard for business metrics

#### 6.5.3 Limited Logging
**Issue:** Basic logging with print statements. No structured logging.

**Impact:**
- Difficult to debug issues
- No log aggregation
- Poor observability

**Recommendation:**
- Use structured logging (JSON format)
- Add log levels (DEBUG, INFO, WARNING, ERROR)
- Include request IDs for tracing
- Centralize logs (ELK stack, CloudWatch, or similar)
- Log all API requests/responses (sanitized)

### 6.6 Scalability Weaknesses

#### 6.6.1 Single Database Instance
**Issue:** Single PostgreSQL database. No read replicas or sharding.

**Impact:**
- Database becomes bottleneck
- No horizontal scaling
- Single point of failure

**Recommendation:**
- Add read replicas for read-heavy queries
- Implement database connection pooling (PgBouncer)
- Consider sharding by region (if multi-region)
- Plan for database failover

#### 6.6.2 No CDN for Static Assets
**Issue:** Frontend assets served from Vercel, but no CDN optimization.

**Impact:**
- Slower load times for global users
- Higher bandwidth costs
- Poor mobile experience

**Recommendation:**
- Use Vercel's CDN (already included)
- Optimize images (WebP, compression)
- Implement asset versioning
- Use CDN for Supabase Storage URLs

#### 6.6.3 No Load Balancing Strategy
**Issue:** Backend deployment strategy not clear. No load balancing mentioned.

**Impact:**
- Single point of failure
- Cannot handle traffic spikes
- Poor availability

**Recommendation:**
- Deploy multiple backend instances
- Use load balancer (AWS ALB, Nginx, or cloud provider)
- Implement health checks
- Auto-scaling based on load

### 6.7 Testing & Quality Assurance Weaknesses

#### 6.7.1 No Automated Tests
**Issue:** No unit tests, integration tests, or E2E tests visible.

**Impact:**
- Bugs in production
- Regression issues
- Low code confidence
- Slow development velocity

**Recommendation:**
- Add unit tests (pytest for backend, Jest for frontend)
- Implement integration tests for API endpoints
- Add E2E tests (Playwright, Cypress)
- Set up CI/CD with test automation
- Target 80%+ code coverage

#### 6.7.2 No API Testing
**Issue:** No automated API contract testing.

**Impact:**
- Breaking changes go unnoticed
- API inconsistencies
- Poor developer experience

**Recommendation:**
- Use OpenAPI/Swagger for contract testing
- Implement API versioning
- Add contract tests (Pact, or similar)
- Document API changes

### 6.8 Deployment & DevOps Weaknesses

#### 6.8.1 No CI/CD Pipeline
**Issue:** No automated deployment pipeline visible.

**Impact:**
- Manual deployment errors
- Slow release cycles
- Inconsistent deployments

**Recommendation:**
- Set up CI/CD (GitHub Actions, GitLab CI, or similar)
- Automated testing before deployment
- Staging environment for testing
- Blue-green or canary deployments
- Automated rollback on failure

#### 6.8.2 No Environment Management
**Issue:** Environment variables management not clear.

**Impact:**
- Configuration errors
- Security risks
- Inconsistent environments

**Recommendation:**
- Use environment-specific config files
- Secrets management (AWS Secrets Manager, HashiCorp Vault)
- Separate dev, staging, production environments
- Document all environment variables

#### 6.8.3 No Backup Strategy
**Issue:** Database backup strategy not mentioned.

**Impact:**
- Data loss risk
- No disaster recovery
- Compliance issues

**Recommendation:**
- Automated daily database backups
- Test backup restoration regularly
- Off-site backup storage
- Point-in-time recovery (PITR)
- Document disaster recovery plan

---

## 7. Recommended Improvements

### 7.1 Immediate Priority (Critical)

1. **Complete Payment Integration**
   - Integrate Razorpay/Stripe
   - Implement webhook handlers
   - Complete escrow release flow
   - Add payment retry logic

2. **Fix CORS Configuration**
   - Whitelist specific origins
   - Remove wildcard (`*`)
   - Add CORS preflight validation

3. **Implement Rate Limiting**
   - Redis-based rate limiting
   - Per-user and per-IP limits
   - Endpoint-specific limits

4. **Add Input Validation**
   - Pydantic models for all inputs
   - File upload validation
   - Business logic validation

5. **Fix Hardcoded Locations**
   - Always use Geolocation API
   - Fallback to IP geolocation
   - Allow manual location selection

### 7.2 High Priority (Important)

1. **Add Caching Layer**
   - Redis for frequently accessed data
   - Cache user profiles, search results
   - Implement cache invalidation

2. **Implement Background Jobs**
   - Celery or RQ for async tasks
   - Email/push notifications
   - Payment processing
   - Image processing

3. **Add Monitoring & Logging**
   - Sentry for error tracking
   - Structured logging
   - APM for performance monitoring
   - Health check endpoints

4. **Database Optimization**
   - Add missing indexes
   - Optimize slow queries
   - Connection pool tuning
   - Query performance monitoring

5. **Implement Testing**
   - Unit tests (backend & frontend)
   - Integration tests
   - E2E tests
   - CI/CD pipeline

### 7.3 Medium Priority (Enhancement)

1. **Improve Real-time Chat**
   - Message queue for high volume
   - Offline message queuing
   - Delivery receipts
   - Message persistence guarantees

2. **Add API Versioning**
   - Version endpoints (`/api/v1/...`)
   - Backward compatibility
   - Deprecation strategy

3. **Implement Token Refresh**
   - Refresh token flow
   - Token blacklist
   - Reduced token TTL

4. **Add Analytics**
   - User behavior tracking
   - Business metrics dashboard
   - Conversion funnel analysis

5. **Frontend Optimization**
   - Code splitting
   - Lazy loading
   - Image optimization
   - Bundle size reduction

### 7.4 Long-term (Scalability)

1. **Database Scaling**
   - Read replicas
   - Connection pooling (PgBouncer)
   - Sharding strategy (if needed)

2. **Microservices Architecture**
   - Split into services (auth, jobs, payments, chat)
   - Service mesh (Istio, Linkerd)
   - API gateway

3. **Multi-region Deployment**
   - Regional database replicas
   - CDN for global content
   - Regional API endpoints

4. **Advanced Features**
   - Machine learning for job matching
   - Fraud detection
   - Automated dispute resolution
   - Advanced analytics & reporting

---

## 8. System Scalability Plan

### 8.1 Current Capacity Estimates

**Assumptions:**
- Average API response time: 200-500ms
- Database connection pool: 20 connections
- Supabase Realtime: ~1000 concurrent connections
- Frontend: Vercel CDN (global)

**Estimated Capacity:**
- **Users:** ~10,000 concurrent users
- **API Requests:** ~1,000 requests/second
- **Jobs:** ~100,000 active jobs
- **Messages:** ~10,000 messages/day

### 8.2 Scaling Strategy

**Phase 1: Vertical Scaling (0-50K users)**
- Increase database instance size
- Increase connection pool size
- Add Redis caching
- Optimize database queries

**Phase 2: Horizontal Scaling (50K-500K users)**
- Add read replicas
- Multiple backend instances + load balancer
- CDN for static assets
- Background job workers

**Phase 3: Microservices (500K+ users)**
- Split into microservices
- Service mesh
- Database sharding
- Multi-region deployment

### 8.3 Performance Targets

- **API Response Time:** < 200ms (p95)
- **Page Load Time:** < 2 seconds
- **Database Query Time:** < 100ms (p95)
- **Real-time Message Latency:** < 500ms
- **Uptime:** 99.9% (8.76 hours downtime/year)

---

## 9. Deployment Architecture

### 9.1 Current Deployment

**Frontend:**
- **Platform:** Vercel
- **Type:** SPA with client-side routing
- **Build:** Vite production build
- **CDN:** Vercel Edge Network

**Backend:**
- **Platform:** Not specified (likely cloud VM or container)
- **Server:** Uvicorn ASGI server
- **Process Manager:** Not specified

**Database:**
- **Platform:** Supabase (managed PostgreSQL)
- **Backup:** Managed by Supabase

### 9.2 Recommended Deployment

**Frontend:**
- Keep Vercel (excellent for React SPAs)
- Enable Vercel Analytics
- Use Vercel Edge Functions for API proxying (if needed)

**Backend:**
- **Option 1:** Docker containers on cloud (AWS ECS, Google Cloud Run, Azure Container Instances)
- **Option 2:** Serverless (AWS Lambda, Google Cloud Functions) - requires refactoring
- **Option 3:** Kubernetes (for microservices future)
- Use process manager (systemd, supervisor, or container orchestration)

**Database:**
- Keep Supabase for development/staging
- Consider managed PostgreSQL (AWS RDS, Google Cloud SQL) for production at scale
- Add read replicas when needed

**Infrastructure:**
- **Load Balancer:** Cloud provider ALB/NLB
- **Caching:** Redis (AWS ElastiCache, Google Cloud Memorystore)
- **Message Queue:** RabbitMQ or Redis (for background jobs)
- **Monitoring:** CloudWatch, Datadog, or New Relic
- **Logging:** CloudWatch Logs, ELK stack, or similar

---

## 10. Data Flow Diagrams

### 10.1 Job Posting Flow

```
Customer → Frontend → POST /api/jobs
                    ↓
              FastAPI Backend
                    ↓
              Validate Input
                    ↓
              Insert into jobs table
                    ↓
              Return job_id
                    ↓
Frontend ← Display success
```

### 10.2 Worker Search Flow

```
Customer → Frontend → GET /api/search?lat=X&lon=Y&profession=plumber
                    ↓
              FastAPI Backend
                    ↓
              Call search_workers() function
                    ↓
              PostgreSQL + PostGIS
              (Distance query + filtering)
                    ↓
              Return ranked results
                    ↓
Frontend ← Display workers on map/list
```

### 10.3 Chat Message Flow

```
User A → Frontend → POST /api/chats/{chat_id}/messages
                   ↓
             FastAPI Backend
                   ↓
             Insert into messages table
                   ↓
             PostgreSQL Trigger
                   ↓
             Supabase Realtime
                   ↓
             Broadcast to subscribers
                   ↓
User B ← Frontend (receives via WebSocket)
```

### 10.4 Payment Flow (Planned)

```
Customer → Frontend → Initiate Payment
                    ↓
              FastAPI Backend
                    ↓
              Create payment record (initiated)
                    ↓
              Call Razorpay/Stripe API
                    ↓
              Customer pays on gateway
                    ↓
              Gateway Webhook → Backend
                    ↓
              Call process_payment_captured()
                    ↓
              Funds held in escrow
                    ↓
              Worker completes job
                    ↓
              Customer approves
                    ↓
              Call release_funds()
                    ↓
              Schedule payout to worker
                    ↓
              Worker receives payment
```

---

## 11. Technology Recommendations

### 11.1 Backend Enhancements

**Add to Stack:**
- **Redis:** For caching and rate limiting
- **Celery/RQ:** For background jobs
- **Sentry:** For error tracking
- **Prometheus + Grafana:** For metrics (optional)
- **Docker:** For containerization
- **Nginx:** For reverse proxy and load balancing

**Consider:**
- **FastAPI BackgroundTasks:** For lightweight async tasks
- **SQLAlchemy:** If ORM needed (currently using raw SQL)
- **Pydantic Settings:** For configuration management

### 11.2 Frontend Enhancements

**Add to Stack:**
- **React Query/TanStack Query:** For data fetching and caching
- **Zustand/Redux:** For global state management (if needed)
- **React Hook Form:** Already using, good choice
- **React Error Boundary:** For error handling
- **Service Worker:** For offline support (PWA)

**Consider:**
- **Next.js:** If SSR needed (currently SPA)
- **React Suspense:** For better loading states
- **Web Workers:** For heavy computations

### 11.3 Infrastructure

**Add to Stack:**
- **Terraform/CloudFormation:** For infrastructure as code
- **GitHub Actions/GitLab CI:** For CI/CD
- **Kubernetes:** For container orchestration (future)
- **Istio/Linkerd:** For service mesh (microservices)

---

## 12. Conclusion

### 12.1 System Strengths

1. **Modern Tech Stack:** React, FastAPI, PostgreSQL with PostGIS
2. **Real-time Capabilities:** Supabase Realtime for chat
3. **Spatial Queries:** PostGIS for location-based features
4. **Scalable Database Design:** Well-structured schema
5. **JWT Authentication:** Secure token-based auth
6. **API-First Design:** RESTful API with OpenAPI docs

### 12.2 Critical Gaps

1. **Payment System:** Designed but not implemented
2. **Caching:** No caching layer
3. **Monitoring:** No observability
4. **Testing:** No automated tests
5. **Security:** CORS too permissive, no rate limiting
6. **Scalability:** Single database, no horizontal scaling

### 12.3 Roadmap Priority

**Q1 (Immediate):**
- Complete payment integration
- Fix security issues (CORS, rate limiting)
- Add monitoring and logging
- Implement basic testing

**Q2 (Short-term):**
- Add caching layer
- Implement background jobs
- Database optimization
- Frontend performance optimization

**Q3 (Medium-term):**
- Improve real-time chat
- Add analytics
- API versioning
- Advanced features

**Q4 (Long-term):**
- Microservices architecture
- Multi-region deployment
- Machine learning features
- Advanced scalability

---

## 13. Appendix

### 13.1 Key Metrics to Track

**Business Metrics:**
- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- Jobs posted per day
- Jobs completed per day
- Average job value
- Platform revenue (commission)
- Worker earnings
- Customer satisfaction (ratings)

**Technical Metrics:**
- API response time (p50, p95, p99)
- Database query time
- Error rate
- Uptime
- Message delivery latency
- Cache hit rate
- Database connection pool usage

### 13.2 Database Schema Summary

**Core Tables:** 15+
- users, worker_profiles, jobs, bids
- payments, escrows, wallets, wallet_transactions
- chats, messages
- ratings (worker_ratings, user_ratings)
- kyc_documents, complaints
- push_tokens, push_notifications

**Indexes:** 10+
- GIST indexes for location queries
- GIN indexes for array searches
- B-tree indexes for foreign keys and filters

**Functions:** 5+
- search_workers()
- search_jobs()
- process_payment_captured() (planned)
- schedule_payout_for_payment() (planned)
- mark_payout_result() (planned)

### 13.3 API Endpoint Summary

**Total Endpoints:** ~30+
- Authentication: 1
- Profile: 5
- Search: 3
- Jobs: 10+
- Chat: 4
- Ratings: 3
- Payments: (planned)
- Admin: 2+

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-27  
**Author:** System Design Analysis  
**Status:** Comprehensive Review Complete



# Kaargar - Marketplace System Design Document

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture](#architecture)
4. [Technology Stack](#technology-stack)
5. [Core Features & Modules](#core-features--modules)
6. [Data Flow & Workflows](#data-flow--workflows)
7. [Database Design](#database-design)
8. [API Design](#api-design)
9. [Security Architecture](#security-architecture)
10. [Current Weak Points](#current-weak-points)
11. [Improvements & Recommendations](#improvements--recommendations)
12. [Scalability Strategy](#scalability-strategy)
13. [Deployment Architecture](#deployment-architecture)
14. [Monitoring & Observability](#monitoring--observability)
15. [Future Enhancements](#future-enhancements)

---

## Executive Summary

**Kaargar** is a two-sided marketplace platform connecting blue-collar workers (plumbers, electricians, mechanics, carpenters, maids, drivers) with customers and companies. The platform facilitates job posting, bidding, direct booking, real-time communication, secure payment escrow, and worker management.

**Key Value Propositions:**
- Location-based worker discovery using PostGIS
- Real-time chat for job coordination
- Escrow-based payment system for trust
- Multi-role support (customers, workers, agencies, companies)
- Rating and review system for quality assurance
- KYC verification for worker credibility

---

## System Overview

### Problem Statement
The blue-collar workforce in India faces challenges in finding consistent work, while customers struggle to find verified, skilled workers. Traditional methods lack transparency, payment security, and efficient matching.

### Solution
Kaargar provides a digital marketplace that:
- Matches workers with jobs based on location, skills, and availability
- Ensures payment security through escrow
- Facilitates communication through real-time chat
- Maintains quality through ratings and KYC verification
- Supports both individual workers and agencies/companies

### User Roles
1. **Customer**: Posts jobs, hires workers, makes payments
2. **Worker**: Individual service provider, bids on jobs, receives payments
3. **Agency**: Manages multiple workers, can post jobs or hire workers
4. **Company**: Large organizations posting bulk jobs
5. **Admin**: Platform management, KYC approval, dispute resolution

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Web App    │  │  Mobile App  │  │  Admin Panel │        │
│  │  (React)     │  │   (Future)   │  │   (Future)   │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────┐
│                    API GATEWAY LAYER                        │
│  ┌────────────────────────────────────────────────────┐   │
│  │         FastAPI Backend (Python)                    │   │
│  │  - RESTful APIs                                     │   │
│  │  - JWT Authentication                                │   │
│  │  - Request Validation (Pydantic)                   │   │
│  │  - CORS Management                                  │   │
│  └────────────────────────────────────────────────────┘   │
└────────────────────────────┬──────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────┐
│                    SERVICE LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Auth      │  │   Business   │  │   Payment    │      │
│  │  Service    │  │   Logic      │  │   Service    │      │
│  │ (Supabase) │  │   (FastAPI)  │  │  (Future)    │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────────┬──────────────────────────────┘
                             │
┌────────────────────────────┼──────────────────────────────┐
│                    DATA LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  PostgreSQL  │  │   Supabase   │  │   Supabase    │     │
│  │  + PostGIS   │  │    Auth      │  │   Storage     │     │
│  │  (Primary DB)│  │              │  │   (Media)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   Supabase  │  │   Redis     │                        │
│  │  Realtime   │  │  (Future)    │                        │
│  │  (Chat)     │  │  (Cache)     │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Patterns
- **Monolithic Backend**: FastAPI application handling all business logic
- **Microservices-Ready**: Modular structure allows future service extraction
- **Event-Driven**: Supabase Realtime for chat, future message queue for async jobs
- **Database-Centric**: Complex logic in PostgreSQL functions for performance

---

## Technology Stack

### Frontend
- **Framework**: React 19.1.1 with Vite 7.1.2
- **UI Library**: Radix UI components with Tailwind CSS 4.1.17
- **State Management**: React Hooks (Context API for auth)
- **Routing**: React Router DOM 7.8.0
- **Forms**: React Hook Form 7.66.1 with Zod validation
- **Animations**: Framer Motion 12.23.24, GSAP 3.13.0
- **Notifications**: Sonner 2.0.7
- **Charts**: Recharts 3.5.1
- **Build Tool**: Vite with React plugin
- **Deployment**: Vercel

### Backend
- **Framework**: FastAPI 0.121.3
- **Language**: Python 3.10+
- **Database Driver**: asyncpg 0.30.0 (async PostgreSQL)
- **Authentication**: Supabase Auth (JWT-based)
- **Validation**: Pydantic 2.12.4
- **Server**: Uvicorn 0.38.0 (ASGI server)
- **Caching**: cachetools 6.2.2 (in-memory JWT cache)

### Database
- **Primary DB**: PostgreSQL with PostGIS extension
- **Auth Provider**: Supabase Auth
- **Storage**: Supabase Storage (for media files)
- **Realtime**: Supabase Realtime (for chat)

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Not specified (likely cloud VM or container)
- **Database Hosting**: Supabase (managed PostgreSQL)
- **CDN**: Vercel Edge Network

---

## Core Features & Modules

### 1. Authentication & Authorization
- **Provider**: Supabase Auth
- **Method**: JWT tokens (HS256)
- **Features**:
  - Email/password authentication
  - Session management
  - Role-based access control (RBAC)
  - Token caching (5-minute TTL)
- **Roles**: customer, worker, agency, company, admin

### 2. User Management
- **Profile Management**: Full profile with avatar, contact info, location
- **Worker Profiles**: Professions, skills, hourly rates, experience, availability
- **Location Tracking**: PostGIS geography for spatial queries
- **KYC System**: Document upload and verification workflow

### 3. Job Management
- **Job Posting**: Customers post jobs with location, budget, requirements
- **Job Types**:
  - Open jobs (bidding-based)
  - Direct booking (worker pre-selected)
- **Job Status Flow**: `draft → open/bidding → assigned → in_progress → completed → cancelled`
- **Job Matching**: Location-based search with radius filtering

### 4. Bidding System
- Workers place bids on open jobs
- Bid includes: amount, message/proposal
- Customer selects winning bid
- Automatic job status update on bid acceptance

### 5. Search & Discovery
- **Worker Search**: Location-based with filters (profession, service, gender, rating)
- **Job Feed**: Personalized feed for workers based on location and profession
- **Search Algorithm**: PostGIS spatial queries + ranking by:
  - Distance (geography-based)
  - Rating
  - Availability (online status)
  - Match score (profession/services)

### 6. Real-Time Chat
- **Technology**: Supabase Realtime (PostgreSQL change streams)
- **Features**:
  - One-on-one chat per job
  - Text messages
  - Media attachments (images, files)
  - Message history
  - Optimistic UI updates
- **Channel Pattern**: `room:{chat_id}:messages`

### 7. Payment System (Designed, Partially Implemented)
- **Escrow Model**: Customer payment held until job completion
- **Payment Flow**:
  1. Customer initiates payment → `initiated`
  2. Payment captured → `captured` (funds in escrow)
  3. Job completed → `released` (funds to worker)
  4. Refund option if job cancelled
- **Platform Fee**: Configurable percentage deducted from payment
- **Wallet System**: User wallets with balance and reserved amounts
- **Payment Providers**: Razorpay/Stripe (mentioned, not fully integrated)

### 8. Rating & Reviews
- Bidirectional ratings (customer rates worker, worker rates customer)
- 5-star rating system with optional comments
- Aggregated ratings displayed on profiles
- Rating history and trends

### 9. Notifications
- Push notification registration (device tokens stored)
- In-app notifications (future)
- Email notifications (future)
- SMS notifications (future)

### 10. Admin Features
- User flagging system
- KYC document review
- Dispute resolution
- Platform analytics
- Fee rule management

---

## Data Flow & Workflows

### Workflow 1: Customer Hires Worker (Direct Booking)
```
1. Customer searches workers → GET /api/search
2. Customer selects worker → POST /api/jobs/book
   - Creates job with status 'assigned' or 'pending_acceptance'
   - Links worker to job
3. Worker accepts (if required) → PATCH /api/jobs/{id}/status
4. Chat room created → POST /api/jobs/{id}/chat
5. Payment initiated → (Future: POST /api/payments)
6. Worker completes job → POST /api/jobs/{id}/proof
7. Customer approves → POST /api/jobs/{id}/approve
8. Payment released → (Future: automatic via webhook)
9. Ratings exchanged → POST /api/ratings/worker, POST /api/ratings/user
```

### Workflow 2: Bidding-Based Job
```
1. Customer posts job → POST /api/jobs (status: 'open')
2. Workers see job in feed → GET /api/jobs/feed
3. Workers place bids → POST /api/jobs/{id}/bids
4. Job status → 'bidding'
5. Customer reviews bids → GET /api/jobs/{id}/bids
6. Customer selects bid → POST /api/jobs/hire
   - Updates job status to 'assigned'
   - Links worker to job
7. Continue from step 4 of Workflow 1
```

### Workflow 3: Real-Time Chat
```
1. User opens chat → GET /api/jobs/{id}
2. Chat room created/fetched → POST /api/jobs/{id}/chat
3. Frontend subscribes to Supabase Realtime channel
4. User sends message → POST /api/chats/{chat_id}/messages
5. Backend inserts into messages table
6. Supabase Realtime broadcasts INSERT event
7. All subscribers receive message via WebSocket
8. Frontend updates UI optimistically
```

### Workflow 4: Location-Based Search
```
1. User grants location permission
2. Frontend gets coordinates → navigator.geolocation
3. Location updated → PATCH /api/me/location
4. Search request → GET /api/search?lat={lat}&lon={lon}&radius={radius}
5. Backend calls PostgreSQL function: search_workers()
6. PostGIS calculates distances using ST_Distance
7. Results ranked by: distance, rating, availability
8. Results returned to frontend
```

---

## Database Design

### Core Tables

#### `users`
- Primary identity table (linked to Supabase Auth)
- Fields: id (UUID, PK), email, full_name, phone, role, location (geography), rating_avg, rating_count, trouble_score
- Indexes: GIST on location, GIN on tags

#### `worker_profiles`
- One-to-one with users (for workers/agencies)
- Fields: user_id (FK), professions[], services[], min_hourly_rate_cents, experience_years, is_online, search_radius_meters
- Indexes: GIN on professions, GIN on services

#### `jobs`
- Job postings and assignments
- Fields: id (UUID, PK), customer_id (FK), worker_id (FK), title, description, category, job_location (geography), budget_max_cents, status, created_at
- Indexes: GIST on job_location, B-tree on category, B-tree on status

#### `bids`
- Worker bids on jobs
- Fields: id (UUID, PK), job_id (FK), worker_id (FK), amount_cents, message, status, created_at
- Indexes: B-tree on job_id

#### `chats`
- Chat rooms (one per job)
- Fields: id (UUID, PK), job_id (FK), created_at

#### `messages`
- Chat messages
- Fields: id (UUID, PK), chat_id (FK), sender_id (FK), content, media_url, media_type, created_at
- Indexes: B-tree on chat_id, B-tree on created_at

#### `payments`
- Payment transactions
- Fields: id (UUID, PK), job_id (FK), payer_id (FK), payee_id (FK), amount_total_cents, platform_fee_cents, amount_to_worker_cents, status, payout_status
- Indexes: B-tree on job_id, B-tree on status

#### `wallets`
- User wallet balances
- Fields: user_id (UUID, PK), balance_cents, reserved_cents, updated_at

#### `wallet_transactions`
- Wallet transaction ledger
- Fields: id (UUID, PK), user_id (FK), amount_cents, kind, reference_id, created_at
- Indexes: B-tree on user_id, B-tree on created_at

#### `ratings`
- User ratings
- Fields: id (UUID, PK), job_id (FK), from_user_id (FK), to_user_id (FK), rating, review_text, created_at
- Indexes: B-tree on to_user_id

#### `kyc_documents`
- KYC verification documents
- Fields: id (UUID, PK), user_id (FK), doc_type, storage_path, status, reviewed_by, reviewed_at

### Database Functions
- `search_workers(lat, lon, profession, service, radius, gender, sort_by)`: Location-based worker search
- `search_jobs(lat, lon, query, radius, min_budget, profession, services)`: Job search
- `hire_worker(job_id, bid_id, customer_id)`: Hire worker from bid
- `release_funds(job_id)`: Release escrow funds to worker
- `process_payment_captured(payment_id, provider_payment_id, amount)`: Process payment capture
- `schedule_payout_for_payment(payment_id, provider)`: Schedule worker payout
- `mark_payout_result(payout_id, provider_payout_id, status, error)`: Mark payout completion

### Spatial Queries
- Uses PostGIS `geography` type for accurate distance calculations
- `ST_Distance` for radius-based filtering
- `ST_MakePoint` for creating location points
- GIST indexes for efficient spatial queries

---

## API Design

### API Structure
- **Base URL**: Configurable via `VITE_BACKEND_BASE` environment variable
- **Authentication**: Bearer token in Authorization header
- **Response Format**: JSON with `{"ok": true/false, ...}` wrapper
- **Error Handling**: HTTP status codes + error details in response

### Key Endpoints

#### Authentication
- `POST /api/auth/upsert_user` - Create/update user from Supabase Auth

#### Profile Management
- `GET /api/me` - Get current user profile
- `PATCH /api/me/profile` - Update user profile
- `PATCH /api/me/worker` - Update worker profile
- `PATCH /api/me/location` - Update user location
- `POST /api/profiles/onboard` - Complete onboarding

#### Search & Discovery
- `GET /api/search` - Search workers
- `GET /api/jobs/search` - Search jobs
- `GET /api/jobs/feed` - Get personalized job feed

#### Job Management
- `POST /api/jobs` - Post new job
- `GET /api/jobs/{id}` - Get job details
- `POST /api/jobs/book` - Direct book worker
- `POST /api/jobs/{id}/bids` - Place bid
- `POST /api/jobs/hire` - Hire worker from bid
- `DELETE /api/jobs/{id}` - Delete job
- `PATCH /api/jobs/{id}/status` - Update job status

#### Job Completion
- `POST /api/jobs/{id}/proof` - Submit job proof
- `POST /api/jobs/{id}/approve` - Approve job completion

#### Chat
- `POST /api/jobs/{id}/chat` - Get/create chat room
- `GET /api/chats/{chat_id}/messages` - Get messages
- `POST /api/chats/{chat_id}/messages` - Send message

#### Ratings
- `POST /api/ratings/worker` - Rate worker
- `POST /api/ratings/user` - Rate customer
- `GET /api/ratings/{user_id}` - Get user ratings

#### History & Stats
- `GET /api/me/jobs/posted` - Get posted jobs
- `GET /api/me/jobs/worked` - Get worked jobs
- `GET /api/me/stats` - Get financial stats

#### Admin
- `POST /api/admin/toggle_flag` - Flag/unflag user
- `GET /api/admin/flagged_users` - List flagged users

### API Versioning
- **Current**: No versioning (v3.3 mentioned in OpenAPI title)
- **Recommendation**: Implement `/api/v1/` prefix for future compatibility

---

## Security Architecture

### Authentication
- **JWT Tokens**: HS256 signed by Supabase
- **Token Validation**: 
  - Signature verification
  - Audience check (`authenticated`)
  - Expiration check
  - Issuer validation (optional)
- **Token Caching**: In-memory TTL cache (5 minutes, 4096 entries)

### Authorization
- **Role-Based Access Control (RBAC)**: Enforced at API level
- **Resource Ownership**: Users can only modify their own resources
- **Admin Access**: Service role key for admin operations

### Data Security
- **Row Level Security (RLS)**: Supabase RLS policies (mentioned in chat code)
- **SQL Injection Prevention**: Parameterized queries (asyncpg)
- **Input Validation**: Pydantic models for request validation
- **CORS**: Currently set to `*` (⚠️ **Security Risk**)

### Payment Security
- **Escrow System**: Funds held until job completion
- **Webhook Verification**: (Future) Verify payment provider webhooks
- **Idempotency**: Payment operations should be idempotent

### Vulnerabilities Identified
1. **CORS**: `allow_origins=["*"]` allows any origin
2. **No Rate Limiting**: API endpoints unprotected
3. **No Request Size Limits**: Potential DoS via large payloads
4. **Token Refresh**: No refresh token rotation mechanism
5. **Password Policy**: Handled by Supabase (unknown strength)

---

## Current Weak Points

### 1. Architecture & Scalability
- **Monolithic Backend**: All logic in single FastAPI app
- **No Load Balancing**: Single instance deployment
- **No Caching Layer**: No Redis for session/data caching
- **No Message Queue**: No async job processing (emails, notifications)
- **Database Connection Pool**: Basic pool (1-20 connections), may bottleneck

### 2. Performance
- **No CDN**: Static assets served from Vercel (good) but no dedicated CDN
- **No Query Optimization**: Some N+1 query patterns possible
- **No Database Read Replicas**: Single database instance
- **No Response Compression**: API responses not compressed
- **Large Payloads**: No pagination on some list endpoints

### 3. Reliability & Resilience
- **No Circuit Breakers**: External service failures can cascade
- **No Retry Logic**: Failed operations not automatically retried
- **No Health Checks**: No endpoint monitoring
- **No Graceful Shutdown**: Application may drop in-flight requests
- **No Backup Strategy**: Database backup strategy not documented

### 4. Security
- **CORS Misconfiguration**: Allows all origins
- **No Rate Limiting**: Vulnerable to brute force, DoS
- **No API Versioning**: Breaking changes affect all clients
- **No Request Validation Limits**: Unbounded input sizes
- **JWT Secret Management**: Relies on environment variables (good) but no rotation

### 5. Observability
- **Limited Logging**: Basic Python logging, no structured logs
- **No Metrics**: No Prometheus/StatsD integration
- **No Distributed Tracing**: No request tracing across services
- **No Error Tracking**: No Sentry/error monitoring
- **No Performance Monitoring**: No APM tools

### 6. Development & Testing
- **No Test Suite**: No unit/integration tests visible
- **No CI/CD Pipeline**: No automated testing/deployment
- **No API Documentation**: OpenAPI exists but may not be maintained
- **No Code Quality Tools**: No linting/formatting automation

### 7. Payment System
- **Incomplete Implementation**: Payment endpoints designed but not fully implemented
- **No Webhook Handling**: Payment provider webhooks not processed
- **No Idempotency**: Payment operations may duplicate
- **No Reconciliation**: No automated payment reconciliation

### 8. Frontend
- **No State Management**: Large state in React components
- **No Error Boundaries**: React errors may crash entire app
- **Hardcoded Values**: Some locations hardcoded (21.1458, 79.0882)
- **No Offline Support**: App requires constant internet
- **No Progressive Web App**: No PWA features

### 9. Data Management
- **No Data Archival**: Old data never archived
- **No Data Export**: Users cannot export their data
- **No Soft Deletes**: Hard deletes may cause data loss
- **No Audit Logs**: Limited audit trail

### 10. User Experience
- **No Offline Mode**: App unusable without internet
- **No Push Notifications**: Device tokens stored but not used
- **Limited Error Messages**: Generic error messages
- **No Loading States**: Some operations lack loading indicators

---

## Improvements & Recommendations

### Priority 1: Critical Security Fixes

#### 1.1 Fix CORS Configuration
```python
# BACKEND/app/main.py
origins = [
    "https://kaargar.vercel.app",
    "https://www.kaargar.com",
    "http://localhost:5173",  # Development only
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600,
)
```

#### 1.2 Implement Rate Limiting
```python
# Add slowapi or fastapi-limiter
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.get("/api/search")
@limiter.limit("10/minute")
async def search_workers_endpoint(...):
    ...
```

#### 1.3 Add Request Size Limits
```python
# In FastAPI app configuration
from fastapi import Request
from fastapi.exceptions import RequestValidationError

@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.headers.get("content-length"):
        size = int(request.headers["content-length"])
        if size > 10 * 1024 * 1024:  # 10MB
            raise HTTPException(413, "Request too large")
    return await call_next(request)
```

#### 1.4 Implement API Versioning
```python
# BACKEND/app/main.py
app = FastAPI(
    title="KAARGAR API",
    version="1.0.0",
    root_path="/api/v1"
)

# All routes automatically prefixed with /api/v1
```

### Priority 2: Performance Optimizations

#### 2.1 Add Redis Caching
```python
# BACKEND/app/cache.py
import redis.asyncio as redis

redis_client = redis.from_url(os.getenv("REDIS_URL"))

async def get_cached_user(user_id: str):
    cached = await redis_client.get(f"user:{user_id}")
    if cached:
        return json.loads(cached)
    return None

async def cache_user(user_id: str, data: dict, ttl: int = 300):
    await redis_client.setex(
        f"user:{user_id}",
        ttl,
        json.dumps(data)
    )
```

**Cache Strategy:**
- User profiles: 5 minutes TTL
- Search results: 2 minutes TTL (location-based)
- Job details: 1 minute TTL
- Worker profiles: 5 minutes TTL

#### 2.2 Implement Database Connection Pooling Optimization
```python
# BACKEND/app/main.py
app.state.db_pool = await asyncpg.create_pool(
    DATABASE_URL,
    min_size=5,  # Increased from 1
    max_size=50,  # Increased from 20
    statement_cache_size=0,
    max_inactive_connection_lifetime=300,
    command_timeout=30,  # Add timeout
    server_settings={
        'application_name': 'kaargar_api',
    }
)
```

#### 2.3 Add Response Compression
```python
# BACKEND/app/main.py
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)
```

#### 2.4 Implement Pagination
```python
# BACKEND/app/main.py
class PaginationParams(BaseModel):
    page: int = Query(1, ge=1)
    page_size: int = Query(20, ge=1, le=100)

@app.get("/api/jobs/feed")
async def get_worker_job_feed(
    pagination: PaginationParams = Depends(),
    ...
):
    offset = (pagination.page - 1) * pagination.page_size
    rows = await conn.fetch(
        "SELECT * FROM search_jobs(...) LIMIT $1 OFFSET $2",
        pagination.page_size, offset
    )
    return {
        "ok": True,
        "jobs": [dict(r) for r in rows],
        "pagination": {
            "page": pagination.page,
            "page_size": pagination.page_size,
            "total": await conn.fetchval("SELECT COUNT(*) FROM ...")
        }
    }
```

#### 2.5 Add CDN for Static Assets
- Configure Vercel to use CDN
- Move large images to Supabase Storage with CDN
- Implement image optimization (WebP, responsive sizes)

### Priority 3: Reliability & Resilience

#### 3.1 Implement Health Checks
```python
# BACKEND/app/main.py
@app.get("/health")
async def health_check():
    try:
        async with app.state.db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(503, f"Unhealthy: {str(e)}")

@app.get("/health/ready")
async def readiness_check():
    # Check database, Redis, external services
    ...
```

#### 3.2 Add Retry Logic with Exponential Backoff
```python
# BACKEND/app/utils.py
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def fetch_with_retry(url: str, **kwargs):
    async with httpx.AsyncClient() as client:
        response = await client.get(url, **kwargs)
        response.raise_for_status()
        return response
```

#### 3.3 Implement Circuit Breaker
```python
# BACKEND/app/circuit_breaker.py
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
async def call_external_service():
    # External API call
    ...
```

#### 3.4 Add Graceful Shutdown
```python
# BACKEND/app/main.py
import signal

@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down...")
    # Stop accepting new requests
    # Wait for in-flight requests (with timeout)
    # Close database pool
    await app.state.db_pool.close()
    # Close Redis connections
    await redis_client.close()
```

#### 3.5 Implement Database Backup Strategy
- **Automated Backups**: Daily full backups, hourly incremental
- **Point-in-Time Recovery**: Enable WAL archiving
- **Backup Testing**: Regular restore tests
- **Offsite Storage**: Store backups in separate region

### Priority 4: Observability

#### 4.1 Structured Logging
```python
# BACKEND/app/logging_config.py
import logging
import json
from pythonjsonlogger import jsonlogger

logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)

logger = logging.getLogger()
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# Usage
logger.info("User logged in", extra={
    "user_id": user_id,
    "ip_address": request.client.host,
    "timestamp": datetime.utcnow().isoformat()
})
```

#### 4.2 Add Metrics Collection
```python
# BACKEND/app/metrics.py
from prometheus_client import Counter, Histogram, generate_latest

api_requests = Counter(
    'api_requests_total',
    'Total API requests',
    ['method', 'endpoint', 'status']
)

request_duration = Histogram(
    'api_request_duration_seconds',
    'API request duration',
    ['endpoint']
)

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time
    
    api_requests.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    request_duration.labels(endpoint=request.url.path).observe(duration)
    return response

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type="text/plain")
```

#### 4.3 Error Tracking (Sentry)
```python
# BACKEND/app/main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    integrations=[FastApiIntegration()],
    traces_sample_rate=0.1,
    environment=os.getenv("ENVIRONMENT", "production")
)
```

#### 4.4 Distributed Tracing
```python
# BACKEND/app/main.py
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

FastAPIInstrumentor.instrument_app(app)
```

### Priority 5: Payment System Completion

#### 5.1 Implement Payment Webhook Handler
```python
# BACKEND/app/routes/payments.py
from fastapi import Request, Header
import hmac
import hashlib

@app.post("/api/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(...)
):
    payload = await request.body()
    
    # Verify signature
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET")
    signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    if signature != x_razorpay_signature:
        raise HTTPException(401, "Invalid signature")
    
    data = await request.json()
    event = data["event"]
    
    if event == "payment.captured":
        payment_id = data["payload"]["payment"]["entity"]["id"]
        amount = data["payload"]["payment"]["entity"]["amount"]
        
        async with app.state.db_pool.acquire() as conn:
            await conn.execute(
                "SELECT process_payment_captured($1, $2, $3)",
                payment_id, payment_id, amount
            )
    
    return {"ok": True}
```

#### 5.2 Add Payment Idempotency
```python
# BACKEND/app/routes/payments.py
@app.post("/api/payments")
async def create_payment(payload: PaymentCreate, token = Depends(require_user)):
    idempotency_key = request.headers.get("Idempotency-Key")
    
    if idempotency_key:
        # Check if payment already exists
        existing = await conn.fetchrow(
            "SELECT id FROM payments WHERE idempotency_key = $1",
            idempotency_key
        )
        if existing:
            return {"ok": True, "payment_id": existing["id"]}
    
    # Create payment with idempotency_key
    ...
```

#### 5.3 Implement Payment Reconciliation
```python
# BACKEND/app/tasks/reconciliation.py
async def reconcile_payments():
    """Daily job to reconcile payments with provider"""
    async with app.state.db_pool.acquire() as conn:
        pending = await conn.fetch(
            "SELECT * FROM payments WHERE status = 'captured' AND payout_status = 'not_initiated'"
        )
        
        for payment in pending:
            # Check with Razorpay API
            razorpay_payment = razorpay_client.payment.fetch(payment.provider_payment_id)
            
            if razorpay_payment["status"] != payment.status:
                # Update status
                await conn.execute(
                    "UPDATE payments SET status = $1 WHERE id = $2",
                    razorpay_payment["status"], payment.id
                )
```

### Priority 6: Testing Infrastructure

#### 6.1 Unit Tests
```python
# BACKEND/tests/test_auth.py
import pytest
from app.auth import verify_and_decode_jwt

def test_verify_jwt_valid():
    token = create_test_jwt()
    payload = verify_and_decode_jwt(token)
    assert payload["sub"] == "test_user_id"

def test_verify_jwt_expired():
    token = create_expired_jwt()
    with pytest.raises(HTTPException):
        verify_and_decode_jwt(token)
```

#### 6.2 Integration Tests
```python
# BACKEND/tests/test_api.py
from fastapi.testclient import TestClient

def test_search_workers(client: TestClient, auth_token: str):
    response = client.get(
        "/api/search?lat=21.1458&lon=79.0882&radius=15000",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    assert "results" in response.json()
```

#### 6.3 End-to-End Tests
```python
# BACKEND/tests/test_e2e.py
async def test_job_workflow():
    # 1. Customer posts job
    job = await post_job(...)
    
    # 2. Worker places bid
    bid = await place_bid(job.id, ...)
    
    # 3. Customer hires worker
    await hire_worker(job.id, bid.id)
    
    # 4. Worker completes job
    await submit_proof(job.id, ...)
    
    # 5. Customer approves
    await approve_job(job.id)
    
    # Verify payment released
    payment = await get_payment(job.id)
    assert payment.status == "released"
```

#### 6.4 CI/CD Pipeline
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run tests
        run: pytest
      - name: Run linter
        run: flake8 .
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to production
        run: |
          # Deployment steps
```

### Priority 7: Frontend Improvements

#### 7.1 State Management (Zustand)
```javascript
// FRONTEND/src/stores/authStore.js
import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  logout: () => set({ user: null, profile: null }),
}));
```

#### 7.2 Error Boundaries
```javascript
// FRONTEND/src/components/ErrorBoundary.jsx
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught:', error, errorInfo);
    // Send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

#### 7.3 Remove Hardcoded Locations
```javascript
// FRONTEND/src/hooks/useGeolocation.js
export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (err) => {
        setError(err.message);
        // Fallback to IP-based location or user input
      }
    );
  }, []);

  return { coords, error };
}
```

#### 7.4 Implement Offline Support
```javascript
// FRONTEND/src/hooks/useOffline.js
export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

#### 7.5 Progressive Web App (PWA)
```javascript
// FRONTEND/vite.config.js
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kaargar',
        short_name: 'Kaargar',
        description: 'Blue-collar marketplace',
        theme_color: '#2563eb',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
});
```

### Priority 8: Data Management

#### 8.1 Implement Soft Deletes
```sql
-- Add deleted_at column to all tables
ALTER TABLE jobs ADD COLUMN deleted_at TIMESTAMPTZ;

-- Update delete operations
UPDATE jobs SET deleted_at = NOW() WHERE id = $1;

-- Filter deleted records in queries
SELECT * FROM jobs WHERE deleted_at IS NULL;
```

#### 8.2 Data Archival Strategy
```python
# BACKEND/app/tasks/archive.py
async def archive_old_data():
    """Archive data older than 2 years"""
    cutoff_date = datetime.utcnow() - timedelta(days=730)
    
    async with app.state.db_pool.acquire() as conn:
        # Move to archive table
        await conn.execute("""
            INSERT INTO jobs_archive
            SELECT * FROM jobs
            WHERE created_at < $1 AND status = 'completed'
        """, cutoff_date)
        
        # Delete from main table
        await conn.execute("""
            DELETE FROM jobs
            WHERE created_at < $1 AND status = 'completed'
        """, cutoff_date)
```

#### 8.3 Data Export (GDPR Compliance)
```python
# BACKEND/app/routes/data_export.py
@app.get("/api/me/export")
async def export_user_data(token = Depends(require_user)):
    uid = token.get("sub")
    
    async with app.state.db_pool.acquire() as conn:
        user_data = {
            "profile": await conn.fetchrow("SELECT * FROM users WHERE id = $1", uid),
            "jobs": await conn.fetch("SELECT * FROM jobs WHERE customer_id = $1 OR worker_id = $1", uid),
            "messages": await conn.fetch("SELECT * FROM messages WHERE sender_id = $1", uid),
      


