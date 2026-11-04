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

## 4. Gợi ý biểu đồ bằng AI
1. (Admin, một lần) **Cài đặt → Nhà cung cấp AI → Thêm nhà cung cấp**: chọn loại key — *Anthropic (Claude)*, *OpenAI*, *Google Gemini* hoặc *Tương thích OpenAI* (Ollama, vLLM, DeepSeek, Groq… — cần nhập địa chỉ API, ví dụ `http://ollama:11434/v1`) — nhập model và API key, nhấn **Kiểm tra** rồi **Lưu**. Có thể thêm nhiều key; đánh dấu một key làm *mặc định*.
2. Trong trình chỉnh sửa bảng điều khiển, chọn nguồn dữ liệu và bảng ở cột trái, rồi nhấn **Gợi ý bằng AI** trên thanh công cụ.
3. Mô tả điều muốn xem (ví dụ *"doanh thu theo tháng của từng khu vực"*, *"top sản phẩm bán chạy"*) hoặc để trống để AI tự đề xuất. Nếu có nhiều nhà cung cấp, chọn một trong hộp thoại.
4. Mỗi gợi ý hiển thị loại biểu đồ, các trường và phép gộp; nhấn **Thêm vào bảng** cho từng gợi ý hoặc **Thêm tất cả**. Biểu đồ được thêm như bạn tự kéo-thả, nên có thể chỉnh tiếp ở cột phải.

Lưu ý: AI chỉ nhìn thấy **tên và kiểu trường**, không nhìn thấy dữ liệu, và chỉ chọn trường / phép gộp / loại biểu đồ — câu SQL vẫn do máy chủ sinh ra như mọi biểu đồ khác.

## 5. Ngôn ngữ & giao diện
- Ngôn ngữ được nhận theo trình duyệt ở lần đầu; đổi ngay ở màn **Đăng nhập** (góc dưới) hoặc **Cài đặt → Hiển thị**. Lựa chọn được ghi nhớ trên trình duyệt này.
- Số, ngày giờ và thông báo lỗi từ máy chủ hiển thị theo ngôn ngữ đã chọn.
- Giao diện tối là mặc định; chọn *Sáng* hoặc *Theo hệ thống* trong **Cài đặt → Hiển thị**.

## 6. Người dùng & quyền
| Vai trò | Quyền |
|---|---|
| Chỉ xem (viewer) | mở bảng điều khiển đã lưu |
| Biên tập (editor) | thêm nguồn dữ liệu, bộ dữ liệu, tạo/sửa bảng điều khiển |
| Quản trị (admin) | tất cả + quản lý người dùng và nhà cung cấp AI |

Admin tạo tài khoản ở **Cài đặt → Người dùng**. Mỗi người tự đổi mật khẩu ở **Cài đặt → Tài khoản**.
