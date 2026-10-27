# AutoBid.vn

Nền tảng đấu giá trực tuyến gồm **Next.js web app** và **worker xử lý nền (BullMQ/Redis)**, dùng **MySQL làm nguồn sự thật** cho auction, bid, ví và settlement.

> [!CAUTION]
> **Trạng thái: NO-GO — chưa thể go-live (kiểm tra ngày 2026-10-28).**
>
> - Luồng đặt giá đang vi phạm khóa ngoại `balance_freezes.bid_id` → mọi bid thất bại trên schema chuẩn hiện tại.
> - Chưa có chức năng nạp tiền; ví mới tạo có số dư 0 nên không thể bid.
> - `npm audit --omit=dev` báo **1 critical + 9 high**; Next.js 16.2.9 cần nâng cấp.
> - Đường tiền (settlement/forfeit/admin mark-paid) chưa đủ an toàn để giao dịch thật.
> - Không xác minh được migration/integration test do DB cấu hình không truy cập được và thiếu Redis/Docker.
>
> Chi tiết, bằng chứng và cách khắc phục: [Mục 17 — Go-live audit](#17-go-live-audit-2026-10-28).

---

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Trạng thái kiểm chứng](#2-trạng-thái-kiểm-chứng)
3. [Tech stack](#3-tech-stack)
4. [Kiến trúc](#4-kiến-trúc)
5. [Cấu trúc repository](#5-cấu-trúc-repository)
6. [Yêu cầu môi trường](#6-yêu-cầu-môi-trường)
7. [Chạy local](#7-chạy-local)
8. [Biến môi trường](#8-biến-môi-trường)
9. [Database, migration và seed](#9-database-migration-và-seed)
10. [Chạy web, worker và cron](#10-chạy-web-worker-và-cron)
11. [Routes và API](#11-routes-và-api)
12. [Luồng nghiệp vụ](#12-luồng-nghiệp-vụ)
13. [Scripts](#13-scripts)
14. [Testing và CI](#14-testing-và-ci)
15. [Bảo mật](#15-bảo-mật)
16. [Triển khai](#16-triển-khai)
17. [Go-live audit (2026-10-28)](#17-go-live-audit-2026-10-28)
18. [Checklist trước go-live](#18-checklist-trước-go-live)
19. [Tài liệu tham khảo](#19-tài-liệu-tham-khảo)
20. [Vệ sinh repository](#20-vệ-sinh-repository)

---

## 1. Giới thiệu

AutoBid.vn phục vụ các luồng:

- Đăng ký, đăng nhập, xác minh email, đổi mật khẩu, quản lý phiên.
- Người bán tạo phiên đấu giá, upload ảnh, cấu hình bước giá và gia hạn tự động.
- Người mua đặt giá thủ công hoặc auto-bid; hệ thống khóa tiền cọc theo từng bid.
- Kết thúc phiên, chọn người thắng, thông báo, settlement và xử lý forfeit khi quá hạn thanh toán.
- Khu vực admin: duyệt phiên, người dùng, bid, thanh toán, notification, audit log, outbox.
- Hạ tầng nền: transactional outbox, BullMQ worker, Redis rate limit, health check, audit/security event.

Repository này là bản **MVP/demo đang được hardened**. Tài liệu này phản ánh code tại working tree ngày **2026-10-28**, không phải trạng thái của một bản release đã ký duyệt.

---

## 2. Trạng thái kiểm chứng

Các lệnh dưới đây được chạy tại `app/` trên Node `v26.1.0`, npm `11.13.0` (trừ các dòng ghi **CHƯA CHẠY** hoặc phân tích code):

| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| TypeScript | `npm run typecheck` | **PASS** |
| ESLint | `npm run lint` | **PASS** — 0 error, 41 warning |
| Unit/security test | `npm test` | **PASS** — 46/46 test, 4 suite |
| Production build | `npm run build` | **PASS** — Next.js 16.2.9, Prisma 6.19.3 |
| Dependency audit (prod) | `npm audit --omit=dev` | **FAIL** — 11 lỗ hổng (1 critical, 9 high, 1 moderate) |
| Dependency audit (all) | `npm audit --audit-level=high` | **FAIL** — 14 lỗ hổng (1 critical, 12 high, 1 moderate) |
| Prisma migration status | `npx prisma migrate status` | **FAIL** — `P1001`, DB cấu hình không truy cập được |
| Integration test | `npm run test:integration` | **CHƯA CHẠY** — thiếu MySQL `:3307`, Redis `:6380`, Docker |
| Docker build | `docker build --target web .` | **CHƯA CHẠY** — máy không có Docker; Dockerfile còn lỗi standalone (P1-1) |
| Đặt giá end-to-end | phân tích code + schema | **FAIL (dự kiến)** — lỗi FK, sau đó là thiếu số dư |

**Kết luận: NO-GO.** Các gate local đều pass, nhưng các luồng cốt lõi (bid, nạp tiền, settlement) chưa chạy đúng hoặc chưa đủ an toàn.

---

## 3. Tech stack

| Thành phần | Công nghệ |
|---|---|
| Web | Next.js `16.2.9` (App Router, Turbopack), React `19.2.4` |
| Ngôn ngữ | TypeScript 5 |
| UI | Tailwind CSS 4, Radix UI, shadcn-style components, lucide-react, sonner |
| ORM/DB | Prisma `6.19.3`, MySQL 8.4 |
| Auth | JWT trong cookie HttpOnly, session lưu DB (`AuthSession`), bcryptjs |
| Async | Redis 7.4, BullMQ 5, transactional outbox |
| Validation | Zod 4 |
| Email | Nodemailer (SMTP) |
| Test | Node test runner qua `tsx` |
| CI/CD | GitHub Actions, Docker multi-stage, Vercel (web only) |

---

## 4. Kiến trúc

```text
                         ┌──────────────────────────────┐
                         │          Browser             │
                         └──────────────┬───────────────┘
                                        │ HTTPS
                         ┌──────────────▼───────────────┐
                         │  Next.js web (App Router)    │
                         │  Server Actions + Route      │
                         │  Handlers                    │
                         └───────┬──────────────┬───────┘
                                 │              │
                    transaction  │              │ enqueue (side effects)
                                 ▼              ▼
                    ┌────────────────────┐  ┌─────────────────────┐
                    │ MySQL 8.4          │  │ Redis 7.4 / BullMQ  │
                    │ - profiles         │  │ - rate limit        │
                    │ - auctions/bids    │  │ - lockout           │
                    │ - wallets/freezes  │  │ - queues            │
                    │ - outbox_events    │  └──────────┬──────────┘
                    │ - audit/notify     │             │
                    └─────────┬──────────┘             │
                              │ outbox dispatcher      │ consume
                              ▼                        ▼
                    ┌────────────────────┐  ┌─────────────────────┐
                    │ Worker process     │──│ BullMQ workers      │
                    │ (tsx, BullMQ)      │  │ bid / notify /      │
                    │                    │  │ expiry / events /   │
                    │                    │  │ settlement (flag)   │
                    └────────────────────┘  └─────────────────────┘
```

Nguyên tắc chính:

- **MySQL là source of truth** cho tiền và trạng thái auction. Redis chỉ là hạ tầng queue/rate-limit/cache, không được coi là nguồn sự thật tài chính.
- Các thay đổi quan trọng (đóng auction, settlement request, notification request) được ghi **outbox** trong cùng transaction DB; worker dispatch outbox sang BullMQ.
- Web và worker là **hai process riêng**. Vercel chỉ chạy web; worker phải chạy trên VM/Docker.
- Mọi thao tác tiền dùng `BigInt` (đơn vị VND) và optimistic lock bằng cột `Wallet.version`.

---

## 5. Cấu trúc repository

```text
.
├─ app/                        # Next.js app (root khi chạy npm / deploy Vercel)
│  ├─ app/                     # App Router: pages + route handlers
│  │  ├─ admin/                # Khu vực quản trị
│  │  ├─ api/                  # health, session, SSE, cron finalize
│  │  ├─ auctions/             # danh sách, chi tiết, tạo phiên
│  │  ├─ auth/                 # login/register
│  │  └─ ...
│  ├─ src/
│  │  ├─ actions/              # Server Actions (auth, auction, admin, profile)
│  │  ├─ lib/                  # domain: auth, wallet, settlement, outbox, queue, RBAC
│  │  ├─ workers/              # BullMQ worker runtime + từng worker
│  │  ├─ components/           # UI components
│  │  └─ __tests__/            # unit, security, integration test
│  ├─ prisma/                  # schema.prisma + migrations + seed (canonical)
│  ├─ scripts/                 # start-server, verify-integration-env, probes
│  ├─ Dockerfile               # target: web, worker, verification-probe
│  ├─ vercel.json
│  └─ next.config.ts
├─ docs/                       # runbook, security baseline, migration, backup
├─ compose.local.yml           # MySQL + Redis + web + worker (local)
├─ compose.staging.yml         # staging stack
├─ .github/workflows/ci.yml    # CI gates
├─ prisma/                     # LEGACY — migration cũ, không dùng
├─ load/                       # k6 smoke profile
└─ temp_auction.ts             # LEGACY — bản sao cũ, không dùng
```

> **Quan trọng:** schema và migration chuẩn nằm ở `app/prisma/`. Thư mục `prisma/` ở root chỉ còn 3 migration cũ, không có `schema.prisma`; đừng chạy migrate với đường dẫn này.

---

## 6. Yêu cầu môi trường

- **Node.js 22.17.0** (version CI và Docker dùng; máy hiện tại 26.1.0 vẫn build/test được nhưng không parity CI).
- npm 10+.
- **MySQL 8.4**.
- **Redis 7.4** (có thể dùng Upstash/ElastiCache ở production; cần TLS nếu `rediss://`).
- Docker + Docker Compose nếu muốn chạy MySQL/Redis hoặc integration test.
- SMTP nếu cần gửi email xác minh.

---

## 7. Chạy local

### 7.1. Dựng MySQL + Redis bằng Docker

Từ root repository:

```bash
docker compose -f compose.local.yml up -d mysql redis
```

Compose map:

| Service | Port | Credential local |
|---|---|---|
| MySQL | `3306` | `autobid` / `local-only-password` |
| Redis | `6379` | password `local-only-password` |

> Nếu máy không có Docker, cài MySQL 8.4 và Redis 7.4 thủ công rồi cập nhật `DATABASE_URL`/`REDIS_URL`.

### 7.2. Cài app và migrate

```bash
cd app
npm ci
cp .env.example .env
npx prisma migrate deploy
```

Sau đó sửa `app/.env` tối thiểu các biến sau (xem [mục 8](#8-biến-môi-trường)):

```dotenv
DATABASE_URL="mysql://autobid:local-only-password@localhost:3306/autobid"
REDIS_URL="redis://:local-only-password@localhost:6379/0"
APP_ORIGIN="http://localhost:3000"
TRUSTED_PROXY_PROVIDER="none"
JWT_SECRET="<chuỗi random >= 32 ký tự>"
CRON_SECRET="<chuỗi random >= 32 ký tự>"
ADMIN_PROFILE_ID="<profile id của admin>"
```

> File `.env` hiện tại trong repo local **chưa đủ biến** (`REDIS_URL`, `APP_ORIGIN`, `TRUSTED_PROXY_PROVIDER`, `CRON_SECRET`, `ADMIN_PROFILE_ID` đang thiếu). Với `.env` đó, `/api/health/ready` trả 503 và worker không khởi động. Đây là file untracked, không commit.

### 7.3. Seed admin (tùy chọn)

Seed chỉ tạo **một tài khoản SUPER_ADMIN**, không tạo auction/ví/số dư demo. Bắt buộc `NODE_ENV != production` và `ALLOW_DEMO_SEED=true`.

Bash:

```bash
cd app
ALLOW_DEMO_SEED=true \
SEED_ADMIN_EMAIL="admin@example.test" \
SEED_ADMIN_PASSWORD="mot-mat-khau-du-12-ky-tu" \
npx prisma db seed
```

PowerShell:

```powershell
cd app
$env:ALLOW_DEMO_SEED="true"
$env:SEED_ADMIN_EMAIL="admin@example.test"
$env:SEED_ADMIN_PASSWORD="mot-mat-khau-du-12-ky-tu"
npx prisma db seed
```

Lấy `ADMIN_PROFILE_ID`:

```sql
SELECT id, email, role FROM profiles WHERE email = 'admin@example.test';
```

### 7.4. Chạy web

```bash
cd app
npm run dev
```

Mở `http://localhost:3000`.

### 7.5. Chạy worker (terminal khác)

```bash
cd app
npm run start:worker
```

Worker cần `ADMIN_PROFILE_ID` hợp lệ, `REDIS_URL`, `DATABASE_URL`, và `REAL_MONEY_PAYMENTS_ENABLED=false`. Mặc định `FINANCIAL_OPERATIONS_ENABLED=false` nên **settlement/forfeit worker không được tạo**; các queue còn lại vẫn chạy.

### 7.6. Chạy toàn bộ bằng Compose

`compose.local.yml` có service `web` và `worker`, dùng `env_file: ./app/.env` và override DB/Redis host. Tuy nhiên **target `web` hiện chưa build được** vì Dockerfile copy `.next/standalone` trong khi `next.config.ts` không bật `output: "standalone"` (xem P1-1). Vì vậy path này chưa dùng được cho đến khi sửa Dockerfile hoặc Next config.

---

## 8. Biến môi trường

Mẫu đầy đủ: `app/.env.example`. Các biến quan trọng:

| Biến | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|
| `DATABASE_URL` | Có | — | MySQL URL. Production nên dùng TLS do provider cấp. |
| `REDIS_URL` | Có | — | `redis://` hoặc `rediss://`. |
| `APP_ORIGIN` | Có (readiness) | fallback `NEXT_PUBLIC_APP_URL` | Origin canonical dùng cho CSRF/origin check. Thiếu → readiness 503. |
| `NEXT_PUBLIC_APP_URL` | Nên có | — | URL public cho redirect/link. |
| `TRUSTED_PROXY_PROVIDER` | Có | — | `none`, `vercel`, `cloudflare`, `nginx`. Sai → header proxy bị bỏ qua. |
| `JWT_SECRET` | Có | — | ≥ 32 ký tự, không chứa `change-this`/`example`/`replace-me`; production được validate chặt hơn. |
| `CRON_SECRET` | Có cho cron | — | ≥ 32 ký tự; dùng cho `POST /api/auctions/finalize`; production bắt buộc. |
| `CRON_ALLOWED_IPS` | Không | — | Danh sách IP optional, phân tách bằng dấu phẩy. |
| `ADMIN_PROFILE_ID` | Worker | — | Profile admin nhận phí sàn; settlement fail nếu thiếu/sai. |
| `JWT_EXPIRES_IN_SECONDS` | Không | `28800` | 8 giờ. |
| `SESSION_ABSOLUTE_TIMEOUT_SECONDS` | Không | `28800` | Range 900–86400. |
| `SESSION_IDLE_TIMEOUT_SECONDS` | Không | `1800` | Range 300–14400. |
| `RATE_LIMIT_FAILURE_MODE` | Không | `closed` | Production luôn fail-closed; chỉ `open` ở non-production. |
| `SOFT_DEPENDENCY_FAILURE_MODE` | Không | `open` | **Nên đặt `closed` ở production** để Redis/queue/worker lỗi làm readiness 503. |
| `REQUIRE_WORKER_HEARTBEAT` | Không | `false` | **Nên `true` ở production**; readiness kiểm tra heartbeat worker. |
| `REQUIRED_WORKER_NAME` | Không | `workers` | Khớp `WORKER_NAME` của worker. |
| `WORKER_NAME` | Không | `workers` | Tên instance ghi heartbeat. |
| `WORKER_HEARTBEAT_INTERVAL_MS` | Không | `10000` | |
| `WORKER_HEARTBEAT_TTL_SECONDS` | Không | `30` | |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | Không | `30000` | |
| `QUEUE_PREFIX` | Không | `autobid` | Phải giống nhau giữa web và worker. |
| `PLATFORM_FEE_PERCENT` | Không | `5` | Worker dùng khi settlement. |
| `FINANCIAL_OPERATIONS_ENABLED` | Không | `false` | `true` mới tạo settlement/forfeit worker. |
| `REAL_MONEY_PAYMENTS_ENABLED` | Không | `false` | Schema chỉ chấp nhận literal `false`; đặt `true` sẽ fail validation. |
| `APP_VERSION` | Không | `development` | Ghi vào health/log. |
| `APP_ENV` | Không | — | Chỉ ảnh hưởng Prisma log/security event; `NODE_ENV` mới quyết định production guard. |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Không | — | Cần nếu muốn gửi email xác minh. |
| `SECURITY_ALERT_WEBHOOK_URL/BEARER` | Không | — | Nhận security event; không commit giá trị thật. |

Các nhóm outbox có default an toàn trong `.env.example`: `OUTBOX_BATCH_SIZE=20`, `OUTBOX_POLL_INTERVAL_MS=1000`, `OUTBOX_LOCK_TIMEOUT_MS=30000`, `OUTBOX_MAX_ATTEMPTS=8`, `OUTBOX_BASE_BACKOFF_MS=1000`, `OUTBOX_PUBLISH_TIMEOUT_MS=5000`.

> **Lưu ý production:** `SOFT_DEPENDENCY_FAILURE_MODE` không nằm trong `.env.example`; `REQUIRE_WORKER_HEARTBEAT` có nhưng đang để `false`. Nếu để mặc định (`open`, `false`), readiness có thể trả 200 trong khi Redis/worker đã chết.

---

## 9. Database, migration và seed

### 9.1. Schema

Canonical: `app/prisma/schema.prisma` — 14 model:

`Profile`, `AuthSession`, `Wallet`, `WalletTransaction`, `BalanceFreeze`, `Auction`, `AuctionImage`, `Bid`, `Watchlist`, `Notification`, `AuditLog`, `EmailVerificationToken`, `UserPreference`, `OutboxEvent`.

Quan hệ chính:

- `Profile 1—1 Wallet`; `Wallet 1—n WalletTransaction`, `Wallet 1—n BalanceFreeze`.
- `Auction 1—n Bid`, `Auction 1—n AuctionImage`, `Auction 1—n BalanceFreeze`.
- `BalanceFreeze.bidId` có FK tới `Bid.id` (đây là nguồn gốc P0-1).
- `Bid.idempotencyKey` unique toàn cục.
- `OutboxEvent` có unique `idempotencyKey`, trạng thái `PENDING/PROCESSING/PROCESSED/DEAD_LETTER`.

### 9.2. Migration

8 migration trong `app/prisma/migrations/`:

```text
20260707090000_init_mysql
20260707102000_add_session_version
20260707143000_expand_user_roles
20260709154157_add_pay_by_deadline
20260709154337_add_pay_by_deadline_field
20260721090000_add_transactional_outbox
20260721110000_add_bid_idempotency_key
20260721130000_auth_session_hardening
```

Lệnh:

```bash
cd app
npx prisma validate
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy     # production/release job
npx prisma migrate dev        # chỉ local, khi phát triển schema
```

Không chạy `migrate deploy` từ mọi replica. Chạy một lần từ release job có kiểm soát (xem `docs/OPERATIONS.md`).

### 9.3. Seed

`app/prisma/seed.mjs` chỉ tạo bootstrap admin:

- Chặn nếu `NODE_ENV=production` hoặc `ALLOW_DEMO_SEED != "true"`.
- Yêu cầu `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` ≥ 12 ký tự.
- Tạo `SUPER_ADMIN`, `emailVerified=true`, `mustChangePassword=true`.
- Nếu email đã tồn tại: không đổi credential/role.

Không có seed auction, bid, wallet hoặc số dư demo.

---

## 10. Chạy web, worker và cron

### 10.1. Web

```bash
cd app
npm run dev        # development
npm run build      # production build
npm start          # chạy .next/standalone nếu có, fallback next start
```

`npm start` dùng `app/scripts/start-server.js`:

1. Nếu có `server.js` ở root app → chạy nó.
2. Nếu có `.next/standalone/server.js` + static/public → chạy standalone.
3. Nếu không → chạy `next start`.

### 10.2. Worker

```bash
cd app
npm run start:worker
```

Worker runtime (`app/src/workers/index.ts`):

- Validate env bằng `validateWorkerEnv()`.
- Ping MySQL và Redis trước khi start.
- Đăng ký worker: `bid-side-effects`, `notifications`, `auction-expiry`, `auction-events`; thêm `settlement` nếu `FINANCIAL_OPERATIONS_ENABLED=true`.
- Chạy outbox dispatcher.
- Ghi heartbeat lên Redis (`WORKER_NAME`, TTL).
- Graceful shutdown theo `SIGTERM`/`SIGINT`, timeout `WORKER_SHUTDOWN_TIMEOUT_MS`.
- Reconciliation timer chỉ chạy khi financial flag bật (`RECONCILIATION_INTERVAL_MS`, mặc định 24h).

### 10.3. Health

| Endpoint | Ý nghĩa |
|---|---|
| `GET /api/health/live` | Process còn sống; dùng cho container liveness. |
| `GET /api/health/ready` | DB + Redis + queue + worker (theo cấu hình); dùng cho readiness/load balancer. |

Readiness hiện có **DB là hard dependency**, còn Redis/queue/worker là **soft dependency** mặc định (`SOFT_DEPENDENCY_FAILURE_MODE=open`). Vì vậy endpoint có thể trả 200 dù worker/Redis chết. Production nên đặt `SOFT_DEPENDENCY_FAILURE_MODE=closed` và `REQUIRE_WORKER_HEARTBEAT=true`.

### 10.4. Cron finalize

```bash
curl -X POST "https://your-domain/api/auctions/finalize" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- Chỉ `POST`; `GET` trả 405.
- Nếu `CRON_ALLOWED_IPS` được set, IP phải khớp (theo `TRUSTED_PROXY_PROVIDER`).
- Endpoint gọi `finalizeExpiredAuctions()` để đóng các phiên đến hạn.
- Trên Vercel, `vercel.json` **chưa cấu hình `crons`**; cần thêm Vercel Cron hoặc scheduler ngoài.

---

## 11. Routes và API

### 11.1. Pages

| Route | Mô tả |
|---|---|
| `/` | Trang chủ |
| `/auctions` | Danh sách phiên |
| `/auctions/[id]` | Chi tiết phiên + đặt giá + SSE realtime |
| `/auctions/new` | Tạo phiên (seller/admin) |
| `/products` | Danh mục sản phẩm |
| `/inventory` | Kho của người bán |
| `/auth/login`, `/auth/register` | Đăng nhập/đăng ký |
| `/verify-email` | Xác minh email |
| `/change-password` | Đổi mật khẩu |
| `/profile` | Hồ sơ cá nhân |
| `/help` | Trợ giúp |
| `/admin` | Dashboard |
| `/admin/auctions` | Quản lý phiên |
| `/admin/bids` | Quản lý bid |
| `/admin/users` | Quản lý người dùng |
| `/admin/payments` | Thanh toán/settlement |
| `/admin/notifications` | Notification |
| `/admin/audit-logs` | Audit log |
| `/admin/settings` | Cấu hình |

### 11.2. API

| Method | Route | Bảo vệ |
|---|---|---|
| `GET` | `/api/health/live` | Public |
| `GET` | `/api/health/ready` | Public (nhưng trả 503 nếu dependency lỗi theo cấu hình) |
| `GET` | `/api/auth/session` | Cookie session |
| `GET` | `/api/auctions/[id]/stream` | Theo quyền xem auction; SSE |
| `POST` | `/api/auctions/finalize` | `Authorization: Bearer <CRON_SECRET>` (+ IP nếu cấu hình) |

---

## 12. Luồng nghiệp vụ

### 12.1. Auth và session

- Mật khẩu hash bằng bcrypt cost 12.
- JWT ký bằng `JWT_SECRET`, đặt trong cookie `auth-token` (`HttpOnly`, `SameSite=Lax`, `Secure` ở production).
- Token session lưu DB dưới dạng hash một chiều (`AuthSession.tokenHash`), có `expiresAt`, `revokedAt`, `lastSeenAt`.
- Idle timeout mặc định 30 phút; absolute timeout 8 giờ.
- Lockout sau 5 lần đăng nhập sai, khóa 15 phút (Redis).
- RBAC 7 role: `USER`, `SELLER`, `SUPPORT`, `MODERATOR`, `FINANCE`, `ADMIN`, `SUPER_ADMIN`.

### 12.2. Vòng đời auction

```text
PENDING ──(đến startsAt)──► ACTIVE ──(đến endsAt)──► COMPLETED
                                  │
                                  └──(admin cancel)──► CANCELLED
```

- `refreshAuctionStatus()` dùng `SELECT ... FOR UPDATE` trên row auction.
- Khi hết giờ: set `COMPLETED`, chọn bid cao nhất, set bid thắng `WON`, các bid khác `LOST`, tạo outbox `AUCTION_CLOSED`, `SETTLEMENT_REQUESTED`, notification.
- Auto-extension: nếu có bid trong cửa sổ cuối, gia hạn tối đa `maxExtensions` lần (mặc định 3).
- `payByDeadline` có cột trong schema nhưng **chưa được set khi kết thúc** (P0-6).

### 12.3. Đặt giá

`placeBid` (`app/src/actions/auction.ts`) chạy trong transaction:

1. `SELECT ... FOR UPDATE` auction.
2. Refresh trạng thái, kiểm tra ACTIVE, không phải seller, giá ≥ `currentPrice + bidStep`, `expectedCurrentPrice` khớp UI.
3. `freezeBalance()` khóa tiền cọc.
4. Unfreeze người giữ giá trước.
5. Đánh dấu bid cũ `LOST`, tạo bid mới `ACTIVE`, update `currentPrice`/`winnerId`.
6. Ghi audit log, enqueue side effects.

Bước 3 hiện ghi `bidId="pending"` trước khi bid tồn tại → vi phạm FK (P0-1). Ngoài ra ví mới có balance 0 → `INSUFFICIENT_BALANCE` (P0-2).

### 12.4. Ví và settlement

Trạng thái freeze: `ACTIVE → RELEASED` (bị outbid/hủy) hoặc `ACTIVE → SETTLED` (thắng) hoặc `ACTIVE → FORFEITED` (quá hạn).

- `freezeBalance`: tăng `totalFrozen`, tạo `BID_FREEZE`.
- `unfreezeBalance` / `unfreezeAllForAuction`: giảm `totalFrozen`, tạo `BID_UNFREEZE`.
- `settleFreeze`: giảm `totalFrozen`, set freeze `SETTLED`, tạo `SETTLEMENT_DEBIT`.
- `transferBalance`: trừ balance người mua, cộng balance seller/admin, tạo 2 transaction.
- `forfeitFreeze`: giảm `totalFrozen`, set `FORFEITED`, tạo `PENALTY` — nhưng **không trừ balance/chuyển tiền** (P0-6).

Settlement được gọi bởi worker khi `FINANCIAL_OPERATIONS_ENABLED=true`; nếu flag false, settlement/forfeit worker không được tạo và job có thể nằm chờ trong queue.

### 12.5. Transactional outbox và worker

- Web ghi `OutboxEvent` trong cùng transaction với thay đổi nghiệp vụ.
- Worker `createOutboxDispatcher()` poll `PENDING`, set `PROCESSING`, publish BullMQ với job id deterministic, rồi `PROCESSED`.
- Lỗi: retry với exponential backoff; quá `OUTBOX_MAX_ATTEMPTS` → `DEAD_LETTER` + security event.
- Job idempotency: `Bid.idempotencyKey`, `OutboxEvent.idempotencyKey`, BullMQ `jobId`.
- Queue: `bid-side-effects`, `notifications`, `auction-expiry`, `auction-events`, `settlement`.

---

## 13. Scripts

Chạy trong `app/`:

| Script | Lệnh | Mô tả |
|---|---|---|
| Dev | `npm run dev` | Next dev server |
| Build | `npm run build` | `prisma generate` + `next build` |
| Start | `npm start` | Chạy standalone/next start qua `scripts/start-server.js` |
| Worker | `npm run start:worker` | BullMQ worker runtime |
| Lint | `npm run lint` | ESLint toàn bộ |
| Typecheck | `npm run typecheck` | `tsc --noEmit` |
| Unit/security | `npm test` | 46 test |
| Security-only | `npm run test:security` | Security test suite |
| Integration | `npm run test:integration` | Yêu cầu DB/Redis test riêng |
| All | `npm run test:all` | lint + typecheck + test + security + integration + build |
| Prisma validate | `npm run prisma:validate` | Validate schema |
| Prisma generate | `npm run prisma:generate` | Generate client |
| Seed | `npx prisma db seed` | Bootstrap admin |

---

## 14. Testing và CI

### 14.1. Test local

```bash
cd app
npm test
npm run test:security
```

Kết quả hiện tại: **46/46 pass**, gồm:

- RBAC/role ranking.
- Password/identity validation.
- Bid idempotency key bounds.
- Same-origin/proxy header policy.
- Session hash, lockout, idle/absolute expiry.
- Seed guard, CSP, cron POST-only, real-money fail-closed.
- Outbox/queue/heartbeat contract.

### 14.2. Integration test

```bash
cd app
npm run test:integration
```

Yêu cầu:

- `TEST_DATABASE_URL` trỏ database có tên kết thúc `_test` (mặc định `mysql://...:3307/auction_system_test`).
- `TEST_REDIS_URL` trỏ Redis test riêng (mặc định `redis://localhost:6380/15`).
- MySQL/Redis disposable; script `scripts/verify-integration-env.mjs` sẽ chặn nếu cấu hình không an toàn.
- Có thể dựng bằng `docker-compose.integration.yml` / `docker-compose.verification.yml`.

Trên máy audit: **không chạy được** vì MySQL `:3307` và Redis `:6380` không mở, Docker không có.

### 14.3. CI

`.github/workflows/ci.yml` chạy trên GitHub Actions với MySQL 8.4 + Redis 7.4:

1. Gitleaks full history.
2. `npm ci`.
3. Prisma validate/generate/migrate deploy/status.
4. Typecheck, lint, unit test, security test, integration test, build.
5. `npm audit --omit=dev --audit-level=high` và `npm audit --audit-level=high`.
6. Chặn tracked `.env` (trừ `.env.example`).
7. Validate Compose local/staging.
8. Build Docker `web` + `worker`.

**Hiện trạng:** CI sẽ đỏ ở bước `npm audit` do các lỗ hổng P0-3. Bước Docker build cũng có nguy cơ fail vì thiếu standalone (P1-1). Gitleaks có thể fail nếu lịch sử còn credential chưa rotate (P1-7).

### 14.4. Khoảng trống test

- Không có E2E/integration test cho `placeBid`, `freezeBalance`, `settleAuction`, `forfeitFreeze`.
- Vì vậy 46 unit test pass nhưng không phát hiện lỗi FK và lỗi thiếu số dư.
- Cần thêm test DB thật cho: bid thành công, bid thiếu tiền, outbid/unfreeze, kết thúc + settlement, forfeit, retry/idempotency.

---

## 15. Bảo mật

### 15.1. Đã có

- JWT HttpOnly cookie, session hash trong DB, idle/absolute timeout, revoke.
- Lockout đăng nhập sai, rate limit Redis fail-closed.
- RBAC + permission checks ở server action/route; admin area guard.
- CSRF same-origin check (`assertSameOrigin`) + cookie `SameSite=Lax`.
- Zod validation cho input; giới hạn độ dài payload.
- Security headers: CSP (không `unsafe-eval` ở production), HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy.
- Audit log + security event; webhook cảnh báo optional.
- Transaction + row lock cho auction/bid; optimistic lock cho wallet.
- Outbox + BullMQ job idempotency.
- Financial flags fail-closed; `REAL_MONEY_PAYMENTS_ENABLED` chỉ nhận `false`.
- Không có `.env` tracked; CI có gitleaks và kiểm tra tracked env file.

### 15.2. Điểm cần lưu ý

- `assertSameOrigin()` **bỏ qua kiểm tra nếu cả `Origin` và `Referer` đều vắng** (`app/src/lib/security-request.ts:56-62`). `SameSite=Lax` giảm rủi ro nhưng không thay thế kiểm tra server-side; nên reject request thiếu cả hai header cho mutation.
- Readiness fail-open với Redis/queue/worker (P1-2).
- Queue enqueue lỗi chỉ `console.error`, không retry/outbox (P1-3).
- Outbox claim dùng `updateMany` theo batch, không có lease token theo từng row (P1-4).
- Ledger `SETTLEMENT_DEBIT` ghi `balanceBefore == balanceAfter`; debit thật nằm ở `transferBalance` (P1-5).
- `VERCEL_DEPLOY.md` chứa host Aiven và địa chỉ Gmail trông như thật; cần thay bằng placeholder và rotate nếu đã dùng thật (P1-8).
- Báo cáo `docs/PRODUCTION_SECURITY_VERIFICATION_REPORT.md` (2026-07-21) vẫn **NO-GO** vì credential rotation chưa có bằng chứng (P1-7).

---

## 16. Triển khai

### 16.1. Docker

Dockerfile có 3 target: `web`, `worker`, `verification-probe`.

```bash
cd app
docker build --target web -t autobid-web .
docker build --target worker -t autobid-worker .
```

> **Lưu ý:** target `web` copy `.next/standalone`, nhưng `next.config.ts` chưa bật `output: "standalone"`. Build hiện tại không tạo `.next/standalone`, nên Docker build web sẽ fail. Cần thêm:
>
> ```ts
> const nextConfig: NextConfig = {
>   output: "standalone",
>   // ...
> };
> ```
>
> hoặc sửa Dockerfile để copy toàn bộ `.next` + `node_modules` và chạy `next start`.

Worker image chạy `tsx src/workers/index.ts`, dùng `prod-deps` (không có devDependencies). `tsx` nằm trong dependencies nên worker chạy được.

### 16.2. Staging Compose

```bash
MYSQL_DATABASE=... \
MYSQL_USER=... \
MYSQL_PASSWORD=... \
MYSQL_ROOT_PASSWORD=... \
REDIS_PASSWORD=... \
APP_IMAGE=autobid-web:staging \
WORKER_IMAGE=autobid-worker:staging \
STAGING_ENV_FILE=./app/.env.staging \
docker compose -f compose.staging.yml up -d
```

- Web command: `node server.js` (standalone). Phụ thuộc P1-1.
- Worker luôn được set `FINANCIAL_OPERATIONS_ENABLED=false`, `REAL_MONEY_PAYMENTS_ENABLED=false` trong compose staging.

### 16.3. Vercel (web only)

1. Import repo, **Root Directory = `app`**.
2. Dùng `app/vercel.json` (build command `prisma generate && next build`).
3. Set env: `DATABASE_URL`, `REDIS_URL` (Upstash `rediss://`), `JWT_SECRET`, `CRON_SECRET`, `APP_ORIGIN`, `NEXT_PUBLIC_APP_URL`, `TRUSTED_PROXY_PROVIDER=vercel`, `ADMIN_PROFILE_ID`, `RATE_LIMIT_FAILURE_MODE=closed`, `FINANCIAL_OPERATIONS_ENABLED=false`, `REAL_MONEY_PAYMENTS_ENABLED=false`.
4. Chạy `prisma migrate deploy` từ release job, không chạy trong mỗi function.
5. Worker chạy riêng trên VPS/Docker, kết nối cùng MySQL/Redis.
6. Thêm scheduler gọi `POST /api/auctions/finalize` (Vercel Cron hoặc cron ngoài). `vercel.json` hiện chưa có `crons`.

`VERCEL_DEPLOY.md` là hướng dẫn cũ; có endpoint `/api/health` không còn tồn tại (đúng là `/api/health/live` và `/api/health/ready`) và chứa giá trị cần thay bằng placeholder.

### 16.4. Thứ tự release đề xuất

1. CI xanh (gồm audit, integration, Docker build).
2. Backup DB; chạy `prisma migrate status`; apply migration một lần.
3. Deploy worker trước, xác nhận heartbeat.
4. Deploy web, kiểm tra `/api/health/live` + `/api/health/ready`.
5. Chạy smoke test: đăng nhập, tạo auction, bid, kết thúc, kiểm tra outbox/queue.
6. Chỉ bật financial worker sau khi finance review pass.

---

## 17. Go-live audit (2026-10-28)

### 17.1. Kết luận

**NO-GO.** Không nên mở cho người dùng thật hoặc xử lý tiền thật ở trạng thái hiện tại. Lần audit này chỉ đọc code và chạy các lệnh kiểm chứng; **không sửa source hay dependency**.

Lý do ngắn gọn:

- Tính năng cốt lõi **đặt giá không chạy** trên schema chuẩn.
- Không có đường **nạp tiền**, nên không thể có số dư để bid.
- Có **lỗ hổng critical** trong dependency production.
- Đường tiền có **admin bypass ledger**, forfeit sai, và thiếu ràng buộc/idempotency.
- Chưa chứng minh được migration/integration trên hạ tầng thật.

Nếu mục tiêu chỉ là **demo nội bộ không dùng tiền**, vẫn phải sửa P0-1 và P0-2 (hoặc ẩn hoàn toàn tính năng bid/ví), đồng thời tắt financial worker.

### 17.2. P0 — blocker bắt buộc sửa

#### P0-1. Mọi bid vi phạm FK `balance_freezes.bid_id`

- `freezeBalance()` ghi `balance_freezes.bid_id = "pending"` (`app/src/lib/wallet.ts:87-96`) trước khi bid được tạo (`app/src/actions/auction.ts:500-507`; auto-bid `:599-606`).
- Migration tạo FK `balance_freezes_bid_id_fkey` trỏ tới `bids(id)` (`app/prisma/migrations/20260709154157_add_pay_by_deadline/migration.sql:77`).
- `"pending"` không tồn tại trong `bids.id` → MySQL lỗi **1452**; transaction rollback; bid không được tạo. Code chỉ update sang id thật sau khi tạo bid (`auction.ts:561-564`), nhưng insert freeze đã fail trước đó.
- **Ảnh hưởng:** toàn bộ đấu giá thủ công và auto-bid không dùng được.
- **Sửa:** tạo freeze với `bidId = null`, tạo bid, rồi update freeze trong cùng transaction; hoặc tạo bid trước rồi freeze. Thêm integration test MySQL thật.

#### P0-2. Không có chức năng nạp tiền

- `depositBalance()` / `withdrawBalance()` chỉ tồn tại trong `app/src/lib/wallet.ts:407` và `:434`; không có server action, page, route hay admin action nào gọi.
- `ensureWallet()` tạo ví với `balance = 0`; `freezeBalance()` chặn nếu `balance - totalFrozen < amount` (`wallet.ts:69-73`).
- Seed chỉ tạo admin, không tạo ví/số dư (`app/prisma/seed.mjs`).
- **Ảnh hưởng:** user mới luôn nhận `INSUFFICIENT_BALANCE`; ngay cả khi P0-1 được sửa, không ai bid được.
- **Sửa:** thiết kế luồng nạp tiền có ledger + audit (chuyển khoản + admin duyệt, hoặc payment provider), hoặc tắt hoàn toàn ví/bid trong bản demo.

#### P0-3. Dependency production có critical/high vulnerability

- `npm audit --omit=dev`: **11 lỗ hổng** (1 critical, 9 high, 1 moderate).
- Next.js `16.2.9` dính critical RCE/SSRF/DoS; audit đề xuất nâng lên `16.4.3`.
- High khác: `nodemailer`, `zod` (< 4.6.6), `prisma`/`@prisma/config`, `postcss`, `sharp`, `nanoid`, `source-map-js`, `deepmerge-ts`.
- `npm audit --audit-level=high` (gồm dev): **14 lỗ hổng** (1 critical, 12 high, 1 moderate).
- CI chạy audit tại `.github/workflows/ci.yml:64-65` → pipeline hiện sẽ đỏ.
- **Sửa:** nâng Next lên bản đã vá (theo audit là 16.4.3), zod ≥ 4.6.6, nodemailer/prisma bản vá; chạy lại typecheck/lint/test/build/audit; kiểm tra breaking changes.

#### P0-4. Đường tiền chưa đủ an toàn để bật giao dịch thật

- `settleAuction()` đọc `paidAt` rồi mới update, không khóa row/conditional update (`app/src/lib/settlement.ts:44-49`, `:118-125`).
- `WalletTransaction` không có unique key nghiệp vụ; schema không có CHECK `balance >= 0`, `total_frozen >= 0` (`app/prisma/schema.prisma:163-195`).
- Settlement phụ thuộc `ADMIN_PROFILE_ID`; thiếu/sai → `SETTLEMENT_CONFIG_ERROR` (`settlement.ts:78-89`).
- Tài liệu nội bộ xác nhận chưa có payment provider/webhook và double-entry ledger đầy đủ (`docs/OPERATIONS.md:66-70`).
- **Ảnh hưởng:** không chứng minh được thanh toán đúng/đủ/không lặp khi retry, multi-replica hoặc restore.
- **Sửa:** row lock/conditional update + unique settlement key; DB constraints; ledger hai bút toán; finance review; provider webhook nếu thu tiền thật.

#### P0-5. Admin "mark paid" bỏ qua ledger

- `adminMarkAuctionPaid()` chỉ set `paidAt`/`paidById` (`app/src/actions/admin-auctions.ts`, hàm `adminMarkAuctionPaid`), không settle freeze, không chuyển tiền.
- Sau đó settlement worker đọc `paidAt != null` và trả `DUPLICATE_SETTLEMENT` (`settlement.ts:49`), trong khi freeze vẫn `ACTIVE`.
- **Ảnh hưởng:** auction hiển thị "đã thanh toán" nhưng tiền không dịch chuyển; reconciliation lệch.
- **Sửa:** bỏ action hoặc route qua `settleAuction`; nếu xác nhận thủ công, phải ghi ledger + đóng freeze + audit.

#### P0-6. Forfeit sai kế toán và gần như không bao giờ chạy

- `forfeitFreeze()` giảm `totalFrozen` nhưng giữ nguyên `balance`; không chuyển tiền cho seller/platform (`wallet.ts:247-276`). Khoản "phạt" trở lại khả dụng.
- `refreshAuctionStatus()` khi kết thúc không set `payByDeadline` (`app/src/lib/auction-lifecycle.ts:210-217`); cột này chỉ được select/clear ở `:424`, `:469`.
- Forfeit worker chỉ chọn auction có `payByDeadline <= now` (`app/src/workers/forfeit-worker.ts:31`) → không có row nào để xử lý.
- **Ảnh hưởng:** không thu được cọc/penalty; auction quá hạn thanh toán không được xử lý.
- **Sửa:** set deadline khi `COMPLETED`; định nghĩa penalty rõ (chuyển seller/platform hoặc giữ trong ví với ledger riêng); test end-to-end.

### 17.3. P1 — nên sửa trước khi mở traffic

| ID | Vấn đề | Bằng chứng | Ảnh hưởng / cách sửa |
|---|---|---|---|
| P1-1 | Docker web image không build được | `app/Dockerfile:27` copy `.next/standalone`; `app/next.config.ts` không có `output: "standalone"`; build không tạo thư mục này | Thêm `output: "standalone"` hoặc sửa Dockerfile; chạy `docker build` trong CI |
| P1-2 | Readiness fail-open | `app/src/lib/health.ts:14-16`, `:67-70`; `.env.example:39` để `REQUIRE_WORKER_HEARTBEAT=false` | Redis/queue/worker chết vẫn 200; đặt `SOFT_DEPENDENCY_FAILURE_MODE=closed`, `REQUIRE_WORKER_HEARTBEAT=true` |
| P1-3 | Enqueue lỗi bị nuốt | `app/src/lib/queue.ts:136-198` chỉ `console.error` | Mất notification/side effect; dùng outbox hoặc fail request |
| P1-4 | Outbox claim không có lease token | `app/src/lib/outbox.ts:129-137` updateMany theo batch, `lockedBy` ghi đè | Dispatcher chậm quá `OUTBOX_LOCK_TIMEOUT_MS` có thể bị steal → publish lặp; thêm lease token/`FOR UPDATE SKIP LOCKED` |
| P1-5 | Ledger settlement gây hiểu nhầm | `app/src/lib/wallet.ts:324-335` ghi `SETTLEMENT_DEBIT` với `balanceBefore == balanceAfter`; debit thật ở `transferBalance` | Thiết kế lại bút toán để ledger phản ánh đúng |
| P1-6 | Vercel thiếu cron, worker không chạy trên Vercel | `app/vercel.json` không có `crons`; `docs/OPERATIONS.md:3-10` | Auction không tự finalize; thêm Vercel Cron/scheduler ngoài + worker VPS |
| P1-7 | Credential rotation chưa có bằng chứng | `docs/PRODUCTION_SECURITY_VERIFICATION_REPORT.md:3`, `:49-51` | Rotate toàn bộ secret lịch sử; chạy gitleaks sạch |
| P1-8 | Tài liệu tracked chứa giá trị nhạy cảm | `VERCEL_DEPLOY.md:39`, `:57-59` (Aiven host, Gmail) | Thay placeholder; rotate nếu là giá trị thật; kiểm tra Git history |
| P1-9 | Git tree bẩn, thiếu provenance | 10 file tracked bị sửa + untracked `.agents/`, `.kilo/`, `.multiagent/`, `speces/`, `app/src/actions/admin-outbox.ts` | Commit/review hoặc loại khỏi release; build từ commit sạch |
| P1-10 | CSRF bỏ qua khi thiếu cả Origin/Referer | `app/src/lib/security-request.ts:56-62` | `SameSite=Lax` giảm rủi ro; vẫn nên reject mutation thiếu cả hai header |
| P1-11 | Tài liệu lỗi thời | `docs/OPERATIONS.md:70` vẫn mô tả outbox như việc phải làm, trong khi auction close đã dùng outbox; `KNOWN_ISSUES.md:63-78` nói chưa có Redis rate limit/queue/idempotency; `VERCEL_DEPLOY.md:100-105` sai endpoint health | Cập nhật hoặc archive để tránh vận hành sai |
| P1-12 | Thiếu test bid/wallet E2E | `app/src/__tests__/` chỉ có infrastructure/RBAC/security; không test `placeBid`/`settleAuction` | Thêm integration test DB thật cho các luồng tiền |
| P1-13 | Chưa xác minh migration trên DB đích | `npx prisma migrate status` → `P1001` | Kiểm tra network/credential; chạy `migrate status` trước release |

### 17.4. P2 — vệ sinh và cải thiện

- `temp_auction.ts` ở root là bản sao cũ của `app/src/actions/auction.ts` — xóa sau khi diff.
- `prisma/` ở root chứa 3 migration cũ, không có schema — archive/xóa để tránh migrate nhầm.
- `app/migrations/` chỉ còn thư mục rỗng — xóa.
- `node_modules/.vite/vitest/.../results.json` đang bị track — bỏ khỏi Git, thêm ignore.
- `app/README.md` bị mojibake — thay bằng README này hoặc sửa encoding.
- `TASKS.md` và `AUDIT_REPORT.md` mô tả stack Supabase/PostgreSQL và model cũ — không còn khớp code MySQL hiện tại.
- `AUTH_COOKIE_NAME`, `ADMIN_EMAIL` trong `.env`/`VERCEL_DEPLOY.md` không được code sử dụng (cookie name hardcode `auth-token`).
- `.env.example` thiếu `SOFT_DEPENDENCY_FAILURE_MODE`, `CRON_ALLOWED_IPS`, `RECONCILIATION_INTERVAL_MS`, `SETTLEMENT_WORKER_CONCURRENCY`.
- `JWT_EXPIRES_IN_SECONDS` trong `VERCEL_DEPLOY.md` là 7 ngày, trong khi code mặc định 8 giờ và session absolute tối đa 24 giờ — thống nhất lại.

### 17.5. Điều kiện tối thiểu để go-live

**Nếu go-live có tiền thật:**

1. Sửa P0-1 → P0-6; có integration test MySQL thật cho bid/settlement/forfeit.
2. Nâng dependency, `npm audit` sạch critical/high.
3. Finance review: ledger, idempotency, DB constraints, reconciliation, payment provider.
4. Docker/web + worker + cron chạy được trên staging; health check đóng.
5. Rotate credential, gitleaks sạch, release từ commit sạch.
6. Backup/restore rehearsal và load test theo `docs/OPERATIONS.md`.

**Nếu chỉ demo nội bộ, không dùng tiền:**

1. Sửa P0-1; ẩn hoặc tắt ví/bid nếu chưa có nạp tiền.
2. Tắt `FINANCIAL_OPERATIONS_ENABLED=false`, `REAL_MONEY_PAYMENTS_ENABLED=false`.
3. Vẫn nên nâng Next.js và sửa Docker web trước khi public.

---

## 18. Checklist trước go-live

### Bid/auction

- [ ] `balance_freezes.bid_id` cho phép NULL hoặc tạo bid trước khi freeze.
- [ ] Integration test: bid thành công, bid thiếu tiền, outbid, auto-bid, kết thúc phiên.
- [ ] `payByDeadline` được set khi `COMPLETED`; forfeit worker chạy đúng.
- [ ] Không còn đường nào set `paidAt` mà không qua ledger.

### Tiền và kế toán

- [ ] Có luồng nạp/rút tiền + audit + ledger.
- [ ] `settleAuction` idempotent, có row lock/conditional update, unique key.
- [ ] DB CHECK `balance >= 0`, `total_frozen >= 0`.
- [ ] Ledger phản ánh đúng từng bút toán; reconciliation chạy được.
- [ ] Finance sign-off; payment provider/webhook nếu thu tiền thật.

### Bảo mật và dependency

- [ ] `npm audit --omit=dev --audit-level=high` pass.
- [ ] Next.js/zod/nodemailer/prisma ở bản vá.
- [ ] Gitleaks full history sạch; credential cũ đã rotate.
- [ ] `VERCEL_DEPLOY.md` không còn giá trị thật.
- [ ] `SOFT_DEPENDENCY_FAILURE_MODE=closed`, `REQUIRE_WORKER_HEARTBEAT=true`.

### Hạ tầng

- [ ] `prisma migrate status` pass trên DB đích.
- [ ] Docker `web` + `worker` build được.
- [ ] Worker heartbeat ổn định; queue không tồn đọng.
- [ ] Cron finalize chạy đúng lịch.
- [ ] Backup/restore rehearsal pass; RPO/RTO được chấp nhận.
- [ ] Load test smoke pass.

### Release

- [ ] Tất cả thay đổi được commit/review; build từ commit sạch.
- [ ] CI xanh toàn bộ.
- [ ] Rollback plan và người trực vận hành đã xác nhận.
- [ ] README/tài liệu vận hành khớp code hiện tại.

---

## 19. Tài liệu tham khảo

| Tài liệu | Trạng thái |
|---|---|
| `docs/OPERATIONS.md` | Runbook vận hành; **dòng 70 đã lỗi thời** (vẫn mô tả outbox như việc phải làm). |
| `docs/PRODUCTION_SECURITY_VERIFICATION_REPORT.md` | NO-GO 2026-07-21; vẫn mở credential rotation. |
| `docs/MIGRATION_RUNBOOK.md` | Quy trình migration. |
| `docs/BACKUP_RESTORE_REHEARSAL.md` | Rehearsal backup/restore. |
| `docs/SECRET_ROTATION_RUNBOOK.md` | Rotate secret. |
| `docs/REDIS_PRODUCTION_HARDENING.md` | Redis production. |
| `docs/TRUSTED_PROXY_CONFIGURATION.md` | Proxy header. |
| `docs/SECURITY_ALERTING.md` | Security webhook. |
| `docs/SECURITY_BASELINE.md` | Baseline bảo mật. |
| `docs/RBAC_VERIFICATION.md` | RBAC. |
| `docs/REAL_MONEY_PAYMENT_ENABLEMENT.md` | Điều kiện bật tiền thật. |
| `AUDIT_REPORT.md` | Audit cũ 2026-08-05; **lỗi thời** (Supabase/Postgres, model cũ). |
| `KNOWN_ISSUES.md` | Một phần lỗi thời (nói chưa có Redis rate limit/queue/idempotency). |
| `VERCEL_DEPLOY.md` | Hướng dẫn cũ; endpoint health sai, chứa giá trị cần thay. |
| `app/README.md` | Legacy, mojibake; README root này thay thế. |

---

## 20. Vệ sinh repository

Trước khi release, nên xử lý:

```text
temp_auction.ts                  # xóa (bản sao cũ)
prisma/                          # archive/xóa (migration cũ, không có schema)
app/migrations/                  # xóa thư mục rỗng
node_modules/.vite/...           # bỏ khỏi Git
app/README.md                    # thay bằng README root hoặc sửa encoding
```

Đồng thời:

- Commit hoặc loại bỏ các thay đổi untracked: `.agents/`, `.kilo/`, `.multiagent/`, `speces/`, `app/src/actions/admin-outbox.ts`.
- Không commit `app/.env`; kiểm tra `git ls-files | grep -E '(^|/)\.env'` chỉ còn `.env.example`.
- Nếu `app/.env` hoặc `VERCEL_DEPLOY.md` từng chứa secret thật, rotate toàn bộ (DB, JWT, SMTP, Redis, cron) và kiểm tra Git history.

---

**Tóm lại:** code có nền tảng tốt (transaction, outbox, RBAC, health, CI), nhưng chưa thể go-live vì luồng bid hỏng, thiếu nạp tiền, dependency critical và đường tiền chưa an toàn. Sửa xong P0 và chạy lại toàn bộ gate trên hạ tầng thật mới nên xem xét lại quyết định.
