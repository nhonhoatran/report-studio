# Report Studio

Công cụ báo cáo **kéo-thả, tự host** cho đội dev — thay thế Looker Studio / Google Data Studio và tiến tới trải nghiệm kiểu Power BI, chạy trên server Linux của bạn và kết nối trực tiếp **MariaDB**.

> English: self-hosted, drag-and-drop BI / report builder for MariaDB. See `docs/ARCHITECTURE.md` for the technical overview.

## Tính năng (v0.1)

- **Kéo-thả xây dựng biểu đồ** kiểu Power BI: kéo trường vào biểu đồ (tự xếp số → *Giá trị*, chữ/ngày → *Trục*), hoặc thả vào ô *Trục / Chú giải / Giá trị*.
- **Khung vẽ dạng lưới**: kéo để sắp xếp, kéo góc để đổi kích thước; tự xếp 1 cột trên điện thoại.
- **19 loại hiển thị** theo bộ biểu đồ của Power BI: cột, thanh ngang, đường, vùng (xếp chồng / 100%), cột & đường (2 trục), phân tán / bong bóng, thác nước, phễu, tròn, vành khuyên, sơ đồ cây, bản đồ nhiệt, radar, đồng hồ đo (có mục tiêu), thẻ số, KPI xu hướng (so với kỳ trước, mục tiêu, sparkline), thẻ nhiều dòng, bảng (sắp xếp theo cột, dòng tổng, thanh dữ liệu), ma trận (pivot hàng × cột, tổng).
- Tùy chọn từng biểu đồ: vị trí chú giải, nhãn giá trị, đường tham chiếu và đường trung bình, định dạng số, sắp xếp, giới hạn dòng.
- **Báo cáo nhiều trang**: thêm / đổi tên / sắp xếp / nhân bản / xóa trang, danh mục trang dạng tab, link mở đúng trang (`?page=`), bộ lọc áp cho cả báo cáo hoặc chỉ một trang.
- **Tên hiển thị** cho trường và giá trị gộp ("Doanh số" thay vì "Sum doanh_so") ở tiêu đề cột, chú giải, tooltip, trục, thẻ.
- **Đo lường tính toán**: công thức trên các giá trị gộp của biểu đồ (`[Lãi gộp] / [Doanh số]`, `sum(a) / count(*)`), tính sau GROUP BY trong SQL nên dòng tổng là tỷ lệ của các tổng; chia cho 0 cho ô trống; báo lỗi ngay chỗ gõ sai. **Hiển thị dưới dạng** % trên tổng chung / tổng nhóm cha / tổng cột (window function). Dòng tổng của bảng và ma trận do nguồn dữ liệu tính trong cùng câu lệnh.
- **Bộ lọc bảng điều khiển** (slicer) áp dụng cho mọi biểu đồ: khoảng thời gian (preset hoặc từ–đến), loại thời gian (năm / quý / tháng…), danh sách giá trị đọc từ dữ liệu (chọn một hoặc nhiều). Giá trị lưu cùng bảng là mặc định cho người xem.
- **Phân quyền RBAC + ABAC**: vai trò = tập quyền (3 vai trò có sẵn, thêm vai trò tùy ý, bật/tắt từng quyền); chính sách truy cập theo thuộc tính người dùng (ai xem bảng nào, truy vấn nguồn nào, cho phép / từ chối) và **lọc dòng** (row-level security: `region IN (thuộc tính region của người dùng)`).
- Gộp dữ liệu phía server: `SUM / AVG / COUNT / COUNT DISTINCT / MIN / MAX`, nhóm theo ngày (năm / quý / tháng / tuần / ngày / giờ), bộ lọc, sắp xếp, giới hạn dòng.
- **Nguồn dữ liệu MariaDB**: thêm nhiều kết nối, kiểm tra kết nối, duyệt bảng/view và cột. Mật khẩu được mã hóa AES-256-GCM khi lưu.
- **Bộ dữ liệu SQL**: viết câu `SELECT` (JOIN, CTE…) và dùng như một bảng. Server chỉ chấp nhận đúng một câu SELECT; mọi lệnh ghi bị chặn, kết nối đặt `READ ONLY` và có timeout.
- Đăng nhập, đổi mật khẩu, quản lý người dùng, vai trò và chính sách truy cập.
- **Đăng nhập bằng Microsoft Entra ID** (SSO, OpenID Connect): tự tạo tài khoản lần đầu, ánh xạ app role / group sang vai trò, giới hạn theo domain e-mail; có thể tắt hẳn đăng nhập bằng mật khẩu.
- Giao diện tiếng Việt (mặc định) và tiếng Anh. Thiết kế "Sổ cái": nền xanh đen, chữ ngà, nhấn đồng thau, font Archivo + JetBrains Mono tự host (không gọi Google Fonts); có chế độ sáng.
- **Giao diện của bạn**: mỗi người dùng tự chọn chế độ sáng/tối, màu nhấn (6), bảng màu biểu đồ (5), cỡ chữ, góc bo và ngôn ngữ trong *Cài đặt*. Lựa chọn lưu theo tài khoản, áp dụng ngay khi đăng nhập trên mọi thiết bị.
- Một container duy nhất: API Express + giao diện React build sẵn. Metadata (bảng điều khiển, kết nối, người dùng) cũng lưu trong MariaDB.
- **Gợi ý biểu đồ bằng AI**: mô tả điều bạn muốn xem ("doanh thu theo tháng của từng khu vực") hoặc để AI tự đề xuất; mỗi gợi ý thêm thẳng vào khung vẽ. Dùng được **nhiều loại key**: Anthropic (Claude), OpenAI, Google Gemini hoặc bất kỳ máy chủ tương thích OpenAI (Ollama, vLLM, DeepSeek, Groq…). Key mã hóa khi lưu, chỉ máy chủ gọi AI; AI chỉ chọn trường / phép gộp / loại biểu đồ, **không bao giờ sinh SQL**.
- **Đa ngôn ngữ hoàn chỉnh**: tự nhận theo ngôn ngữ trình duyệt, đổi được ngay ở màn đăng nhập; số, ngày giờ và cả thông báo lỗi từ máy chủ hiển thị theo ngôn ngữ đã chọn. Thêm ngôn ngữ mới = một file từ điển + một dòng đăng ký (xem `docs/ARCHITECTURE.md`).

