# Daily Content: nhiều người dựng + định mức từng người — design

## Bối cảnh
Một nội dung (`DailyContent`) hiện chỉ gán được **một** người dựng (`editorId`, form ghi rõ
"Người dựng (chọn 1)"). Thực tế một nội dung 11 video hay được chia cho 2 editor cùng làm, cần
biết ai nhận bao nhiêu và ai đã trả cái nào.

**Phát hiện quan trọng — KPI không bị ảnh hưởng.** Sản lượng video content tính theo
`createdBy` của **báo cáo auto** (`contentVideoEntries()` trong `src/lib/kpi.ts`), tức người bấm
"Trả video", chứ không phải `editorId`. `editorId` chỉ là phân công/kế hoạch, phục vụ:
- bot báo deadline Lark (n8n) đọc field này để nêu tên người dựng;
- `contentOwnerId()` (`src/lib/utils.ts:116`) → lọc "việc của tôi" ở trang Tôi, Dashboard,
  DS Content, avatar trên card kanban/lịch.

Mỗi video đã trả **đã lưu sẵn** `ContentItem.addedBy` (uid người trả) — trang DS Content đã hiện
tên người trả, chỉ panel chi tiết nội dung là chưa render. Nên phần "hiện ai trả sản phẩm" là
việc hiển thị, không phải đổi dữ liệu.

## Phạm vi
Sửa `src/types/index.ts`, `src/lib/utils.ts`, `src/lib/actions.ts`, `src/pages/DailyContent.tsx`,
và các chỗ lọc theo người dựng (`Me.tsx`, `Dashboard.tsx`, `ContentList.tsx`).

**Không** đụng: `src/lib/kpi.ts` (KPI theo `report.createdBy`, không liên quan), `firestore.rules`
(update `dailyContent` đã mở cho `canEditDaily`, field mới không cần luật mới), luồng tạo báo cáo
auto, và bot n8n.

Không migrate dữ liệu cũ.

## Thay đổi

### 1. Data model (`src/types/index.ts`)
Theo đúng pattern `Project.tagIds`/`tagId` mà repo đang dùng cho dự án nhiều tag:

| Field | Vai trò |
|---|---|
| `editorIds?: string[]` | **Nguồn sự thật** — danh sách uid người dựng |
| `editorQty?: Record<string, number>` | Định mức từng người, key = uid. Chỉ ghi khi có ≥2 người |
| `editorId?: string` (đã có) | **Mirror** của `editorIds[0]` — giữ để n8n và doc cũ không gãy |

Doc cũ chỉ có `editorId` → helper quy đổi lúc đọc, không cần script migrate.

### 2. Helper (`src/lib/utils.ts`)
Thêm `contentEditorIds(d): string[]` — nguồn duy nhất để đọc danh sách người dựng:
- có `editorIds` không rỗng → trả nguyên mảng đó;
- không thì `editorId` → `[editorId]`;
- không nữa thì `assigneeId` → `[assigneeId]` (giữ nguyên fallback của `contentOwnerId` cho doc
  rất cũ);
- không có gì → `[]`.

`contentOwnerId()` **giữ nguyên**, đổi thân hàm thành `contentEditorIds(d)[0] || ''` để chỗ nào
chỉ cần 1 tên (avatar đơn) vẫn chạy. **Luật: không đọc `d.editorId` / `d.editorIds` trực tiếp,
luôn qua 2 helper này** — cùng luật đã áp cho `projectTagIds()`.

Thêm `editorProgress(d): { uid: string; done: number; quota?: number }[]` — tiến độ từng người:
- mỗi uid trong `contentEditorIds(d)`: `done` = số `items` có `done === true` và
  `addedBy === uid`; `quota` = `editorQty[uid]` (undefined khi chỉ có 1 người dựng);
- **cộng thêm** một dòng cho mỗi uid xuất hiện ở `items[].addedBy` mà **không** nằm trong danh
  sách người dựng (admin trả hộ), `quota: undefined` — để tổng `done` các dòng luôn bằng tổng
  video đã trả, không "thất lạc" cái nào;
- thứ tự: người dựng theo thứ tự `editorIds`, rồi tới người ngoài danh sách.

### 3. Ghi Firestore (`src/lib/actions.ts`)
`createDailyContent` là **whitelist field** — phải thêm `editorIds` và `editorQty` vào đó, quên là
chọn xong lưu bị rơi mất **im lặng** (đúng con bug đã xảy ra với `contentFormat`, xem comment tại
`actions.ts:424`).

Cả create lẫn update đều ghi `editorId = editorIds[0] || ''` làm mirror. Khi chỉ có ≤1 người dựng
thì ghi `editorQty: {}` (không để lại định mức cũ lởm khởm sau khi bỏ bớt người).

