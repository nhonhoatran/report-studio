# Hướng dẫn sử dụng nhanh

## 1. Kết nối nguồn dữ liệu
1. Vào **Nguồn dữ liệu → Thêm nguồn**.
2. Nhập host, cổng, database, tài khoản (nên là tài khoản chỉ có quyền `SELECT`), mật khẩu.
3. Nhấn **Kiểm tra kết nối**, rồi **Lưu**.
4. Mở nguồn vừa tạo để xem danh sách bảng/view và cột.

## 2. (Tuỳ chọn) Tạo bộ dữ liệu SQL
Khi cần JOIN nhiều bảng hoặc tính toán trước:
1. Trong trang chi tiết nguồn dữ liệu, nhấn **Thêm bộ dữ liệu**.
2. Viết **một** câu `SELECT` (có thể dùng JOIN, CTE, hàm). Ví dụ:
   ```sql
   SELECT o.order_date, r.name AS region, p.category,
          SUM(oi.quantity * oi.unit_price) AS revenue
   FROM orders o
   JOIN customers c ON c.id = o.customer_id
   JOIN regions r ON r.id = c.region_id
   JOIN order_items oi ON oi.order_id = o.id
   JOIN products p ON p.id = oi.product_id
   GROUP BY 1, 2, 3
   ```
3. Nhấn **Kiểm tra & xem cột** để chắc chắn câu SQL hợp lệ, rồi **Lưu**.
   Bộ dữ liệu xuất hiện trong danh sách "Bộ dữ liệu SQL" khi chọn trường ở trình chỉnh sửa.

## 3. Xây dựng bảng điều khiển
1. **Bảng điều khiển → Tạo bảng mới**, đặt tên ở thanh trên.
2. Cột trái: chọn nguồn dữ liệu và bảng / bộ dữ liệu. Các trường hiện ra kèm kiểu (số, ngày giờ, chữ).
3. Nhấn **Thêm biểu đồ** để có một ô trống trên khung vẽ.
4. **Kéo trường** từ cột trái:
   - thả **vào biểu đồ**: trường số tự vào *Giá trị* (tổng), trường chữ/ngày tự vào *Trục*;
   - hoặc thả **vào ô Trục / Chú giải / Giá trị** ở cột phải để chọn chính xác;
   - hoặc nhấn dấu **+** cạnh trường để thêm vào biểu đồ đang chọn.
5. Cột phải: đổi **loại biểu đồ**, phép gộp (Tổng / Trung bình / Số lượng…), nhóm ngày (Năm / Quý / Tháng…), **bộ lọc**, sắp xếp, định dạng số.
6. Kéo tiêu đề biểu đồ để di chuyển, kéo góc dưới-phải để đổi kích thước.
7. **Lưu** (hoặc `Ctrl+S`). Nhấn **Xem** để mở chế độ chỉ đọc.

### Mẹo
- Trục + Chú giải = 2 trường chữ: biểu đồ cột/đường sẽ tách thành nhiều chuỗi (bật *Xếp chồng* nếu muốn cộng dồn).
- Thẻ số (KPI) chỉ nhận một *Giá trị*.
- Bảng nhận nhiều cột tuỳ ý; nếu không có *Giá trị* thì hiển thị các dòng duy nhất.
- Biểu tượng `</>` ở chân mỗi biểu đồ hiển thị câu SQL đã sinh ra — tiện để kiểm tra hoặc copy sang công cụ khác.
- Kết quả bị cắt ở `QUERY_MAX_ROWS` (mặc định 5.000 dòng); hãy gộp/lọc thay vì vẽ dữ liệu thô.

## 4. Người dùng & quyền
| Vai trò | Quyền |
|---|---|
| Chỉ xem (viewer) | mở bảng điều khiển đã lưu |
| Biên tập (editor) | thêm nguồn dữ liệu, bộ dữ liệu, tạo/sửa bảng điều khiển |
| Quản trị (admin) | tất cả + quản lý người dùng |

Admin tạo tài khoản ở **Cài đặt → Người dùng**. Mỗi người tự đổi mật khẩu ở **Cài đặt → Tài khoản**.

### Đăng nhập bằng Microsoft (Entra ID)
Nếu quản trị viên đã bật SSO, trang đăng nhập có nút **Đăng nhập bằng Microsoft**: bạn được chuyển sang trang đăng nhập của Microsoft rồi quay lại ứng dụng. Lần đầu đăng nhập, tài khoản được tạo tự động (hoặc liên kết với tài khoản admin đã tạo sẵn có tên đăng nhập là e-mail của bạn). Tài khoản loại này không có mật khẩu riêng — ô **Cài đặt → Tài khoản** sẽ ghi rõ mật khẩu do tổ chức quản lý. Trong **Cài đặt → Người dùng**, cột **Đăng nhập** cho biết tài khoản dùng *Mật khẩu* hay *Microsoft Entra*; vai trò có thể đổi tại đây trừ khi quản trị viên đã cấu hình ánh xạ vai trò từ Entra (khi đó vai trò được đồng bộ mỗi lần đăng nhập).

Thông báo lỗi có thể gặp sau khi quay về từ Microsoft:

| Thông báo | Nguyên nhân |
|---|---|
| Tài khoản Microsoft này không thuộc tổ chức được phép đăng nhập | domain e-mail không nằm trong `ENTRA_ALLOWED_DOMAINS` |
| Chưa có tài khoản Report Studio cho người dùng này | `ENTRA_AUTO_PROVISION=false` và admin chưa tạo tài khoản với tên đăng nhập = e-mail |
| Phiên đăng nhập Microsoft đã hết hạn | quá 10 phút giữa lúc nhấn nút và lúc quay về, hoặc mở link cũ |
| Đăng nhập Microsoft không thành công | lỗi cấu hình (redirect URI, client secret hết hạn…) — xem log server |
