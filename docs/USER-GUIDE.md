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
| | Ma trận | Hàng (nhiều cấp), Cột · Giá trị — bảng chéo; mỗi cấp hàng mở / thu được, dòng cha là tổng phụ, tổng hàng / cột / chung |

Khi đổi loại, các trường thừa so với ô của loại mới bị bỏ bớt; nếu còn thiếu, biểu đồ nhắc ô nào cần thêm.

### Mẹo
- Trục + Chú giải = 2 trường chữ: biểu đồ cột/đường sẽ tách thành nhiều chuỗi (đặt *Xếp chồng* nếu muốn cộng dồn, *100%* để so tỉ trọng).
- Mục *Phân tích* của biểu đồ cột/đường: *Đường tham chiếu* (một hằng số) và *Đường trung bình* của chuỗi đầu tiên.
- Dòng tổng của bảng / ma trận do nguồn dữ liệu tính trong cùng câu lệnh: Tổng, Số lượng, Trung bình (tính lại từ tổng và số lượng), Nhỏ nhất / Lớn nhất và cả phép tính đều có tổng đúng; chỉ *Số lượng khác nhau* hiện "–".
- Thẻ số (KPI) chỉ nhận một *Giá trị*.
- Bảng nhận nhiều cột tuỳ ý; nếu không có *Giá trị* thì hiển thị các dòng duy nhất.
- Biểu tượng `</>` ở chân mỗi biểu đồ hiển thị câu SQL đã sinh ra — tiện để kiểm tra hoặc copy sang công cụ khác.
- Kết quả bị cắt ở `QUERY_MAX_ROWS` (mặc định 5.000 dòng); hãy gộp/lọc thay vì vẽ dữ liệu thô.

### Tên hiển thị, phép tính, % trên tổng
Mỗi trường trong ô *Trục / Hàng / Cột / Giá trị* có nút **Tùy chỉnh trường** (biểu tượng thanh trượt) mở phần cài đặt ngay dưới trường:

- **Tên hiển thị**: tên nghiệp vụ ("Doanh số") thay cho tên kỹ thuật ("Tổng doanh_so") ở tiêu đề cột, chú giải, tooltip, trục và thẻ. Xóa tên thì quay về tên tự sinh.
- **Hiển thị dưới dạng** (trường ở ô *Giá trị*): *Giá trị*, *% trên tổng chung*, *% trên tổng nhóm cha (hàng)* hoặc *% trên tổng cột*. Tỷ trọng tính ở nguồn dữ liệu theo dữ liệu đã lọc; các dòng của một nhóm cộng lại bằng 100%.
- **Định dạng số của trường**: riêng cho trường này (tiền cho doanh số, phần trăm cho tỷ lệ) thay vì định dạng chung của biểu đồ.

**Thêm phép tính** (nút ở cuối ô *Giá trị*) tạo một giá trị tính từ các giá trị khác của biểu đồ, ví dụ tỷ lệ lãi gộp `[sum_lai_gop] / [Doanh số]` hoặc `sum(thuc_hien) / sum(ke_hoach) * 100`:

- tham chiếu giá trị khác bằng `[tên]` (bí danh hoặc tên hiển thị; nhấn tên giá trị dưới ô công thức để chèn), hoặc gộp thẳng một cột: `sum(cot)`, `avg(cot)`, `count(*)`, `count_distinct(cot)`, `min(cot)`, `max(cot)`;
- phép toán `+ − × ÷` (hoặc `* /`), hằng số và ngoặc;
- phép tính thực hiện **sau khi gộp**, nên ở dòng tổng là tỷ lệ của các tổng chứ không phải tổng các tỷ lệ; chia cho 0 hoặc trống cho ô trống;
- gõ sai thì báo ngay dưới ô công thức kèm vị trí; biểu đồ chờ đến khi công thức hợp lệ.

### Ma trận nhiều cấp
Kéo nhiều trường vào ô **Hàng** (vd Khu vực → Kênh → Nhóm) và một hoặc nhiều trường vào ô **Cột** (vd Tháng). Ma trận hiện cấp 1; mỗi dòng cha mang tổng phụ của cấp đó cho từng cột, nhấn **⊞** để mở cấp dưới, **⊟** để thu; hai nút ở góc trên trái **mở tất cả / thu tất cả**. Tùy chọn **Số cấp mở sẵn** chọn người xem thấy sẵn mấy cấp. Tổng phụ, tổng hàng, tổng cột và tổng chung đều do nguồn dữ liệu tính trong cùng câu lệnh, nên phép tính (tỷ lệ) ở dòng cha là tỷ lệ của các tổng, và mở / thu không truy vấn lại. Giới hạn dòng áp lên cấp chi tiết nhất: khi kết quả bị cắt, dòng cha vẫn đúng nhưng thiếu dòng con, hãy lọc bớt hoặc nâng giới hạn.