## Chạy nhanh bằng Docker (khuyến nghị cho server Linux)

```bash
git clone <repo-url> report-studio && cd report-studio
cp .env.example .env
# sửa APP_SECRET (>= 32 ký tự ngẫu nhiên), ADMIN_PASSWORD, MARIADB_ROOT_PASSWORD
docker compose up -d --build
```

Mở `http://<server>:8080`, đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`.

Container MariaDB đi kèm tự tạo:

| Database | Tài khoản | Mục đích |
|---|---|---|
| `report_studio` | `studio` / `studio_pw` | metadata của ứng dụng |
| `demo_sales` | `readonly` / `readonly_pw` | dữ liệu mẫu (1.200 đơn hàng, view `v_sales`) để thử ngay |

Trong ứng dụng, vào **Nguồn dữ liệu → Thêm nguồn**: host `mariadb`, database `demo_sales`, tài khoản `readonly`.

Để bật gợi ý bằng AI: **Cài đặt → Nhà cung cấp AI → Thêm nhà cung cấp**, chọn loại (Anthropic / OpenAI / Gemini / tương thích OpenAI), nhập model và API key, nhấn **Kiểm tra** rồi **Lưu**. Có thể thêm nhiều key; người soạn bảng chọn nhà cung cấp ngay trong hộp thoại gợi ý.

Để kết nối MariaDB *có sẵn* của công ty: tạo một tài khoản chỉ có quyền `SELECT` trên các schema cần báo cáo rồi thêm làm nguồn dữ liệu. Có thể bỏ service `mariadb` trong `docker-compose.yml` và trỏ `META_DB_*` vào MariaDB của bạn (ứng dụng tự tạo bảng khi khởi động).

Đặt sau reverse proxy HTTPS (nginx / Caddy / Traefik) và bật `COOKIE_SECURE=true`.

## Đăng nhập bằng Microsoft Entra ID (SSO)

Report Studio đăng nhập qua Entra ID bằng OpenID Connect (authorization code + PKCE). Khi bật, trang đăng nhập có thêm nút **Đăng nhập bằng Microsoft**; đăng nhập bằng mật khẩu vẫn hoạt động song song (trừ khi tắt).

1. Trong **Microsoft Entra admin center → App registrations → New registration**: chọn *Accounts in this organizational directory only*; mục **Redirect URI** chọn *Web* và nhập `https://<host>/api/auth/entra/callback`.
2. **Overview**: copy *Application (client) ID* → `ENTRA_CLIENT_ID`, *Directory (tenant) ID* → `ENTRA_TENANT_ID`.
3. **Certificates & secrets → New client secret**: copy *Value* → `ENTRA_CLIENT_SECRET`.
4. (Nên làm) **Token configuration → Add optional claim → ID → `email`** để tài khoản có e-mail; **App roles** tạo ví dụ `ReportStudio.Admin`, `ReportStudio.Editor`, `ReportStudio.Viewer` rồi gán người dùng/nhóm trong **Enterprise applications → Users and groups**, và khai báo `ENTRA_ADMIN_ROLES=ReportStudio.Admin` … Người không có role nào được gán sẽ nhận `ENTRA_DEFAULT_ROLE`; admin vẫn đổi được vai trò trong ứng dụng khi không dùng ánh xạ.
5. Điền các biến `ENTRA_*` vào `.env`, khởi động lại. Khi chạy dev (Vite :5173) đặt `ENTRA_REDIRECT_URI=http://localhost:5173/api/auth/entra/callback` và đăng ký đúng URI đó.

