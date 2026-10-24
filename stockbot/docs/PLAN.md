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
- [x] Thêm layout điều hướng: Tổng quan, Danh mục, `/stock/[symbol]`.
  → Xong. Route group `src/app/(dashboard)/` có layout chung (`DashboardShell`): `/`, `/portfolio`, `/markets`, `/performance`, `/stock/[symbol]`. Sidebar dùng `Link` + ô "Tra mã" để mở `/stock/XXX`. Đã chạy thử `next start`: cả 5 route trả 200, mã sai trả 404.

## Phase 2 — Biểu đồ từng mã

- [x] `src/lib/dnse-market.ts`: hàm `getDnseOhlc(symbol, resolution, from, to)` trả `{ time, open, high, low, close, volume }[]` (đơn vị VND).
  → Xong. Nhân 1.000 cho STOCK, giữ điểm cho INDEX/DERIVATIVE. DNSE không cần phân trang (1 lần gọi trả 10 năm nến ngày, 4.743 nến 1 phút).
- [x] API route `GET /api/market/ohlc/[symbol]?resolution=1D&from=&to=`, có cache ngắn hợp lý.
  → Xong. Mặc định 1D/1 năm; hỗ trợ `type=INDEX` (VNINDEX). Cache-Control private 15s (intraday) / 300s (1D, 1W). Đã test bằng request thật.
- [x] Cài `lightweight-charts`, component `CandleChart` (nến + volume, đổi khung 1D/1W/1M, 1 phút/5 phút nếu API có).
  → Xong. `lightweight-charts@5.2.1`, `src/components/charts/CandleChart.tsx`: nến + volume, khung 1/5/15 phút, 1 giờ, Ngày, Tuần (DNSE không có nến tháng). Giờ hiển thị theo VN (UTC+7).
- [x] Trang `/stock/[symbol]`: biểu đồ, giá hiện tại, % thay đổi, và nếu đang nắm giữ thì hiện đường giá vốn trên biểu đồ.
  → Xong. Thanh giá (khớp gần nhất, tham chiếu, cao/thấp, KL), biểu đồ, thẻ vị thế + đường giá vốn nét đứt (hiện lấy từ danh mục nhập tay; Phase 4 thêm DNSE). Hỗ trợ chỉ số (VNINDEX, VN30…). Đã chụp màn hình headless xác nhận biểu đồ render. Sửa thêm: CSS `.api-alert` (trước đây không có) và lưới 4 thẻ trang Danh mục.

## Phase 3 — Giá vốn thật từ tài khoản DNSE

- [x] `src/lib/dnse-account.ts`: `getDnsePositions()` → `{ accountNo, symbol, quantity, availableQuantity, costPrice, marketPrice }[]`, chỉ dùng GET, tôn trọng `DNSE_ACCOUNT_NO`.
  → Xong. Đọc `/accounts/{no}/positions?marketType=STOCK` cho mọi tiểu khoản (lọc theo `DNSE_ACCOUNT_NO`), bỏ vị thế CLOSED/KL 0. Thêm `getDnseCash()` (tiền cơ sở). Tách `getDnseAccountNos()` dùng chung với `getDnseAccountBalances` (MCP).
- [x] Chế độ mock: khi thiếu credential hoặc `DNSE_MOCK=1` thì đọc từ `docs/dnse-samples/`, UI hiện nhãn "Dữ liệu mẫu".
  → Xong. `isDnseMock()`; response có `source: "MOCK"` để UI gắn nhãn (nhãn làm ở Phase 4).
- [x] API route `GET /api/dnse/positions` và `GET /api/dnse/balances`.
  → Xong, test cả thật (tài khoản thật: 0 vị thế, có tiền) và mock. **Thêm `src/proxy.ts`**: Basic auth khi đặt `STOCKMATE_DASHBOARD_PASSWORD`; trên Vercel thiếu mật khẩu thì `/api/dnse/*` trả 403 — để không lộ số dư tài khoản ra internet. Biến mới ghi trong `docs/dnse-api.md`.

## Phase 4 — Dashboard danh mục thật

