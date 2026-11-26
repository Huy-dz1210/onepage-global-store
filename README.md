# Onepage Global Store — bán hàng đa quốc gia + theo dõi dòng tiền PingPong / Payoneer / WorldFirst

Một app Next.js duy nhất gồm:

| Phần | URL | Mô tả |
|---|---|---|
| Cửa hàng | `/` | Thời trang/phụ kiện, giá niêm yết sẵn theo 7 thị trường (USD, EUR, GBP, JPY, AUD, CAD, SGD) |
| Đăng nhập / đăng ký | `/login`, `/register` | Session cookie httpOnly, mật khẩu băm scrypt; phân quyền CUSTOMER / ADMIN |
| Tài khoản khách | `/account` | Ví đa tiền tệ riêng cho từng khách, số dư từng ví, đơn hàng |
| Nạp ví | `/account/wallet/topup` | Nạp từ ví PingPong/Payoneer/WorldFirst, thẻ, chuyển khoản nội địa (tự cộng khi tiền về) |
| Sổ giao dịch ví | `/account/wallet` | Mọi giao dịch tiền vào/ra ví (nạp, thanh toán, hoàn), số dư sau mỗi giao dịch, lọc theo ví/loại/trạng thái/ngày |
| Checkout 1 trang | `/checkout` | **Trả bằng số dư ví** (tức thì, 0 phí), hoặc ví PingPong/Payoneer/WorldFirst, thẻ, chuyển khoản local |
| Đơn hàng | `/orders/[id]` | Timeline thanh toán đầy đủ + giao dịch thực nhận trong ví (gộp, phí, thực nhận, payload gốc), tự cập nhật |
| Quản trị tài chính | `/admin` (chỉ ADMIN) | Số dư theo ví/currency, dòng tiền 30 ngày, sổ giao dịch có lọc + xuất CSV, đơn hàng, khách hàng & ví, tài khoản & nhật ký sync |
| Import sao kê | `/admin/import` | Kéo thả CSV/Excel tải từ PingPong/Payoneer/WorldFirst **thật** → tự ghép cột (EN/中文/VI), xem trước, chống trùng |
| Mock provider API | `/api/mock/{pingpong,payoneer,worldfirst}/…` | "Tài khoản clone" để dev khi chưa có tài khoản thật |

**Tiền không bị đổi:** khách trả EUR → tiền vào ví EUR của merchant. FX chỉ xảy ra khi merchant chủ động đổi.

## Chạy nhanh

**Cần cài trước:** Node.js 22 LTS và PostgreSQL (user `postgres`, mật khẩu `postgres`, cổng 5432 – hoặc Docker: `docker compose up -d`).

**Windows:** bấm đúp `start-windows.bat`. File sẽ tự kiểm tra Postgres → cài thư viện (lần đầu) → tạo bảng + dữ liệu mẫu → chạy app → mở http://localhost:3000.

**Mac/Linux:** `./start-mac-linux.sh`

Hoặc chạy tay:

```bash
npm install
npm run setup      # tạo/cập nhật bảng (prisma db push) + dữ liệu mẫu – chạy lại nhiều lần không sao
npm run dev
```

* File `.env` đã có sẵn (giá trị demo). Đổi mật khẩu Postgres ở `DATABASE_URL` nếu bạn đặt khác `postgres`.
* Xóa sạch database demo làm lại từ đầu: `npm run db:reset`.
* Cập nhật bản mới: giải nén đè lên thư mục cũ (giữ `node_modules` và `.env`) rồi chạy lại `start-windows.bat`.

Sau ~15 giây scheduler chạy sync lần đầu (kéo 90 ngày lịch sử). Muốn demo "gần realtime": đặt `SYNC_INTERVAL_MINUTES=1` trong `.env`.

## Dữ liệu demo

**Tài khoản đăng nhập**

| Email | Mật khẩu | Ghi chú |
|---|---|---|
| `user1@onepage.demo` | `123456` | Có sẵn tiền trong ví USD/EUR/GBP + lịch sử giao dịch |
| `user2@onepage.demo` | `123456` | Ví trống – thử nạp tiền |
| `admin@onepage.demo` | `admin123` | Vào `/admin` |

**Tài khoản clone** (`src/lib/mock/accounts.ts` – thêm dòng để có thêm tài khoản):

| Provider | Credentials | Ví |
|---|---|---|
| PingPong | appId `pp_app_store01` / appSecret `pp_secret_store01` | USD EUR GBP JPY CAD AUD |
| Payoneer | clientId `payo_client_demo` / secret `payo_secret_demo` / program `100001` / payee `payee_100234` | USD EUR GBP CAD AUD |
| WorldFirst | clientId `wf_client_88001` / secret `wf_secret_88001` (ký HMAC từng request) | USD EUR GBP JPY CNY HKD SGD AUD CAD |

Mỗi tài khoản có ~850 giao dịch lịch sử 120 ngày (tiền về từ Amazon/Shopify…, rút về ngân hàng VN, trả NCC, thẻ, FX, phí, hoàn tiền), sinh **deterministic** và **liên tục phát sinh giao dịch mới theo thời gian thực**; giao dịch mới ở trạng thái PENDING rồi tự chuyển COMPLETED/FAILED để kiểm thử cập nhật trạng thái.