Giới hạn ai được vào: bật *Assignment required* trên Enterprise application, hoặc `ENTRA_ALLOWED_DOMAINS=congty.vn`, hoặc `ENTRA_AUTO_PROVISION=false` (chỉ tài khoản đã được admin tạo trước với tên đăng nhập = UPN/e-mail mới vào được; lần đầu đăng nhập tài khoản đó được liên kết với Entra và vẫn giữ mật khẩu cũ). Khi SSO đã chạy ổn và có ít nhất một admin đăng nhập qua Entra, đặt `AUTH_LOCAL_LOGIN=false` để ẩn form mật khẩu.

## Phát triển

Yêu cầu: Node.js ≥ 20, MariaDB 10.6+ (hoặc chạy `docker compose up -d mariadb`).

```bash
npm install
cp server/.env.example server/.env   # chỉnh META_DB_* nếu cần
npm run dev                          # API :4000 + Vite :5173 (proxy /api)
```

Lệnh khác:

```bash
npm run typecheck   # TypeScript cho server + web
npm test            # unit test (vitest) cho query builder & SQL guard
npm run build       # build web (web/dist) rồi server (server/dist)
npm start           # chạy bản build, phục vụ cả API lẫn giao diện
```

## Cấu trúc thư mục

```
server/   Express + TypeScript: auth, nguồn dữ liệu, dataset, dashboard, query engine
web/      React 18 + Vite: giao diện kéo-thả (react-grid-layout, dnd-kit), ECharts
docker/   script khởi tạo MariaDB (database, tài khoản, dữ liệu mẫu)
docs/     kiến trúc, lộ trình, hướng dẫn đóng góp
```

## Biến môi trường chính

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `APP_SECRET` | (bắt buộc ở production) | ký phiên đăng nhập + mã hóa mật khẩu nguồn dữ liệu |
| `META_DB_HOST/PORT/USER/PASSWORD/NAME` | `127.0.0.1:3306`, `studio`, `report_studio` | MariaDB chứa metadata |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / (bắt buộc ở production) | tài khoản admin tạo lần đầu |
| `QUERY_MAX_ROWS` | `5000` | số dòng tối đa trả về cho một biểu đồ |
| `QUERY_TIMEOUT_SECONDS` | `30` | timeout mỗi truy vấn (`max_statement_time` + client) |
| `COOKIE_SECURE` | `false` | `true` khi chạy sau HTTPS |
| `AI_TIMEOUT_SECONDS` | `60` | thời gian tối đa cho một lời gọi nhà cung cấp AI (gợi ý biểu đồ) |
| `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` | (tắt) | bật đăng nhập Microsoft Entra ID khi đủ cả ba |
| `ENTRA_REDIRECT_URI` | suy từ request | URL callback công khai: `https://<host>/api/auth/entra/callback` |
| `ENTRA_ALLOWED_DOMAINS` | (mọi domain) | domain e-mail được phép, cách nhau bằng dấu phẩy |
| `ENTRA_AUTO_PROVISION` | `true` | tự tạo tài khoản ở lần đăng nhập đầu |
| `ENTRA_DEFAULT_ROLE` | `viewer` | vai trò cho tài khoản tự tạo khi không khớp ánh xạ |
| `ENTRA_ADMIN_ROLES` / `ENTRA_EDITOR_ROLES` / `ENTRA_VIEWER_ROLES` | (trống) | app role hoặc group object id ánh xạ sang vai trò, cách nhau bằng dấu phẩy |
| `AUTH_LOCAL_LOGIN` | `true` | `false` để tắt đăng nhập bằng mật khẩu (bắt buộc đã cấu hình Entra) |

Xem đầy đủ trong `.env.example` và `server/.env.example`.

## An toàn dữ liệu

1. Dùng tài khoản MariaDB **chỉ có SELECT** cho mỗi nguồn dữ liệu.
2. Server chỉ sinh câu `SELECT` từ cấu hình biểu đồ (định danh được quote, giá trị truyền tham số), SQL dataset bị kiểm tra chỉ cho một câu SELECT.
3. Mọi kết nối tới nguồn dữ liệu được đặt `SET SESSION TRANSACTION READ ONLY` và `max_statement_time`.
4. Kết quả luôn bị giới hạn `LIMIT` ≤ `QUERY_MAX_ROWS`.

## Lộ trình

Xem `docs/ROADMAP.md` (bộ lọc toàn dashboard, lịch gửi báo cáo, xuất PDF/Excel, cache, chia sẻ link công khai, thêm PostgreSQL/MySQL/ClickHouse, SSO cho nhà cung cấp OIDC khác…).

## Giấy phép

MIT — xem `LICENSE`.
