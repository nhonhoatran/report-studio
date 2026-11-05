# Chức năng cần bổ sung để thay thế Power BI

Danh sách chức năng đúc kết từ lần dựng thử một báo cáo doanh số Power BI trên Report Studio (2026-11-05). Lần đó số liệu cộng dồn khớp hoàn toàn. Phần thiếu là các **khả năng chung** của công cụ, được liệt kê dưới đây ở dạng độc lập với báo cáo cụ thể để lên kế hoạch.

Mỗi chức năng gồm: mục tiêu · người dùng thao tác ra sao · yêu cầu · tiêu chí nghiệm thu · ngoài phạm vi · phụ thuộc · chỗ code liên quan (đã kiểm khi viết).

Ưu tiên: **P1** = thiếu thì không chuyển được báo cáo Power BI phổ biến · **P2** = dùng được nhưng khác xa Power BI · **P3** = nên có.

## Ràng buộc chung cho mọi chức năng

- Theo `CLAUDE.md` của repo:
  - UI ghép từ `web/src/components/ui/*`, giá trị lấy từ `web/src/styles/tokens.css`.
  - Chuỗi hiển thị qua `useT()`, có key ở cả `i18n/vi.ts` lẫn `i18n/en.ts`.
  - SQL lên nguồn dữ liệu chỉ chạy qua `server/src/query/executor.ts`.
  - Schema `definition` của dashboard phía server giữ dễ dãi (client sở hữu, có version).
  - Đọc `docs/ARCHITECTURE.md` trước khi đụng query builder hoặc editor store.
  - Kiểm tra cuối: `npm run typecheck`, `npm test`, `npm run build`.
- **Tính toán ở server**: gộp, lọc, sắp xếp, phân trang, tổng phụ đều chạy trong SQL. Client không kéo dữ liệu thô về để tự tính.
- **Không fix cứng giá trị nghiệp vụ**: ngưỡng, giới hạn, màu theo ngưỡng, số dòng... là tùy chọn của widget hoặc biến cấu hình. Trong code chỉ có giá trị mặc định.
- **Dễ dùng trước, dễ code sau**: mô tả và nghiệm thu từ góc nhìn người dùng. Cái gì suy ra được thì tự điền.
- **Tương thích ngược**: dashboard cũ không có trường mới vẫn mở và hiển thị y như trước.

## Tổng quan

| ID | Chức năng | Ưu tiên | Phụ thuộc |
|---|---|---|---|
| F1 | Đo lường tính toán (công thức trên các measure) | P1 | — |
| F2 | Tên hiển thị cho trường và measure | P1 | — |
| F3 | Báo cáo nhiều trang | P1 | — |
| F4 | Phép tính "% trên tổng" (tỷ trọng) | P1 | F1 |
| F5 | Ma trận nhiều cấp hàng, mở/thu, tổng phụ | P2 | — |
| F6 | Định dạng có điều kiện | P2 | — |
| F7 | Bộ lọc phụ thuộc nhau | P2 | — |
| F8 | Bộ lọc danh sách có tìm kiếm, không cắt cụt | P2 | — |
| F9 | Cache kết quả truy vấn | P2 | — |
| F10 | So sánh theo thời gian (kỳ trước, cùng kỳ, lũy kế) | P2 | F1 |
| F11 | Lọc chéo khi bấm vào visual, drill-down / drill-through | P2 | — |
| F12 | Xuất Excel / CSV / PDF, phân trang bảng | P2 | — |
| F13 | Biểu đồ kết hợp dùng chung trục | P3 | — |
| F14 | Top N kèm nhóm "Còn lại" | P3 | — |
| F15 | Bản đồ theo vùng | P3 | — |

---

## F1. Đo lường tính toán — P1

**Mục tiêu:** hiển thị chỉ số là phép tính giữa các tổng, vd tỷ lệ lãi gộp = tổng lãi gộp / tổng doanh số, tiến độ = tổng thực hiện / tổng kế hoạch. Chỉ số kiểu này không thể tính sẵn từng dòng rồi cộng lại: cộng các tỷ lệ cho ra kết quả sai.

