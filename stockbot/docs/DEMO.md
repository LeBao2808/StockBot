# Kịch bản demo: MCP in Action

Thông điệp chính: **viết tool một lần trên MCP Server, nhiều client dùng lại**: trợ lý trong app (Gemini) và một ứng dụng bên ngoài (MCP Inspector) gọi đúng 5 tool đó mà không sửa dòng code nào.

Thời lượng: khoảng 8–10 phút.

---

## Chuẩn bị (trước giờ trình bày)

1. `.env` có: `DNSE_API_KEY`, `DNSE_API_SECRET`, `GEMINI_API_KEY`, `FINNHUB_API_KEY`, `STOCKMATE_MCP_TOKEN`.
2. Chạy app ở **chế độ dữ liệu mẫu** để màn chiếu không lộ số dư/vị thế thật:
   ```bash
   npm run build
   DNSE_MOCK=1 npm start          # PowerShell: $env:DNSE_MOCK=1; npm start
   ```
   Giá thị trường, biểu đồ, bảng giá vẫn là dữ liệu DNSE thật; chỉ tài khoản là dữ liệu mẫu.
3. Mở sẵn MCP Inspector ở tab thứ hai:
   ```bash
   npx @modelcontextprotocol/inspector
   ```
   Trong Inspector: **Transport** = `Streamable HTTP`, **URL** = `http://localhost:3000/api/mcp`, mục **Authentication** → header `Authorization`, giá trị `Bearer <STOCKMATE_MCP_TOKEN>`. Bấm **Connect** thử một lần rồi để đó.
4. Mở trình duyệt ở `http://localhost:3000/stock/FPT`, phóng to vừa màn chiếu.
5. Chạy thử trọn kịch bản một lần. Lần gọi Gemini đầu tiên có thể chậm.

**Tránh khi demo:** câu hỏi về "danh mục đã lưu" (`compare_portfolio_holding`, `summarize_portfolio`) vì 2 tool này cần MongoDB. Chỉ dùng nếu đã sửa được kết nối DB.

---

## Cảnh 1: Ứng dụng (1 phút)

- Trang Home: "🔥 Cổ phiếu hot hôm nay", quét 130 mã từ DNSE.
- Bấm một mã → biểu đồ nến + panel **Bước giá** bên cạnh.
- Câu chuyển: *"Giờ thay vì bấm, mình hỏi trợ lý AI. Hãy xem nó lấy dữ liệu bằng cách nào."*

## Cảnh 2: Trợ lý gọi tool qua MCP (3 phút)

Mở **Hỏi Stockmate** → nút ⤢ toàn màn hình.

**Câu 1: `Giá FPT và AAPL bây giờ bao nhiêu?`**

Mở khối **MCP · 2 tool call** dưới câu trả lời và đi qua từng bước:

| Bước | Trên màn hình | Nói gì |
|---|---|---|
| ① `tools/list` | 5 tool từ MCP Server | "App không viết sẵn danh sách tool. Nó hỏi MCP Server: *bạn có tool gì?*" |
| ② Gemini | chọn `get_stock_quote` ×2 | "Gemini đọc mô tả tool mà MCP trả về và tự chọn, gọi **song song** 2 lần." |
| ③ `tools/call` | `{symbol: FPT, market: VN}` → JSON từ DNSE | "Mã Việt Nam: tool lấy giá thật từ DNSE." |
| ④ `tools/call` | `{symbol: AAPL, market: US}` → JSON từ Finnhub | "Cùng một tool, đổi tham số là đổi nguồn dữ liệu." |
| ⑤ Gemini | viết câu trả lời | "Gemini chỉ diễn đạt lại dữ liệu thật, không tự bịa giá." |

**Câu 2: `Trên Entrade X tôi đang giữ mã nào?`**

- Trace: `get_dnse_positions` → **🔒 ẩn kết quả**.
- Nói: *"Đây là dữ liệu tài khoản cá nhân. Kết quả trả thẳng cho người dùng, **không gửi ngược lại cho Gemini**, và cũng không hiện trong trace. Mọi tool đều chỉ đọc, không có tool đặt lệnh."*

**Câu 3 (tùy chọn): `MCP là gì?`**

- Trace: chỉ `tools/list` → Gemini **viết câu trả lời**, không gọi tool.
- Nói: *"Câu hỏi không cần dữ liệu thì model không gọi tool. Việc chọn tool là quyết định của model."*

## Cảnh 3: MCP in Action, client khác hoàn toàn (3 phút)

Chuyển sang tab **MCP Inspector** (đã kết nối).

1. **Tools → List Tools** → hiện đúng 5 tool, cùng tên, cùng mô tả với trace ở cảnh 2.
   *"Cùng server đó, nhưng client là một ứng dụng hoàn toàn khác, nói chuyện qua HTTP."*
2. Chọn `get_stock_quote`, nhập `symbol = EIB`, `market = VN` → **Run Tool** → giá EIB từ DNSE.
   *"Không có Gemini, không có giao diện chat của mình, nhưng tool vẫn chạy. **Viết một lần, nhiều client dùng lại.**"*
3. (Tùy chọn) Mở tab **Notifications/History** để thấy các bản tin JSON-RPC `tools/list`, `tools/call`.

## Cảnh 4: Kiến trúc và bảo mật (1–2 phút)

```
                ┌───────────── MCP Server "stockmate-portfolio" ─────────────┐
                │ get_stock_quote · get_dnse_positions · get_dnse_cash_balance│
                │ compare_portfolio_holding · summarize_portfolio  (chỉ đọc) │
                └───────────────┬───────────────────────────┬────────────────┘
                 InMemoryTransport                 Streamable HTTP /api/mcp
                                │                   (Bearer token, so sánh timing-safe)
                   Trợ lý trong app (Gemini)                │
                   tools/list → chọn → tools/call      MCP Inspector / Claude Desktop
                                │
                 DNSE OpenAPI · Finnhub · MongoDB
```

Ý chính:
- Một server, hai transport: trong app dùng in-memory, bên ngoài dùng HTTP.
- Danh sách tool lấy động qua `tools/list`. Thêm tool ở server thì cả chat lẫn client ngoài thấy ngay.
- An toàn: tool chỉ đọc; dữ liệu tài khoản không đi qua LLM; `/api/mcp` cần token; `proxy.ts` khóa dashboard nhưng chừa riêng `/api/mcp`.

---

## Nếu có sự cố

| Sự cố | Xử lý nhanh |
|---|---|
| Gemini báo lỗi hạn mức / chậm | Chuyển sang cảnh 3 (Inspector không cần Gemini) |
| Inspector báo 401 | Kiểm tra header `Authorization: Bearer <token>` đúng với `.env` |
| Inspector báo 503 | Chưa đặt `STOCKMATE_MCP_TOKEN` trong `.env` |
| DNSE không phản hồi | Hỏi giá mã Mỹ (`AAPL`, Finnhub) để vẫn thấy tool chạy |
| Ngoài giờ giao dịch | Bình thường: giá là phiên gần nhất, có ghi giờ khớp |
