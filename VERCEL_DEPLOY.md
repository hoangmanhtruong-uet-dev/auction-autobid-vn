# Hướng dẫn Deploy lên Vercel

Tài liệu này hướng dẫn từng bước deploy Next.js frontend lên Vercel.  
Workers (BullMQ/Redis) **vẫn chạy riêng** trên Docker/VPS và không liên quan đến hướng dẫn này.

---

## 1. Chuẩn bị: Tạo Upstash Redis

App dùng Redis cho rate limiting và caching. Trên Vercel (serverless) cần dùng **Upstash Redis** (hỗ trợ HTTP mode).

1. Truy cập [https://upstash.com](https://upstash.com) → Đăng ký / Đăng nhập
2. Tạo database mới: **Create Database**
   - Name: `autobid-prod`
   - Region: chọn gần nhất (Singapore / Tokyo)
   - Type: **Regional** (free tier)
3. Sau khi tạo xong, vào **Details** → copy:
   - `REDIS_URL` (dạng `rediss://default:xxxxx@xxxx.upstash.io:6380`)

---

## 2. Import Project lên Vercel

1. Truy cập [https://vercel.com/new](https://vercel.com/new)
2. Chọn **"Import Git Repository"** → chọn repo `web-dau-gia-tu-dong-ca-nha`
3. **Quan trọng**: Trong phần **"Configure Project"**:
   - **Root Directory**: `app` ← phải đặt đúng cái này
   - Framework Preset: Next.js (tự detect)
   - Build Command: để trống (dùng `vercel.json`)
   - Output Directory: để trống

---

## 3. Set Environment Variables

Trong phần **"Environment Variables"** khi import (hoặc sau trong Settings → Environment Variables):

```
DATABASE_URL=mysql://avnadmin:<password>@web-time-hoangmanhtruongk70uet-d2a7.e.aivencloud.com:22952/defaultdb?ssl-mode=REQUIRED

JWT_SECRET=<tạo random string ≥ 32 ký tự — KHÁC với local>
JWT_EXPIRES_IN_SECONDS=604800

NEXT_PUBLIC_APP_URL=https://<your-app-name>.vercel.app
APP_ENV=production

AUTH_COOKIE_NAME=auth-token

TRUSTED_PROXY_PROVIDER=vercel

CRON_SECRET=<tạo random string ≥ 32 ký tự>
ADMIN_PROFILE_ID=<profile ID admin từ database>
ADMIN_EMAIL=admin@autobid.vn

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=truongcri0101@gmail.com
SMTP_PASS=<Gmail App Password>
SMTP_FROM=truongcri0101@gmail.com

REDIS_URL=rediss://default:<token>@<host>.upstash.io:6380
REDIS_TLS_ENABLED=true
REDIS_MAX_RECONNECT_ATTEMPTS=3
RATE_LIMIT_FAILURE_MODE=closed

FINANCIAL_OPERATIONS_ENABLED=false
REAL_MONEY_PAYMENTS_ENABLED=false

REQUIRE_WORKER_HEARTBEAT=false
APP_VERSION=1.0.0
```

> **Tạo JWT_SECRET mạnh:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 4. Deploy

Nhấn **"Deploy"** và chờ Vercel build. Quá trình build sẽ:
1. `npm ci` — install dependencies
2. `prisma generate` — generate Prisma client
3. `next build` — build Next.js app

---

## 5. Sau khi Deploy

### Cập nhật NEXT_PUBLIC_APP_URL

Sau khi có URL Vercel thực tế (e.g. `https://autobid.vercel.app`):
1. Vào Vercel Dashboard → Settings → Environment Variables
2. Cập nhật `NEXT_PUBLIC_APP_URL` = URL thực tế
3. Redeploy (Deployments → "..." → Redeploy)

### Kiểm tra các endpoint

| Endpoint | Mục đích | Expected |
|---|---|---|
| `/` | Trang chủ | 200 OK |
| `/api/health` | Health check | 200 `{"status":"ok"}` |
| `/auth/login` | Đăng nhập | Render form |
| `/auctions` | Danh sách đấu giá | 200 OK |

### Xem logs

- Vercel Dashboard → **Functions** tab → xem real-time logs
- Kiểm tra không có lỗi `REDIS_URL`, `DATABASE_URL`, `JWT_SECRET`

---

## 6. Custom Domain (tuỳ chọn)

1. Vercel Dashboard → Settings → **Domains**
2. Thêm domain: e.g. `autobid.vn`
3. Cấu hình DNS theo hướng dẫn Vercel (CNAME hoặc A record)
4. Cập nhật `NEXT_PUBLIC_APP_URL` = `https://autobid.vn`
5. Redeploy

---

## Lưu ý: Workers

Workers (`src/workers/`) **không chạy trên Vercel** (serverless không support long-running process).  
Workers vẫn chạy trên Docker/VPS qua:

```bash
# Trên VPS/Docker
docker compose -f compose.staging.yml up workers -d
```

Workers kết nối **cùng** `DATABASE_URL` và `REDIS_URL` với app Vercel.

---

## Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `PrismaClientInitializationError` | `DATABASE_URL` sai hoặc thiếu | Kiểm tra env var trên Vercel |
| `Error: connect ECONNREFUSED redis` | `REDIS_URL` chưa set | Set Upstash REDIS_URL |
| `Error: Invalid JWT_SECRET` | `JWT_SECRET` quá ngắn | Tạo string ≥ 32 chars |
| Build fail: `prisma generate` | Prisma schema lỗi | Chạy `npm run build` local trước |
| `NEXT_PUBLIC_APP_URL` sai | URL redirect bị sai | Cập nhật sau khi có URL Vercel |