**Người dùng:** trong ô *Giá trị* bấm "Thêm phép tính" → đặt tên → chọn các measure đã có và phép toán (`+ − × ÷`, hằng số, ngoặc) → chọn định dạng (số, %, tiền) → thấy kết quả ngay trên visual, ở cả dòng chi tiết lẫn dòng tổng.

**Yêu cầu:**
- Một measure kiểu `formula`: biểu thức trên các measure gộp khác của cùng widget (`sum`, `avg`, `count`... của các cột).
- Tính **sau** GROUP BY, trong SQL, để dòng tổng và tổng phụ (F5) đúng theo định nghĩa: tỷ lệ của các tổng, không phải tổng các tỷ lệ.
- Biểu thức được kiểm tra và dựng thành SQL có tham số. Không ghép chuỗi người dùng nhập vào SQL.
- **Chia cho 0 hoặc NULL thì trả về trống**, không ra lỗi, không ra vô cực.
- Dùng được trên mọi visual nhận measure: bảng, ma trận, thẻ, KPI, biểu đồ.
- Bản đầu có thể lưu theo widget. Lưu dùng lại theo dataset để sau, vì ROADMAP 0.5 có "calculated fields" ở mức cột, là chuyện khác.

**Nghiệm thu:**
- Bảng có `sum(a)`, `sum(b)` và công thức `sum(a)/sum(b)` dạng %: dòng tổng bằng tổng a chia tổng b.
- Dòng có b = 0 thì ô công thức trống.
- Biểu thức sai thì báo lỗi ngay trong ô nhập, nói rõ sai chỗ nào.
- Sắp xếp được theo cột công thức.
- Có unit test cho phần dựng SQL và kiểm tra biểu thức.

**Ngoài phạm vi:** ngôn ngữ biểu thức đầy đủ kiểu DAX, hàm thời gian (để F10).

**Code liên quan:** `server/src/query/types.ts` (`AGGREGATIONS`, `measureSchema`), `server/src/query/builder.ts` (`buildSelect`), `web/src/components/editor/VisualPane.tsx`, `web/src/components/charts/shape.ts`.

## F2. Tên hiển thị cho trường và measure — P1

**Mục tiêu:** tiêu đề cột, chú giải, nhãn thẻ hiện tên nghiệp vụ ("Doanh số") thay vì tên kỹ thuật ("Sum doanh_so").

**Người dùng:** bấm vào một trường trong ô *Trục / Hàng / Giá trị* → đổi tên → mọi chỗ hiển thị đổi theo. Xóa tên thì quay về tên tự sinh.

**Yêu cầu:**
- Thêm `label` tùy chọn cho dimension và measure trong widget.
- `columnLabel` / `measureLabel` dùng `label` nếu có.
- Áp cho bảng, ma trận, thẻ, KPI, chú giải, tooltip, trục.

**Nghiệm thu:** đặt tên thì hiện tên đó ở mọi visual, kể cả sau khi lưu và mở lại. Dashboard cũ hiển thị như trước.

**Code liên quan:** `web/src/components/charts/shape.ts:25-45`, `web/src/api/types.ts` (`Dimension`, `Measure`), `VisualPane.tsx`.

## F3. Báo cáo nhiều trang — P1

**Mục tiêu:** một báo cáo gồm nhiều trang (tổng quan, theo sản phẩm, theo khu vực...), có danh mục trang để chuyển qua lại, bộ lọc chung giữ nguyên khi chuyển trang.

**Người dùng:**
- Người xem: thấy danh mục trang (bên trái hoặc dạng tab) → bấm trang → nội dung đổi, các lựa chọn bộ lọc chung vẫn giữ.
- Người soạn: thêm / đổi tên / sắp xếp / nhân bản / xóa trang (xóa có xác nhận).

**Yêu cầu:**
- `definition` có danh sách trang, mỗi trang có widgets và layout riêng.
- Bộ lọc chọn được phạm vi: cả báo cáo hoặc chỉ một trang.
- URL chứa trang đang xem, để gửi link đúng trang.
- Dashboard cũ (không có trang) tự hiểu là một trang.
- Phân quyền giữ ở mức dashboard như hiện tại.

