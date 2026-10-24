# Kế hoạch: StockBot → bảng theo dõi giao dịch thật (DNSE / Entrade X)

Mục tiêu: xem biểu đồ nến từng mã, giá vốn và khối lượng **thật** từ tài khoản DNSE (Entrade X), lãi/lỗ realtime. Phạm vi hiện tại là **chỉ đọc** — không đặt/hủy lệnh.

## Quy tắc cho agent (đọc mỗi vòng loop)

1. Làm việc trên branch `feat/trading`. Commit sau mỗi task, **không push**, không merge vào `main`.
2. Mỗi vòng: lấy task `[ ]` đầu tiên chưa bị Blocked → làm → `npm run lint` và `npm run build` phải pass → commit → đổi thành `[x]` và ghi 1 dòng kết quả ngay dưới task.
3. Bị chặn (thiếu credential, DNSE từ chối, không rõ API) → ghi vào mục **Blocked** kèm lý do + điều cần người dùng làm, rồi chuyển task khác.
4. **Cấm**: gọi bất kỳ endpoint đặt/hủy/sửa lệnh, xin trading token/OTP, sửa hoặc in nội dung `.env*`, `git push`, xóa dữ liệu MongoDB.
5. Đây là Next.js 16 — đọc hướng dẫn trong `node_modules/next/dist/docs/` trước khi viết route/page mới (xem AGENTS.md).
6. Giữ phong cách code hiện có (`src/lib/dnse-market.ts`): thông báo lỗi tiếng Việt, parse phòng thủ (`asRecord`, `numeric`), không đoán field khi chưa kiểm chứng.
7. Gọi DNSE thật để kiểm tra là được (chỉ GET). Lưu mẫu response đã **ẩn số tài khoản/số tiền** vào `docs/dnse-samples/` để làm mock.
8. Hết task → ghi tóm tắt vào mục **Báo cáo** và dừng loop.

## Phase 0 — Tìm hiểu API

- [x] Đọc tài liệu Lightspeed API (https://hdsd.dnse.com.vn/san-pham-dich-vu/api-lightspeed) và ghi vào `docs/dnse-api.md`: endpoint danh sách deal/vị thế (giá vốn, khối lượng, khả dụng), endpoint nến OHLC lịch sử, endpoint giá realtime/topic MQTT, cách xác thực hiện tại (HMAC trong `dnse-market.ts`). Ghi rõ cái nào đã kiểm chứng bằng request thật, cái nào chưa.
  → Xong. Docs V2 ở developers.dnse.com.vn. Đã gọi thật: `/accounts`, `/balances`, `/positions` (tài khoản đang **không có vị thế** → dùng mock), `/price/ohlc` (cần `type=STOCK`). Mẫu ở `docs/dnse-samples/`.

## Phase 1 — Dọn cấu trúc

- [x] Tách `src/app/page.tsx` (~1500 dòng) thành component trong `src/components/` (types dùng chung → `src/lib/types.ts`). Không đổi giao diện/hành vi.
  → Xong. page.tsx còn ~100 dòng; state danh mục nằm trong `PortfolioProvider` (context) để các route sau dùng chung. Sửa luôn cảnh báo lint `set-state-in-effect`.
- [ ] Thêm layout điều hướng: Tổng quan, Danh mục, `/stock/[symbol]`.

## Phase 2 — Biểu đồ từng mã

- [ ] `src/lib/dnse-market.ts`: hàm `getDnseOhlc(symbol, resolution, from, to)` trả `{ time, open, high, low, close, volume }[]` (đơn vị VND).
- [ ] API route `GET /api/market/ohlc/[symbol]?resolution=1D&from=&to=`, có cache ngắn hợp lý.
- [ ] Cài `lightweight-charts`, component `CandleChart` (nến + volume, đổi khung 1D/1W/1M, 1 phút/5 phút nếu API có).
- [ ] Trang `/stock/[symbol]`: biểu đồ, giá hiện tại, % thay đổi, và nếu đang nắm giữ thì hiện đường giá vốn trên biểu đồ.

## Phase 3 — Giá vốn thật từ tài khoản DNSE

- [ ] `src/lib/dnse-account.ts`: `getDnsePositions()` → `{ accountNo, symbol, quantity, availableQuantity, costPrice, marketPrice }[]`, chỉ dùng GET, tôn trọng `DNSE_ACCOUNT_NO`.
- [ ] Chế độ mock: khi thiếu credential hoặc `DNSE_MOCK=1` thì đọc từ `docs/dnse-samples/`, UI hiện nhãn "Dữ liệu mẫu".
- [ ] API route `GET /api/dnse/positions` và `GET /api/dnse/balances`.

## Phase 4 — Dashboard danh mục thật

- [ ] Bảng danh mục lấy từ DNSE: mã, KL, giá vốn, giá thị trường, giá trị, lãi/lỗ (VND, %); click mã → `/stock/[symbol]`.
- [ ] Thẻ tổng: tổng tài sản, tiền mặt, tổng lãi/lỗ, tỷ trọng từng mã.
- [ ] Giữ danh mục nhập tay (model `Holding`) như nguồn phụ cho mã US/ngoài DNSE; ghi rõ nguồn dữ liệu trên UI.
- [ ] Lưu `PortfolioSnapshot` từ dữ liệu DNSE (nút "Chụp lại" + dùng cho biểu đồ hiệu suất).

## Phase 5 — Realtime

- [ ] Polling giá 5–10s trong giờ giao dịch (9:00–15:00 giờ VN, T2–T6), dừng ngoài giờ; cập nhật bảng và nến cuối.
- [ ] Watchlist (lưu MongoDB) với giá + sparkline.
- [ ] Cập nhật MCP tool (`stockmate-mcp.ts`) để trợ lý trả lời được về vị thế DNSE thật.

## Ngoài phạm vi (người dùng tự làm khi có mặt)

- Đặt/hủy lệnh (cần trading token + OTP).
- MQTT realtime qua worker riêng (Vercel serverless không giữ kết nối lâu).
- Lưu ý: Vercel chạy ở Singapore, DNSE có thể chặn IP ngoài VN — chạy local hoặc VPS VN nếu lỗi.

## Blocked

_(trống)_

## Báo cáo

_(agent ghi khi xong)_
