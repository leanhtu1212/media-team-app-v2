# DS Content: gộp thêm link ảnh sản phẩm — design

## Bối cảnh
Trang "DS Content" (`src/pages/ContentList.tsx`, view `contentlist`, chỉ admin + role `content`)
hiện chỉ gom **video**: daily content + dự án có task `category === 'video'`. Bên content cũng
cần biết dự án/task nào đã có **link ảnh sản phẩm** (album ảnh thành phẩm) để lấy ảnh dùng cho
content, không chỉ video.

## Phạm vi
Chỉ sửa `src/pages/ContentList.tsx`. Không đổi `types/index.ts`, không đổi Firestore, không đổi
`firestore.rules` — `Project.photoLink` và `Task.link`/`Task.used` (mọi category) đã có sẵn.
Tab "Nội dung" (daily content) giữ nguyên 100%, không đổi gì.

## Thay đổi

### 1. Điều kiện một dự án xuất hiện ở tab "Dự án" (mở rộng, OR với điều kiện cũ)
Dự án `p` được đưa vào danh sách nếu có **ít nhất một** trong:
- có task `category === 'video'` (bất kể đã có `link` hay chưa — giữ nguyên hành vi cũ, kể cả
  task video chưa có link vẫn hiện để content biết đang chờ);
- có `p.photoLink` (link ảnh sản phẩm của dự án);
- có task `category === 'photo'` mà `link` đã được dán.

### 2. Danh sách hạng mục trong thẻ dự án
Thẻ dự án hiện các dòng theo thứ tự:
1. **Link ảnh dự án** (nếu có `photoLink`) — dòng riêng ở đầu, có nhãn "Link ảnh dự án" phân
   biệt với các dòng bên dưới, bấm mở tab mới. **Không có ô tick** "đã dùng" (không đụng field
   mới ở cấp dự án).
2. Các **task** (video như cũ + thêm task ảnh có `link`), sắp xếp theo `videoDate` giảm dần như
   hiện tại. Mỗi dòng có badge nhỏ phân biệt Ảnh/Video (dựa `t.category`). Ô tick "đã dùng" dùng
   chung `setTaskUsed` cho cả hai loại (rules đã cho phép ghi `used/usedDate/usedBy` trên mọi
   task, không phân biệt category).

Task ảnh **chưa có link** không hiện trong danh sách con (khác task video, vốn hiện cả khi chưa
có link) — vì tiêu chí đưa task ảnh vào là "đã có link", nên task ảnh chưa có link không có gì
để hiện.

### 3. Số liệu hiển thị trên thẻ
- Góc phải thẻ dự án: tách `N video · M ảnh` (đếm theo `quantity`, giữ cách tính tổng số lượng
  hiện tại `reduce quantity`), dòng dưới `usedN/total đã dùng` tính trên toàn bộ hạng mục (task
  video + task ảnh có link), không tính dòng photoLink (không có trạng thái dùng/chưa dùng).
- Thống kê đầu trang (`stats.total/used`) cộng thêm task ảnh có link vào tổng.

### 4. Tìm kiếm
Chuỗi khớp không dấu của thẻ dự án bổ sung `p.photoLink` và tên/link của các task ảnh có link
(đang chỉ có tên/link task video).

### 5. Tab "Nội dung"
Không đổi gì — vẫn hiện mọi daily content như hiện tại, không lọc theo link.

## Không làm
- Không thêm field `used` cấp dự án cho `photoLink`.
- Không đổi cách tính KPI/sản lượng — trang này chỉ là danh sách tham khảo cho content, tách
  biệt hoàn toàn với KPI (đúng nguyên tắc đã có trong `CLAUDE.md` mục 8bis).
- Không đổi hành vi task video hiện có (vẫn hiện cả khi chưa có link).