### 4. Form "Nội dung mới / Sửa nội dung" (`DailyContent.tsx:1983`)
- Nhãn bỏ "(chọn 1)" → **"Người dựng"**. Bấm chip để bật/tắt, chọn được nhiều người.
- **1 người**: giao diện y hệt hiện tại, không có ô định mức, không có dòng trạng thái.
- **≥2 người**: mỗi chip kèm một ô số (`type=number`, `min=0`) ngay cạnh.
  - Khi người thứ 2 được chọn lần đầu: **tự chia đều** tổng `quantity` (11 → 6/5, phần dư dồn cho
    người đầu), sau đó người dùng sửa tuỳ ý. Không tự chia lại nữa ở các lần chọn sau — tránh
    ghi đè số người dùng vừa gõ.
  - Bỏ chọn một người thì xoá luôn định mức của người đó.
- Dòng trạng thái ngay dưới danh sách chip: `Đã chia 11/11` (xanh) hoặc `Đã chia 9/11 — còn 2` /
  `thừa 2` (vàng). Sửa ô "Số lượng" sau khi đã chia thì dòng này tự tính lại; app **không** tự
  chia lại định mức (không ghi đè số người dùng đã gõ), người dùng tự chỉnh cho khớp.
- **Guard trong hàm submit** (theo quy ước repo: guard đặt trong submit, không chỉ disable nút):
  khi có ≥2 người dựng mà tổng định mức ≠ `quantity` → chặn lưu, toast nêu rõ thiếu/thừa bao
  nhiêu. Ô "Số lượng" tổng vẫn nhập tay như cũ và là con số chủ.

### 5. Panel "Thông tin nội dung" (`DailyContent.tsx:1856`)
Mục NGƯỜI DỰNG từ một chip đơn → danh sách, mỗi dòng: avatar + tên + tiến độ.
- Có định mức: `Quang 4/6`.
- Không có định mức (chỉ 1 người dựng): `Quang 4` — chỉ số đã trả, không bịa mẫu số.
- Người ngoài danh sách: `Uyên 1 · ngoài định mức`.
- Không có người dựng nào: giữ nguyên `Chưa gán`.

### 6. Dòng video đã trả (danh sách video con)
Mỗi dòng thêm avatar + tên người trả (`addedBy` → member), đặt cạnh ngày trả. Dùng lại cách
`ContentList.tsx:244` đang hiển thị. `addedBy` rỗng (dữ liệu cũ) → không hiện gì, không hiện
"Không rõ".

### 7. Card kanban / lịch (`DailyContent.tsx:375`)
Prop `editor` (một người) → danh sách người dựng, hiện **chồng avatar** (tối đa 3, dư thì `+N`),
tooltip liệt kê đủ tên. Không hiện định mức trên card.

### 8. Các chỗ khác đang đọc người dựng
- **Lọc** — `Me.tsx:64` và `Me.tsx:97`: đổi `isMine(contentOwnerId(d))` thành
  `contentEditorIds(d).some(isMine)` để "nội dung của tôi" khớp **bất kỳ** người dựng nào.
- **Hiển thị** — `Dashboard.tsx:193` và `ContentList.tsx:222`: hiện chồng avatar như mục 7.

## Không làm
- **Bot Lark n8n** đọc `editorId` nên chỉ nêu được **người đầu tiên**. App không gãy, tin nhắn
  Lark chỉ thiếu tên người thứ hai. Sửa bot là việc riêng bên n8n, để lần sau.
- Không gán tay từng video cho từng người khi trả — người bấm "Trả video" vẫn là người được ghi
  công (`addedBy` + `report.createdBy`), giữ nguyên luồng và giữ nguyên cách KPI ghi công.
- Không đụng KPI, không đụng `firestore.rules`, không viết script migrate.

## Test
Hàm thuần trong `src/lib/` nên có test kèm (`src/lib/utils.test.ts`), theo quy ước repo:
- `contentEditorIds`: doc mới (`editorIds`), doc cũ (`editorId`), doc rất cũ (`assigneeId`), doc
  rỗng; `editorIds` rỗng phải rơi về `editorId` chứ không trả `[]`.
- `editorProgress`: đếm đúng theo `addedBy`; video chưa `done` không tính; người ngoài danh sách
  ra dòng riêng không có `quota`; tổng `done` các dòng = tổng video đã trả.
- Guard tổng định mức: đủ / thiếu / thừa.

Component React chưa có hạ tầng test — phần UI kiểm bằng tay trên `npx vite --port 5199`.