### Báo cáo nhiều trang
Dãy **trang** nằm trên thanh lọc. Người xem bấm tên trang để chuyển; địa chỉ trang web mang theo trang đang xem (`?page=…`) nên gửi link là mở đúng trang. Người soạn có các nút bên phải dãy trang: **Đổi tên**, **Nhân bản**, **Chuyển trái / phải**, **Xóa trang** (có xác nhận; trang cuối cùng không xóa được) và **Thêm trang**. Mỗi trang có biểu đồ và bố cục riêng; bảng điều khiển tạo trước khi có trang được đọc như một trang.

### Bộ lọc bảng điều khiển (slicer)
Thanh lọc nằm trên khung vẽ và áp dụng cho **mọi biểu đồ** trên bảng, như slicer của Power BI. Khi báo cáo có nhiều trang, mục *Phạm vi* của bộ lọc chọn **Cả báo cáo** (hiện ở mọi trang, giữ nguyên lựa chọn khi chuyển trang) hoặc **chỉ một trang**. Người có quyền *Thêm / sửa / xóa bộ lọc bảng điều khiển* (mặc định: Quản trị) nhấn **Thêm bộ lọc** và chọn một trong ba loại:

| Loại | Lọc gì | Cách áp dụng |
|---|---|---|
| Khoảng thời gian | một cột ngày | Hôm nay / 7 ngày / 30 ngày / tháng này / tháng trước / quý này / năm nay / tùy chọn từ–đến |
| Loại thời gian | cách nhóm ngày | mọi biểu đồ có trục thời gian chuyển sang năm / quý / tháng / tuần / ngày |
| Danh sách giá trị | một cột bất kỳ | giá trị riêng biệt đọc từ dữ liệu, "Tất cả" mặc định; chọn một hoặc nhiều |

Một bộ lọc theo cột áp dụng cho mọi biểu đồ **cùng nguồn dữ liệu** mà bảng / bộ dữ liệu của biểu đồ có cột cùng tên, nên không bao giờ sinh SQL lỗi. Giá trị đang chọn lúc **Lưu** là mặc định cho người xem; người xem đổi giá trị chỉ trong phiên của họ và nhấn **Về mặc định** để quay lại.

## 4. Người dùng & quyền
Phân quyền gồm hai lớp:

**Vai trò (RBAC)** — mỗi vai trò là một tập quyền; *Cài đặt → Vai trò & quyền* cho phép bật / tắt từng quyền cho vai trò và thêm vai trò mới. Ba vai trò có sẵn:

| Vai trò | Quyền mặc định |
|---|---|
| Chỉ xem (viewer) | xem bảng điều khiển |
| Biên tập (editor) | + tạo/sửa/xóa bảng điều khiển, xem và quản lý nguồn dữ liệu, bộ dữ liệu SQL, gợi ý AI |
| Quản trị (admin) | mọi quyền, luôn luôn (không tắt được): + bộ lọc bảng điều khiển, nhà cung cấp AI, người dùng, vai trò, chính sách |

**Chính sách truy cập (ABAC)** — *Cài đặt → Chính sách truy cập*: mỗi chính sách nói **ai** (vai trò và/hoặc thuộc tính người dùng, ví dụ `region = Hà Nội`), **cái gì** (bảng điều khiển hoặc nguồn dữ liệu, tất cả hoặc một danh sách), **hành động** nào (xem / sửa; truy vấn / quản lý) và **cho phép hay từ chối**. Thuộc tính của từng người dùng đặt ở *Cài đặt → Người dùng*.

Quy tắc quyết định: (1) từ chối luôn thắng; (2) khi một chính sách *cho phép* nêu đích danh một đối tượng, chỉ người khớp chính sách đó mới truy cập được đối tượng ấy; (3) còn lại, quyền của vai trò quyết định.

**Lọc dòng (row-level security)**: một chính sách cho phép trên nguồn dữ liệu có thể kèm điều kiện *cột = thuộc tính của người dùng* (vd. `region` = thuộc tính `region`). Mọi truy vấn của người đó trên nguồn ấy được thêm `WHERE region IN (…giá trị thuộc tính…)`; người không có thuộc tính sẽ không thấy dòng nào.

Giới hạn cần biết:
- **Quản trị viên đứng ngoài chính sách**: không chính sách nào chặn hay lọc dòng với admin, nên không ai tự khóa mình ra ngoài.
- Lọc dòng bảo vệ **người xem**. Ai có quyền *Quản lý bộ dữ liệu SQL* (và được *quản lý* nguồn đó) viết được SQL tùy ý trên nguồn, tức là đọc được toàn bộ; một bộ dữ liệu do họ viết cũng có thể "qua mặt" điều kiện dòng cho người xem (vd. gán cột `region` bằng hằng số). Chỉ trao quyền này cho người được phép thấy toàn bộ nguồn.
- Người **chỉ xem** bảng điều khiển chỉ truy vấn được các bảng / bộ dữ liệu mà một bảng điều khiển họ được xem đang dùng.
- Ai có *users.manage* / *roles.manage* nhưng không phải admin chỉ trao được những quyền chính họ đang có, không sửa được vai trò của mình hay của quản trị viên; quản trị viên cuối cùng không thể bị hạ cấp hay xóa.
- Nhân bản một bảng điều khiển tạo ra bản sao **không** nằm trong chính sách nêu đích danh bản gốc; hãy thêm bản sao vào chính sách nếu cần.

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
