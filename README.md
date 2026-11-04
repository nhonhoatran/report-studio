# Report Studio

Công cụ báo cáo **kéo-thả, tự host** cho đội dev — thay thế Looker Studio / Google Data Studio và tiến tới trải nghiệm kiểu Power BI, chạy trên server Linux của bạn và kết nối trực tiếp **MariaDB**.

> English: self-hosted, drag-and-drop BI / report builder for MariaDB. See `docs/ARCHITECTURE.md` for the technical overview.

## Tính năng (v0.1)

- **Kéo-thả xây dựng biểu đồ** kiểu Power BI: kéo trường vào biểu đồ (tự xếp số → *Giá trị*, chữ/ngày → *Trục*), hoặc thả vào ô *Trục / Chú giải / Giá trị*.
- **Khung vẽ dạng lưới**: kéo để sắp xếp, kéo góc để đổi kích thước; tự xếp 1 cột trên điện thoại.
- 8 loại hiển thị: cột, thanh ngang, đường, vùng, tròn, vành khuyên, thẻ số (KPI), bảng.
- Gộp dữ liệu phía server: `SUM / AVG / COUNT / COUNT DISTINCT / MIN / MAX`, nhóm theo ngày (năm / quý / tháng / tuần / ngày / giờ), bộ lọc, sắp xếp, giới hạn dòng.
- **Nguồn dữ liệu MariaDB**: thêm nhiều kết nối, kiểm tra kết nối, duyệt bảng/view và cột. Mật khẩu được mã hóa AES-256-GCM khi lưu.
- **Bộ dữ liệu SQL**: viết câu `SELECT` (JOIN, CTE…) và dùng như một bảng. Server chỉ chấp nhận đúng một câu SELECT; mọi lệnh ghi bị chặn, kết nối đặt `READ ONLY` và có timeout.
- Đăng nhập, phân quyền `admin / editor / viewer`, đổi mật khẩu, quản lý người dùng.
- Giao diện tiếng Việt (mặc định) và tiếng Anh. Thiết kế "Sổ cái": nền xanh đen, chữ ngà, nhấn đồng thau, font Archivo + JetBrains Mono tự host (không gọi Google Fonts); có chế độ sáng.
- Một container duy nhất: API Express + giao diện React build sẵn. Metadata (bảng điều khiển, kết nối, người dùng) cũng lưu trong MariaDB.

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

Để kết nối MariaDB *có sẵn* của công ty: tạo một tài khoản chỉ có quyền `SELECT` trên các schema cần báo cáo rồi thêm làm nguồn dữ liệu. Có thể bỏ service `mariadb` trong `docker-compose.yml` và trỏ `META_DB_*` vào MariaDB của bạn (ứng dụng tự tạo bảng khi khởi động).

Đặt sau reverse proxy HTTPS (nginx / Caddy / Traefik) và bật `COOKIE_SECURE=true`.

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

Xem đầy đủ trong `.env.example` và `server/.env.example`.

## An toàn dữ liệu

1. Dùng tài khoản MariaDB **chỉ có SELECT** cho mỗi nguồn dữ liệu.
2. Server chỉ sinh câu `SELECT` từ cấu hình biểu đồ (định danh được quote, giá trị truyền tham số), SQL dataset bị kiểm tra chỉ cho một câu SELECT.
3. Mọi kết nối tới nguồn dữ liệu được đặt `SET SESSION TRANSACTION READ ONLY` và `max_statement_time`.
4. Kết quả luôn bị giới hạn `LIMIT` ≤ `QUERY_MAX_ROWS`.

## Lộ trình

Xem `docs/ROADMAP.md` (bộ lọc toàn dashboard, lịch gửi báo cáo, xuất PDF/Excel, cache, chia sẻ link công khai, thêm PostgreSQL/MySQL/ClickHouse…).

## Giấy phép

MIT — xem `LICENSE`.