- [x] Bảng danh mục lấy từ DNSE: mã, KL, giá vốn, giá thị trường, giá trị, lãi/lỗ (VND, %); click mã → `/stock/[symbol]`.
  → Xong. `DnseProvider` (context dùng chung) + `DnsePositionsTable`: giá live từ `/price/{symbol}/trades/latest`, nếu không có thì dùng giá DNSE báo; có cột tỷ trọng và KL khả dụng. Hiện ở Tổng quan + Danh mục.
- [x] Thẻ tổng: tổng tài sản, tiền mặt, tổng lãi/lỗ, tỷ trọng từng mã.
  → Xong. `DnseSummaryCards`: tài sản ròng (tiền + CP − nợ), giá trị CP/giá vốn, tiền mặt/khả dụng, lãi/lỗ %. Tỷ trọng từng mã nằm trong bảng.
- [x] Giữ danh mục nhập tay (model `Holding`) như nguồn phụ cho mã US/ngoài DNSE; ghi rõ nguồn dữ liệu trên UI.
  → Xong. Mục "Danh mục nhập tay" nằm bên dưới; nhãn nguồn "DNSE · ENTRADE X" / "DỮ LIỆU MẪU". Trang `/stock/[symbol]` ưu tiên giá vốn DNSE, nếu không có mới dùng danh mục nhập tay. Đã chụp màn hình cả chế độ mock và thật.
- [x] Lưu `PortfolioSnapshot` từ dữ liệu DNSE (nút "Chụp lại" + dùng cho biểu đồ hiệu suất).
  → Code xong, **chưa test được với DB** (MongoDB không kết nối, xem Blocked). `GET/POST /api/portfolio/snapshots`; POST tự định giá tài khoản DNSE phía server (`getDnseValuation()`) rồi lưu. Trang Hiệu suất có panel "Lịch sử tài sản DNSE" + nút "Chụp lại" + biểu đồ đường. Đã xác nhận báo lỗi DB hiển thị đúng; phần vẽ biểu đồ cần kiểm tra lại khi DB chạy.

## Phase 5 — Realtime

- [x] Polling giá 5–10s trong giờ giao dịch (9:00–15:00 giờ VN, T2–T6), dừng ngoài giờ; cập nhật bảng và nến cuối.
  → Xong. `src/lib/market-hours.ts` (`useTradingInterval` 10s, bỏ qua khi tab ẩn/ngoài giờ). Polling giá vị thế (DnseProvider), thanh giá + nến cuối (`series.update`, không vẽ lại). Topbar hiện trạng thái phiên thật thay vì luôn "đang mở". Chưa nghỉ trưa 11:30–13:00, chưa tính ngày lễ. **Chưa quan sát chạy thật** (làm vào thứ Bảy); đã kiểm tra logic giờ bằng các mốc biên.
- [ ] Watchlist (lưu MongoDB) với giá + sparkline.
- [x] Cập nhật MCP tool (`stockmate-mcp.ts`) để trợ lý trả lời được về vị thế DNSE thật.
  → Xong. Tool MCP mới `get_dnse_positions` (dùng `getDnseValuation()`); khai báo cho Gemini trong `/api/assistant`. Giống tool số dư: kết quả trả thẳng cho người dùng, **không gửi vị thế cá nhân ngược lại Gemini**. Đã test: hỏi "Trên Entrade X tôi đang giữ mã nào…" → Gemini chọn đúng tool.

## Ngoài phạm vi (người dùng tự làm khi có mặt)

- Đặt/hủy lệnh (cần trading token + OTP).
- MQTT realtime qua worker riêng (Vercel serverless không giữ kết nối lâu).
- Lưu ý: Vercel chạy ở Singapore, DNSE có thể chặn IP ngoài VN — chạy local hoặc VPS VN nếu lỗi.

## Blocked

- **MongoDB không kết nối được từ máy local** (2026-10-24): `GET /api/portfolio` trả 503 sau 30s ("Hãy kiểm tra kết nối database"). Lỗi có sẵn từ trước, không do refactor. Cần người dùng: kiểm tra `MONGODB_URI`, whitelist IP hiện tại trong MongoDB Atlas → Network Access. Ảnh hưởng: danh mục nhập tay, snapshot, watchlist chưa test thật được; phần DNSE không bị ảnh hưởng.

## Báo cáo

_(agent ghi khi xong)_