**Thanh toán test**

| Cách | Dữ liệu |
|---|---|
| Thẻ | `4242 4242 4242 4242` thành công • `4000 0000 0000 0002` bị từ chối • `4000 0000 0000 9995` không đủ tiền |
| Ví | email bất kỳ, OTP `123456` |
| Chuyển khoản | Trang đơn hàng có nút *Sandbox: giả lập khách chuyển đủ tiền* / *Chuyển thiếu 50%* |

Thẻ được định tuyến PingPong → WorldFirst → Payoneer: nếu provider không có ví cùng currency (vd. PingPong không có SGD) thì tự chuyển provider khác — vẫn không đổi tiền.

## Luồng dữ liệu

```
Checkout ──► Provider API (checkout) ──► ghi sổ provider ──► Webhook (HMAC) ──► /api/webhooks/[provider]
                                                                           ├─► cập nhật đơn (đối soát CK theo nội dung + số tiền)
                                                                           └─► syncAccount() ngay  ──► Transaction/Balance (Postgres)
Scheduler (mỗi SYNC_INTERVAL_MINUTES) ──► syncAll() ──► adapter từng provider ──► chuẩn hóa ──► upsert
```

* `src/lib/providers/*` – adapter cho từng provider: auth (OAuth/Bearer, Basic, HMAC), phân trang, chia cửa sổ thời gian theo giới hạn API, retry/backoff, chuẩn hóa (minor units, giờ +08:00, mapping loại/trạng thái).
* `src/lib/sync.ts` – incremental sync theo cursor + lookback 72h (bắt thay đổi trạng thái), idempotent nhờ `unique(accountId, externalId)`, ghi `SyncRun`.
* `src/instrumentation.ts` + `src/lib/scheduler.ts` – scheduler chạy trong process Next. Deploy nhiều instance/serverless: tắt `SYNC_SCHEDULER_ENABLED` và gọi `npm run sync` bằng cron hệ thống.
* Credentials lưu mã hóa AES-256-GCM (`ENCRYPTION_KEY`).
* `MOCK_FAILURE_RATE=0.1` → 10% request mock trả 503 để test retry.

## Dùng với tài khoản PingPong / Payoneer / WorldFirst thật (chưa có API)

1. `/admin/accounts` → *Kết nối tài khoản mới* → chọn provider, đặt tên, tick **"chỉ dùng Import sao kê"**.
2. Trên web của provider, xuất lịch sử giao dịch ra CSV/Excel.
3. `/admin/import` → chọn tài khoản → kéo thả file → kiểm tra ghép cột & xem trước → **Import**.
4. Import định kỳ (vd. mỗi ngày) – file chồng lấn thời gian không bị trùng: dùng mã giao dịch trong file, hoặc mã băm (ngày + số tiền + nội dung) nếu file không có mã. Nếu file có cột *số dư* thì số dư ví được cập nhật theo dòng mới nhất.

Bộ nhận diện cột đã thử với các mẫu sao kê giả lập; nếu file thật của bạn lệch, chỉnh ghép cột trên màn hình hoặc gửi 1 file mẫu (đã che số liệu) để thêm từ khóa vào `src/lib/import/normalize.ts`.

## Chuyển sang API thật

Format mock **mô phỏng** chứ không phải spec chính thức. Khi có tài khoản:

1. Liên hệ provider để được cấp API (thường cần là partner/doanh nghiệp: Payoneer có Partner API + sandbox; PingPong và WorldFirst cấp Open API cho đối tác/merchant đủ điều kiện). Nếu chưa được cấp API, phương án tạm là import file sao kê CSV.
2. Sửa field mapping trong `src/lib/providers/<provider>.ts` theo tài liệu thật (cấu trúc adapter giữ nguyên).
3. Vào `/admin/accounts` → *Kết nối tài khoản mới* với base URL + credentials thật; tắt tài khoản mock.
4. Đăng ký webhook URL `https://<domain>/api/webhooks/<provider>` và thay phần verify chữ ký theo spec provider.

> ⚠️ Trước khi deploy công khai: đổi mật khẩu/xóa tài khoản demo, đặt `ENCRYPTION_KEY`, `WEBHOOK_SECRET` mới (file `.env` kèm theo chỉ là giá trị demo), bật HTTPS. Tỷ giá USD tham chiếu ở `src/lib/fx.ts` là bảng tĩnh.

## Deploy lên Vercel

1. Import repo trên vercel.com/new.
2. Thêm tích hợp **Prisma Postgres** (Storage) với prefix `DATABASE` → Vercel tạo sẵn `DATABASE_URL`.
3. Deploy. Lệnh build trong `vercel.json` tự chạy `prisma db push` + seed dữ liệu demo.

Trên Vercel: auto-sync chạy bằng Vercel Cron (`/api/cron/sync`, gói Hobby: 1 lần/ngày); webhook vẫn cập nhật realtime. Đặt `CRON_SECRET` nếu muốn khóa endpoint cron.