**Nghiệm thu:**
- Tạo báo cáo 3 trang, đặt bộ lọc chung ở trang 1, chuyển sang trang 2 thì vẫn áp.
- Mở link có trang thì vào đúng trang đó.
- Dashboard cũ mở bình thường.
- Trên điện thoại danh mục trang vẫn dùng được.

**Code liên quan:** `web/src/api/types.ts` (`DashboardDefinition`), `web/src/store/editor.ts`, `web/src/pages/DashboardEditorPage.tsx`, `server/src/routes/dashboards.ts`.

## F4. Phép tính "% trên tổng" (tỷ trọng) — P1

**Mục tiêu:** hiện mỗi dòng chiếm bao nhiêu % so với tổng chung hoặc tổng của nhóm cha.

**Người dùng:** trên một measure chọn "Hiển thị dưới dạng → % trên tổng chung / % trên tổng nhóm cha / % trên tổng cột".

**Yêu cầu:** tính ở server (window function `SUM() OVER (...)` hoặc truy vấn tổng riêng). Dùng chung cơ chế với F1 và F5.

**Nghiệm thu:** các dòng của một nhóm cộng lại bằng 100%. Đổi bộ lọc thì % tính lại theo dữ liệu đã lọc.

**Phụ thuộc:** F1 (định dạng, xử lý chia 0). Nên làm cùng hoặc sau F5 để có "tổng nhóm cha".

## F5. Ma trận nhiều cấp hàng, mở/thu, tổng phụ — P2

**Mục tiêu:** ma trận kiểu Power BI. Nhiều trường ở ô *Hàng* tạo cây (vd Kênh → Nhóm → Nhân viên), mỗi cấp có dòng tổng phụ, bấm ⊞ / ⊟ để mở / thu.

**Người dùng:** kéo nhiều trường vào ô *Hàng* → ma trận hiện cấp 1 kèm tổng phụ → bấm ⊞ để mở cấp dưới. Có nút "Mở tất cả / Thu tất cả". Người soạn chọn mặc định mở tới cấp nào.

**Yêu cầu:**
- Nhiều trường hàng, nhiều trường cột.
- Tổng phụ tính ở server (`WITH ROLLUP`, `GROUPING SETS` hoặc mỗi cấp một truy vấn), đúng cho cả measure công thức (F1).
- Dữ liệu lớn: chỉ tải cấp con khi mở, nếu cần.
- Thụt lề theo cấp, dòng tổng phụ nổi bật bằng token có sẵn.

**Nghiệm thu:**
- 3 cấp hàng: tổng phụ mỗi cấp bằng tổng các dòng con.
- Dòng tổng cuối khớp bảng phẳng cùng dữ liệu.
- Mở/thu không gọi lại server khi dữ liệu đã có.
- Cấu hình ma trận cũ (1 hàng × 1 cột) vẫn chạy.

**Code liên quan:** `web/src/lib/widget.ts` (`CHART_SPECS.matrix`, hiện `maxDimensions: 2`), `web/src/components/charts/Tables.tsx` (`Matrix`), `web/src/components/charts/shape.ts` (`pivot`), `server/src/query/builder.ts`.

## F6. Định dạng có điều kiện — P2

**Mục tiêu:** tô màu chữ hoặc nền ô theo giá trị (vd đạt ≥ 100% xanh, dưới 50% đỏ) để nhìn lướt là biết.

**Người dùng:** chọn measure → "Định dạng có điều kiện" → thêm quy tắc (điều kiện so sánh với ngưỡng → màu) hoặc chọn thang màu liên tục → xem trước ngay.

**Yêu cầu:**
- Quy tắc lưu trong `options` của widget. Ngưỡng do người soạn nhập.
- Màu chọn từ bảng màu theo token, không cho nhập mã màu tự do. Hiển thị đúng ở cả chế độ sáng lẫn tối.
- Áp cho bảng và ma trận. Tùy chọn áp cho dòng tổng.
- Không chỉ dựa vào màu: có thể kèm biểu tượng ▲ / ▼ để đọc được khi không phân biệt màu.

