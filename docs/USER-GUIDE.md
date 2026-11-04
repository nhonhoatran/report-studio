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

### Các loại biểu đồ
Bảng chọn loại biểu đồ (cột phải) là một lưới biểu tượng như Power BI; rê chuột để xem tên, tên loại đang chọn hiện cạnh tiêu đề mục. Mỗi loại đọc các ô theo cách riêng — nhãn ô và nhãn nhỏ trên từng trường (X, Y, Hàng, Cột, Mục tiêu…) cho biết trường đó đóng vai trò gì:

| Nhóm | Loại | Ô nhận trường |
|---|---|---|
| So sánh | Cột, Thanh ngang, Đường, Vùng | Trục (+ Chú giải) · Giá trị; tùy chọn *Xếp chồng*: Không / Xếp chồng / 100% |
| | Cột & đường | Trục · Giá trị — mỗi giá trị vẽ dạng cột hoặc đường (nút cạnh trường), đường dùng trục phải |
| | Thác nước | Nhóm · 1 Giá trị — tăng/giảm theo màu, cột *Tổng cộng* ở cuối |
| Tỉ trọng | Tròn, Vành khuyên, Phễu | Nhóm / Giai đoạn · 1 Giá trị |
| | Sơ đồ cây | Nhóm (+ Chi tiết) · 1 Giá trị |
| Tương quan | Phân tán | Chi tiết (+ Chú giải) · X, Y (+ Kích cỡ = bong bóng) |
| | Bản đồ nhiệt | Trục X, Trục Y · 1 Giá trị |
| | Radar | Trục (+ Chú giải) · Giá trị |
| Một con số | Thẻ số | 1 Giá trị |
| | Đồng hồ đo | Giá trị (+ Mục tiêu); nhỏ nhất / lớn nhất / mục tiêu đặt ở Tùy chọn khi không kéo trường |
| | KPI xu hướng | Trục thời gian · Giá trị (+ Mục tiêu) — số mới nhất, chênh lệch so với kỳ trước, sparkline |
| | Thẻ nhiều dòng | Nhóm · Giá trị — một thẻ nhỏ cho mỗi nhóm |
| Bảng | Bảng | Cột · Giá trị — nhấn tiêu đề cột để sắp xếp; tùy chọn *Hiện dòng tổng*, *Thanh dữ liệu trong ô* |
| | Ma trận | Hàng, Cột · Giá trị — bảng chéo có tổng hàng / cột |

Khi đổi loại, các trường thừa so với ô của loại mới bị bỏ bớt; nếu còn thiếu, biểu đồ nhắc ô nào cần thêm.

### Mẹo
- Trục + Chú giải = 2 trường chữ: biểu đồ cột/đường sẽ tách thành nhiều chuỗi (đặt *Xếp chồng* nếu muốn cộng dồn, *100%* để so tỉ trọng).
- Mục *Phân tích* của biểu đồ cột/đường: *Đường tham chiếu* (một hằng số) và *Đường trung bình* của chuỗi đầu tiên.
- Dòng tổng của bảng / ma trận chỉ cộng các giá trị cộng được (Tổng, Số lượng); Trung bình / Nhỏ nhất / Lớn nhất hiện "–".
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

## 5. Gợi ý biểu đồ bằng AI
1. (Chỉ admin, một lần) **Cài đặt → Nhà cung cấp AI → Thêm nhà cung cấp**: chọn loại key — *Anthropic (Claude)*, *OpenAI*, *Google Gemini* hoặc *Tương thích OpenAI* (Ollama, vLLM, DeepSeek, Groq… — cần nhập địa chỉ API, ví dụ `http://ollama:11434/v1`) — nhập model và API key, nhấn **Kiểm tra** rồi **Lưu**. Có thể thêm nhiều key; đánh dấu một key làm *mặc định*.
2. Trong trình chỉnh sửa bảng điều khiển, chọn nguồn dữ liệu và bảng ở cột trái, rồi nhấn **Gợi ý bằng AI** trên thanh công cụ.
3. Mô tả điều muốn xem (ví dụ *"doanh thu theo tháng của từng khu vực"*, *"top sản phẩm bán chạy"*) hoặc để trống để AI tự đề xuất. Nếu có nhiều nhà cung cấp, chọn một trong hộp thoại.
4. Mỗi gợi ý hiển thị loại biểu đồ, các trường và phép gộp; nhấn **Thêm vào bảng** cho từng gợi ý hoặc **Thêm tất cả**. Biểu đồ được thêm như bạn tự kéo-thả, nên có thể chỉnh tiếp ở cột phải.

Lưu ý: AI chỉ nhìn thấy **tên và kiểu trường**, không nhìn thấy dữ liệu, và chỉ chọn trường / phép gộp / loại biểu đồ — câu SQL vẫn do máy chủ sinh ra như mọi biểu đồ khác.

## 6. Ngôn ngữ
- Ngôn ngữ được nhận theo trình duyệt ở lần đầu; đổi ngay ở màn **Đăng nhập** (góc dưới) hoặc **Cài đặt → Giao diện của bạn**. Lựa chọn được ghi nhớ trên trình duyệt này (không theo tài khoản); các tùy chọn giao diện khác thì lưu theo tài khoản (mục 7).
- Số, ngày giờ và thông báo lỗi từ máy chủ hiển thị theo ngôn ngữ đã chọn.

## 7. Giao diện của bạn

Mỗi người dùng tự chọn cách ứng dụng hiển thị ở **Cài đặt → Giao diện của bạn**; thay đổi áp dụng ngay và lưu theo tài khoản, nên đăng nhập trên máy khác vẫn thấy đúng giao diện của mình.

| Tùy chọn | Lựa chọn |
|---|---|
| Chế độ màu | Sáng · Tối · Theo hệ thống |
| Màu nhấn (nút chính, mục đang chọn, viền focus) | Đồng thau · Biển · Ngọc bích · Tím · Hồng · Rêu |
| Bảng màu biểu đồ (8 màu cho các chuỗi dữ liệu) | Sổ cái · Rực rỡ · Dịu nhẹ · Đại dương · Hoàng hôn |
| Cỡ chữ | Nhỏ · Vừa · Lớn |
| Góc bo | Vuông · Mềm · Tròn |
| Ngôn ngữ (lưu theo trình duyệt, không theo tài khoản) | Tiếng Việt · English |

Khung **xem trước** bên phải vẽ một biểu đồ mẫu và một thẻ số bằng đúng màu đã chọn. Nút **Về mặc định** trả lại giao diện "Sổ cái" gốc (không đổi ngôn ngữ).
