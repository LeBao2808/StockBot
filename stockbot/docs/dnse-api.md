# DNSE OpenAPI (Lightspeed V2) — ghi chú tích hợp

Nguồn: https://developers.dnse.com.vn (thêm `.md` vào cuối URL trang docs để lấy bản Markdown, ví dụ `/docs/dnse/get-positions.md`).
Entrade X là app giao dịch của DNSE — cùng tài khoản/tiểu khoản với API này.

Base URL: `https://openapi.dnse.com.vn`. Kiểm chứng ngày 2026-10-24 bằng request thật (chỉ GET).

## Xác thực (đã kiểm chứng)

Mỗi request gửi `x-api-key`, `Date` (RFC 1123, UTC, lệch tối đa ±1 phút), `X-Signature`, `version` (`DNSE_API_VERSION`, mặc định `2026-05-07`).

- Signing string: `(request-target): get {path}\ndate: {Date}\nnonce: {nonce}` — `path` không gồm query string, `nonce` là UUID4 hex 32 ký tự mới cho mỗi request.
- Chữ ký: HMAC-SHA256 bằng API Secret → Base64 → chỉ URL-encode `+ / =`.
- Header: `Signature keyId="{API_KEY}",algorithm="hmac-sha256",headers="(request-target) date",signature="{sig}",nonce="{nonce}"`.

Đã cài trong `getDnseJson` (`src/lib/dnse-market.ts`). Đặt lệnh cần thêm Trading Token (OTP, hiệu lực 8h) — **ngoài phạm vi**.

## Endpoint dùng trong dự án

| Mục đích | Endpoint | Trạng thái | Rate/giờ |
|---|---|---|---|
| Tiểu khoản | `GET /accounts` | ✅ kiểm chứng | 1.000 |
| Tiền | `GET /accounts/{accountNo}/balances` | ✅ kiểm chứng | 10.000 |
| Vị thế (giá vốn) | `GET /accounts/{accountNo}/positions?marketType=STOCK` | ✅ gọi được, tài khoản hiện **rỗng** | 10.000 |
| Nến lịch sử | `GET /price/ohlc?symbol&type&resolution&from&to` | ✅ kiểm chứng | 50.000 |
| Khớp gần nhất | `GET /price/{symbol}/trades/latest?boardId=G1` | ✅ kiểm chứng | 10.000 |
| Bid/ask gần nhất | `GET /price/{symbol}/quotes/latest` | 📄 theo docs, chưa gọi | 10.000 |

### `/accounts`
`{ name, custodyCode, investorId, accounts: [{ id, dealAccount, derivativeAccount, derivative: { status } }] }` — `id` là số tiểu khoản dùng cho các endpoint khác.

### `/accounts/{accountNo}/balances`
Đơn vị VND.
- `stock`: `totalCash, availableCash, withdrawableCash, totalDebt, secureAmount, orderSecured, depositInterest, depositFeeAmount, cashDividendReceiving`
- `derivative`: `remainSecure, usedSecure, pendingSecure, pendingDepositWithdraw, holdTaxAndFee, totalLoanDebt`
- `bond.totalValue`, `egg.totalValue`

### `/accounts/{accountNo}/positions?marketType=STOCK|DERIVATIVE`
`{ positions: [{ id, symbol, accountNo, status, side, loanPackageId, accumulateQuantity, tradeQuantity, closedQuantity, openQuantity, overNightQuantity, costPrice, marketPrice, breakEvenPrice, createdDate, modifiedDate }], pageIndex, pageSize, pageNumber, total }`
- `status`: OPEN | PENDING_CLOSE | CLOSED | ODD_LOT. `side`: NB (mua) | NS (bán).
- `costPrice` = giá vốn trung bình của khối lượng mở; `tradeQuantity` = KL được giao dịch (khả dụng).
- ⚠️ Chưa kiểm chứng đơn vị `costPrice`/`marketPrice` cho cổ phiếu (tài khoản không có vị thế). Ví dụ trong docs là phái sinh (điểm). Code xử lý: giá < 1.000 coi là nghìn VND và nhân 1.000.

### `/price/ohlc`
- `type`: STOCK | DERIVATIVE | INDEX — **bắt buộc trên thực tế** với cổ phiếu (thiếu → `400 {"code":"INVALID_BAR_TYPE"}`).
- `resolution`: `1, 3, 5, 15, 30, 1H, 1D, 1W`. `from`/`to`: Unix giây.
- Response dạng mảng song song: `{ t: [], o: [], h: [], l: [], c: [], v: [], nextTime }`. Giá cổ phiếu tính bằng **nghìn VND** (FPT ≈ 57); chỉ số tính bằng điểm. `nextTime ≠ 0` nghĩa là còn dữ liệu, cần gọi tiếp.
- Nến 1W có vẻ là giá đã điều chỉnh (FPT tuần cũ ≈ 90.96).

### `/price/{symbol}/trades/latest`
`{ trades: [{ marketId, boardId, symbol, matchPrice, matchQtty, side, avgPrice, totalVolumeTraded, highestPrice, lowestPrice, openPrice, time }] }` — giá nghìn VND, `time` theo giờ VN dạng `YYYY-MM-DD HH:mm:ss.SSS`.

## Realtime
DNSE đẩy giá qua WebSocket/MQTT (`/docs/guide/market-data/connect`). Vercel serverless không giữ kết nối lâu → dùng polling REST trước.

## Mẫu dữ liệu
`docs/dnse-samples/` — `positions-stock.json` là dữ liệu **giả** theo đúng schema (tài khoản thật đang rỗng); `ohlc-fpt-1d.json` là dạng thật.

## Biến môi trường mới (thêm vào `.env` / Vercel)

| Biến | Ý nghĩa |
|---|---|
| `DNSE_ACCOUNT_NO` | (tùy chọn) Chỉ đọc 1 tiểu khoản. |
| `DNSE_MOCK=1` | Dùng dữ liệu mẫu `docs/dnse-samples/` thay vì gọi tài khoản thật (tự bật khi thiếu API key). Tiện để xem giao diện khi tài khoản chưa có vị thế. |
| `STOCKMATE_DASHBOARD_PASSWORD` | Bật HTTP Basic auth cho toàn bộ web (trừ `/api/mcp`). **Bắt buộc trước khi deploy công khai**: trên Vercel, nếu thiếu biến này thì `/api/dnse/*` trả 403. |

## API nội bộ

- `GET /api/dnse/positions` → `{ source: "DNSE"|"MOCK", positions: [{ id, accountNo, symbol, status, quantity, availableQuantity, costPrice, marketPrice, breakEvenPrice, openedAt }], fetchedAt }` (giá VND)
- `GET /api/dnse/balances` → `{ source, accounts: [{ accountNo, totalCash, availableCash, withdrawableCash, totalDebt, orderSecured, cashDividendReceiving }], fetchedAt }`
- `GET /api/market/ohlc/{symbol}?resolution=1D&type=STOCK&from=&to=` → `{ candles: [{ time, open, high, low, close, volume }], currency }`