**Nghiệm thu:** đặt 2 quy tắc thì ô đổi màu đúng ngưỡng ở cả hai theme. Đổi bộ lọc thì màu cập nhật theo.

**Code liên quan:** `Tables.tsx` (đang có `dataBars`), `web/src/styles/tokens.css`.

## F7. Bộ lọc phụ thuộc nhau — P2

**Mục tiêu:** danh sách giá trị của một bộ lọc chỉ hiện những giá trị còn có dữ liệu theo các bộ lọc khác đang chọn.

**Người dùng:** chọn "Kênh = Bán buôn" thì danh sách "Nhóm" chỉ còn các nhóm của Bán buôn. Giá trị đang chọn mà không còn hợp lệ thì được báo, không âm thầm xóa.

**Yêu cầu:** khi đọc giá trị của một bộ lọc, gửi kèm các bộ lọc khác cùng nguồn (trừ chính nó). Có tùy chọn tắt theo từng bộ lọc.

**Nghiệm thu:** 3 bộ lọc lồng nhau thu hẹp đúng. Tắt tùy chọn thì về hành vi cũ.

**Code liên quan:** `web/src/components/editor/FilterBar.tsx:23` (hiện gửi `filters: []`), `web/src/lib/filters.ts`.

## F8. Bộ lọc danh sách có tìm kiếm, không cắt cụt — P2

**Mục tiêu:** chọn được giá trị trong danh sách hàng chục nghìn mục (mã hàng, khách hàng).

**Người dùng:** mở bộ lọc → gõ vài chữ → danh sách lọc theo từ khóa (tìm ở server, có debounce) → chọn một hoặc nhiều → thấy rõ "đã chọn N".

**Yêu cầu:**
- Tìm ở server (`contains`), trả theo trang.
- Bỏ giới hạn cố định trong code: số mục mỗi lần tải là biến cấu hình, có giá trị mặc định.
- Báo khi kết quả còn nhiều hơn số đang hiện.

**Nghiệm thu:** nguồn có hơn 10.000 giá trị vẫn tìm và chọn được bất kỳ giá trị nào. Không tải hết danh sách về trình duyệt.

**Code liên quan:** `web/src/components/editor/FilterBar.tsx:16` (`VALUE_LIMIT = 500` đang cố định).

## F9. Cache kết quả truy vấn — P2

**Mục tiêu:** trang nhiều visual mở nhanh. Đo khi thử: mỗi truy vấn trên dataset phức tạp mất khoảng 2,5 s, trang 7 visual + 3 bộ lọc mất khoảng 8–10 s.

**Yêu cầu:**
- Cache ở server theo SQL + tham số + nguồn. TTL cấu hình theo nguồn dữ liệu.
- Nút "Làm mới" bỏ qua cache. Hiện thời điểm dữ liệu.
- Bộ lọc dòng (row-level security) là một phần của khóa cache: hai người khác quyền không dùng chung kết quả.

**Nghiệm thu:** mở lại trong TTL thì không truy vấn nguồn. "Làm mới" thì truy vấn lại. Test xác nhận người khác bộ lọc dòng không nhận kết quả của nhau.

**Code liên quan:** `server/src/routes/query.ts`, `server/src/query/executor.ts` (hiện chỉ cache pool kết nối). ROADMAP 0.3.

## F10. So sánh theo thời gian — P2

**Mục tiêu:** so với kỳ trước, cùng kỳ năm trước, lũy kế từ đầu năm / đầu tháng, mức tăng giảm (%).

**Người dùng:** trên một measure chọn "So sánh với → kỳ trước / cùng kỳ năm trước", hoặc "Lũy kế → từ đầu năm". Kỳ tự suy ra từ bộ lọc khoảng thời gian và loại thời gian đang chọn.

**Yêu cầu:** tính ở server, dời khoảng ngày của bộ lọc. Dùng được trong bảng, ma trận, biểu đồ, không chỉ thẻ KPI.

**Nghiệm thu:** chọn tháng 10 thì "cùng kỳ năm trước" lấy tháng 10 năm trước. Kỳ trước không có dữ liệu thì để trống, không báo 0%.

**Phụ thuộc:** F1 (để tính % tăng giảm). Hiện chỉ thẻ KPI xu hướng có so với điểm liền trước (`web/src/components/charts/Cards.tsx:30-47`).

## F11. Lọc chéo và drill — P2

**Mục tiêu:** bấm một cột hoặc dòng thì các visual khác trên trang lọc theo. Đi sâu xuống cấp chi tiết hơn, hoặc mở bảng dòng gốc.

**Người dùng:** bấm cột "Bán buôn" thì các visual khác lọc theo và có chip "Đang lọc: Bán buôn ✕". Chuột phải → "Xem chi tiết" mở bảng dòng gốc.

**Yêu cầu:** lọc chéo là bộ lọc tạm của phiên, không lưu vào dashboard. Người soạn bật / tắt được theo visual.

**Nghiệm thu:** bấm thì lọc, bấm lại hoặc ✕ thì bỏ lọc. Drill-through tôn trọng bộ lọc dòng.

**Code liên quan:** `web/src/components/charts/ChartRenderer.tsx`, `web/src/store/editor.ts` (`filterValues`). ROADMAP 0.2.

## F12. Xuất dữ liệu, phân trang bảng — P2

**Mục tiêu:** xuất một visual ra CSV / Excel, cả trang ra PDF. Bảng lớn có phân trang.

**Yêu cầu:** xuất theo đúng bộ lọc đang áp. File Excel giữ số là số, không biến thành chữ. Phân trang và sắp xếp làm ở server. Giới hạn số dòng xuất là biến cấu hình.

**Nghiệm thu:** file xuất khớp số trên màn hình. Bảng hơn 10.000 dòng chuyển trang mượt.

**Code liên quan:** ROADMAP 0.3 (CSV, phân trang) và 0.4 (PDF / Excel).

## F13. Biểu đồ kết hợp dùng chung trục — P3

**Mục tiêu:** cột và đường cùng đơn vị (thực hiện và kế hoạch) vẽ trên một trục để so sánh đúng.

**Yêu cầu:** tùy chọn "Dùng chung trục Y" cho combo. Mặc định giữ như hiện tại.

**Code liên quan:** `web/src/components/charts/options.ts` (combo hiện luôn vẽ 2 trục).

## F14. Top N kèm nhóm "Còn lại" — P3

**Mục tiêu:** hiện N mục lớn nhất, phần còn lại gộp thành một dòng "Còn lại" để tổng vẫn đúng.

**Yêu cầu:** N là tùy chọn của widget. Tính ở server.

## F15. Bản đồ theo vùng — P3

**Mục tiêu:** tô màu tỉnh / vùng theo giá trị.

**Yêu cầu:** dữ liệu ranh giới tự host, không gọi dịch vụ bản đồ bên ngoài. Cách ghép tên vùng trong dữ liệu với ranh giới phải cấu hình được.

**Ghi chú:** trước khi plan, tìm thư viện hoặc bộ dữ liệu ranh giới có sẵn (kiểm license) thay vì tự vẽ.

---

## Phụ lục: lưu ý khi dựng dataset (không phải việc của app)

Ghi lại để người dựng báo cáo tránh lặp lỗi. Các mục này không cần sửa code app:

- **Nguồn trộn collation** (`utf8mb4_general_ci` lẫn `utf8mb4_unicode_ci`) thì JOIN báo `Illegal mix of collations`. Thêm `COLLATE ...` ở điều kiện JOIN trong SQL dataset.
- **Cột số có NULL** thì phép trừ ra NULL và tổng bị thiếu. Dùng `COALESCE(cot, 0)`.
- **Chỉ tiêu theo tháng gắn vào ngày đầu tháng**: lọc một phần tháng vẫn cộng đủ chỉ tiêu cả tháng, nên tỷ lệ đạt bị thấp. Dùng chỉ tiêu phân bổ theo ngày nếu nguồn có.
- **Thực hiện và chỉ tiêu khác độ chi tiết** (từng dòng hóa đơn với từng tháng × nhân viên): ghép bằng `UNION ALL` với cùng bộ cột chiều, cột không áp dụng thì để 0.
