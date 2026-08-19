# Tab "Hợp đồng KOL/KOC" — tích hợp app D:\App vào media-team-app-v2

## Bối cảnh

`D:\App` là một ứng dụng Python (FastAPI + web tĩnh) chạy **local trên một máy**, dùng để
tạo Hợp đồng dịch vụ (HĐ) và Biên bản nghiệm thu (BBNT) `.docx` cho đối tác KOL/KOC, thay cho
việc chạy skill `lam-hd-bbnt` qua AI mỗi lần. Nó đọc sheet "Danh sách làm HĐ" qua OAuth cá nhân,
sinh file bằng `python-docx`, và copy file sang folder đối tác trên ổ `G:` (Google Drive for
Desktop mount) hoặc mở Explorer — toàn bộ đều là thao tác hệ điều hành trên máy đang chạy nó.

Yêu cầu: mang tính năng này vào `media-team-app-v2` (SPA React/Vite, không có backend riêng,
deploy tĩnh lên Plesk, dùng Firebase) thành **một tab dùng chung cho cả team qua web đã deploy**,
không chỉ chạy trên một máy.

## Quyết định đã chốt (qua trao đổi)

1. **Phạm vi dùng**: cả team, qua web đã deploy (annatoiyeu.info.vn) — không phải chỉ local.
2. **Phạm vi tính năng**: chỉ luồng chính "Từ Sheet → sửa thông tin → tạo file". Bỏ tab Dán nhanh,
   Dán hàng loạt, hộp chọn thư mục duyệt tuỳ ý, và nút mở Explorer (không có ý nghĩa trên web).
3. **Quyền**: chỉ admin (dữ liệu có CCCD, số tài khoản ngân hàng — nhạy cảm, giống cách chi phí dự
   án hiện đã admin-only).
4. **Backend cho phần cần Google**: dùng **Google Apps Script**, mở rộng đúng file
   `apps-script/sync.gs` đã có sẵn trong repo (dùng cho đồng bộ Sheet) — không dùng Firebase Cloud
   Functions (tránh phải nâng gói Blaze + tự tạo/chia sẻ service account).

## Kiến trúc

```
Trình duyệt (tab "Hợp đồng" trong SPA, admin-only)
├─ Đọc danh sách đối tác từ Sheet  ──GET──►   Apps Script webhook (mở rộng sync.gs)
├─ Sửa form, xem trước                         (thuần client)
├─ Sinh file .docx (HĐ + BBNT)                 (thuần client: TS + JSZip + DOMParser thao tác XML zip)
├─ Cắt ảnh chứng minh bằng <canvas>             (thuần client, thay Pillow)
├─ Tải file .docx về máy                       (Blob + <a download>, không cần backend)
└─ Copy lên Drive đối tác            ──POST──► Apps Script webhook (DriveApp: tìm/tạo folder, lưu file)

Firestore (project Firebase hiện có)
├─ teams/MEDIA_TEAM_01/contractPartners/{id}   — lịch sử đối tác (thay data/history.json)
└─ teams/MEDIA_TEAM_01.contractSettings        — cài đặt (thay data/settings.json)
```

**Lý do chọn kiến trúc này**: đã đọc toàn bộ `core/*.py` của D:\App. Việc sinh file `.docx`
(`docx_fill.py`, `docx_util.py`, `images.py`) chỉ là tìm-và-thay text bên trong XML của file zip —
`python-docx` chỉ là một wrapper mỏng quanh thao tác XML đó, không có gì phụ thuộc filesystem hay
OS. Thuật toán port thẳng sang TypeScript chạy **trong trình duyệt** được (JSZip để đọc/ghi zip,
`DOMParser`/`XMLSerializer` — API gốc của trình duyệt — để sửa `document.xml`). Nhờ vậy, phần việc
duy nhất bắt buộc phải có "ai đó ngoài trình duyệt" làm hộ là hai việc cần đăng nhập Google: đọc
Sheet và ghi vào Drive. Cả hai hợp với Apps Script — đúng mẫu đã dùng cho đồng bộ Sheet trong repo
này, chạy dưới tài khoản Google của người sở hữu script (đã có sẵn quyền Sheet/Drive), không tốn
phí, không cần tạo service account hay nâng gói Firebase.

## Các module port từ Python sang TypeScript (chạy client, trong `src/lib/contracts/`)

| File mới | Port từ | Ghi chú |
|---|---|---|
| `money.ts` | `core/money.py` | Đọc số thành chữ tiếng Việt, tính gross từ net. Thuật toán giữ nguyên 1:1. |
| `naming.ts` | `core/naming.py` | Số hợp đồng (`ddmmyy/HĐ/ALC-VT`), tên file, bỏ dấu/chuẩn hoá. |
| `banks.ts` | `core/banks.py` | Bảng tra cứu chuẩn hoá tên ngân hàng — copy nguyên bảng `DANH_SACH`. |
| `quickParse.ts` | `core/quick_parse.py` | Tách khối "Thông tin" (cột H của sheet) thành các trường form. Vẫn cần dù bỏ UI Dán nhanh, vì `sheet_sync` gọi nó để tách dữ liệu mỗi dòng sheet. |
| `compute.ts` | `core/compute.py` | Ráp dữ liệu form (validate, tính ngày HĐ/BBNT theo "ngày ký lùi", số HĐ). |
| `docxUtil.ts` | `core/docx_util.py` | Thao tác cấp thấp trên `w:p`/`w:r`/`w:t`: `ptext`, `replacePh`, `replaceAcrossRuns`, `findParagraph` — làm việc trực tiếp trên DOM XML thay vì object model của python-docx. |
| `docxFill.ts` | `core/docx_fill.py` + `core/images.py` | Điền toàn bộ placeholder `…`/`...`, tách file thành HĐ/BBNT (dựa vào nhãn đoạn "HDDV"/"BBNT"), chèn ảnh đã cắt vào ô "Hạng mục" cột 3 của bảng Điều 1 BBNT. |

**Rủi ro kỹ thuật cao nhất**: `docxFill.ts`, đặc biệt phần chèn ảnh (phải tự dựng XML
`<w:drawing>` + thêm media part + cập nhật `document.xml.rels`/`[Content_Types].xml` bằng tay, vì
không dùng thư viện tạo docx nào có sẵn API "chèn ảnh vào ô có sẵn"). Kế hoạch triển khai sẽ làm
phần này **trước tiên**, và đối chiếu output với các file `.docx` mà bản Python đã tạo sẵn (dùng
`tests/test_doi_chieu_skill.py` và `tests/test_docx_fill.py` của D:\App làm tài liệu tham chiếu
hành vi mong đợi, không chạy được trực tiếp vì khác ngôn ngữ).

Template file `assets/HDDV_BBNT_Mau_moi.docx` (~18KB) được copy vào
`src/assets/contracts/` của repo v2 và bundle theo app (không cần tải qua mạng).

## Apps Script — mở rộng `apps-script/sync.gs`

Thêm các hàm xử lý mới vào `doGet`/`doPost` hiện có (dựa trên `data.action`/query param), **không
đổi hành vi cũ** (đồng bộ Sheet báo cáo, feed iCal vẫn hoạt động y nguyên):

- `GET ?action=contract-list` → đọc sheet "Danh sách làm HĐ" (ID sheet + tên tab lấy từ
  `contractSettings`, gửi kèm trong query), trả JSON từng dòng đã tách sẵn (port
  `sheet_sync.doc_danh_sach` sang `SpreadsheetApp.getRange().getValues()`).
- `POST {action:'contract-drive-match', ten}` → tìm folder đối tác theo tên (ưu tiên khớp chính
  xác, fallback chứa chuỗi), ưu tiên folder tháng hiện tại (`T8 26`/`T8 2026`) nằm dưới thư mục
  gốc đã cấu hình — port `core/drive.py` (`do_folder`, `tim_folder_thang`) sang `DriveApp`.
- `POST {action:'contract-drive-copy', filename, base64, folderId?, ten?}` → nhận file `.docx` đã
  sinh sẵn từ trình duyệt (base64), decode thành `Blob`, lưu vào Drive: có `folderId` thì lưu
  thẳng, không thì tự tìm/tạo folder theo `ten` (dùng lại logic match ở trên). Trùng tên thì thêm
  hậu tố `(2)` như bản Python.

Vẫn giữ nguyên cách deploy đã ghi trong comment đầu file `sync.gs` (Deploy → New version, Execute
as Me, Anyone can access) — không cần bước cài đặt mới nào ngoài **Deploy lại version mới** sau khi
sửa code.

## Firestore

### `teams/MEDIA_TEAM_01/contractPartners/{id}`
Thay `data/history.json`. Field: `hoTen, xungHo, cccd, ngayCap, mst, diaChi, sdt, email, tenTk,
soTk, nganHang, soLan, lanCuoi`. Ghi đè khi tạo file thành công (giống `store.luu`), dùng cho
autocomplete khi gõ tên đối tác trùng lần trước.

### `teams/MEDIA_TEAM_01` — field `contractSettings`
Thay `data/settings.json`: `luiNgayKy(5), thueTNCN(0.10), thoiHanThanhToan(30),
baoTruocChamDut(5), ngayThanhLy(30), hangMucBbnt("Sản xuất hình ảnh"), anhRongInch(2.3),
sheetId, sheetTab("Thanh Toán"), thuMucGocDriveId, doSauDoFolder(2)`. Sửa trong chính tab mới,
không cần vào trang Cài đặt chung của app.

*Lưu ý*: `thuMucGocDriveId` là **Drive folder ID** (không phải đường dẫn ổ `G:` như bản Python),
vì Apps Script thao tác qua Drive API, không qua filesystem mount.

### Firestore rules
Thêm rule cho `contractPartners`: đọc/ghi chỉ khi `isAdmin(...)` (helper đã có sẵn trong
`firestore.rules`, dùng lại đúng pattern như phần chi phí dự án). `contractSettings` nằm trong doc
team hiện có nên thừa hưởng rule ghi team doc hiện tại — cần kiểm tra rule đó đã giới hạn admin hay
chưa, siết lại nếu chưa.

## UI

Trang mới `src/pages/Contracts.tsx`, view key `'contracts'`, thêm vào `View` type và `NAV` trong
`Sidebar.tsx` với `show: (a) => a.isAdmin`.

Một trang, **không chia 4 tab** như bản Python (vì đã bỏ Dán nhanh/Dán hàng loạt):

1. Mở trang → tự tải danh sách từ Sheet qua Apps Script (loading state, nút "Tải lại").
2. Danh sách thẻ đối tác (tên, nội dung việc, tiền, nhãn "người mới" nếu chưa có Link HĐ/BBNT).
3. Bấm thẻ → mở form sửa đầy đủ (autofill từ dòng sheet + đè bằng lịch sử Firestore nếu gõ trùng
   tên đối tác cũ, giống hành vi "gõ tên đối tác đã làm lần trước tự điền lại").
4. Ô ảnh chứng minh: kéo-thả hoặc dán ảnh, kéo chọn vùng cắt trên `<canvas>`.
5. Nút "Tạo & Tải file" → chạy `compute.ts` + `docxFill.ts` trong trình duyệt, tải 2 file `.docx`
   về máy ngay (không round-trip mạng nào).
6. Sau khi tạo xong, hiện nút "Copy lên Drive" → gọi Apps Script `contract-drive-match` (hiện
   đường dẫn tìm được, chờ xác nhận) rồi `contract-drive-copy`.
7. Lưu vào Firestore `contractPartners` sau khi tạo file thành công.

Bản xem trước "tô vàng chỗ đã điền" (`tao_ban_danh_dau` trong bản Python) là tính năng hay nhưng
không bắt buộc cho bản đầu tiên — có thể làm ở giai đoạn sau nếu còn thời gian.

## Việc rõ ràng bỏ qua so với `D:\App`

- Tab Dán nhanh, Dán hàng loạt (UI — logic `quickParse.ts` vẫn cần dùng nội bộ).
- Hộp chọn thư mục Drive tuỳ ý (`drive.duyet`, liệt kê ổ đĩa) — không có khái niệm "ổ đĩa" khi
  chạy qua Drive API.
- Nút "Mở thư mục" bằng Explorer (`subprocess.Popen(["explorer", ...])`) — không có ý nghĩa trên
  web, không thể thao tác filesystem máy người dùng.
- OAuth cá nhân từng máy (`scripts/dang_nhap_google.py`, `data/google-token.json`) — thay bằng tài
  khoản Google chạy Apps Script (dùng chung cho cả team qua webhook, không cần mỗi người tự đăng
  nhập Google riêng).

## Testing

- Unit test (Vitest hoặc test runner hiện có của repo — cần thêm nếu chưa có) cho `money.ts`,
  `naming.ts`, `banks.ts`, `quickParse.ts`, `compute.ts`: đối chiếu case cụ thể với output đã biết
  của bản Python (nhiều case đã có sẵn trong `D:\App\tests\test_money.py`,
  `test_naming.py`, `test_banks.py`, `test_quick_parse.py`, `test_compute.py` — dùng làm bảng
  input/expected-output tham khảo, viết lại test tương ứng bằng TS).
- `docxFill.ts`: test tạo file với dữ liệu mẫu, mở lại bằng JSZip để kiểm tra text các đoạn quan
  trọng (số HĐ, tên, tiền bằng chữ...) xuất hiện đúng chỗ, không còn `…`/`...` sót lại (port ý
  tưởng của `dem_placeholder_sot`). Không cần khớp byte-for-byte với file Python vì thư viện khác
  nhau, chỉ cần **đúng nội dung**.
- Test thủ công: mở file `.docx` sinh ra bằng Word/LibreOffice thật, kiểm tra định dạng không vỡ,
  ảnh hiển thị đúng.
- Apps Script: test thủ công qua Postman/curl sau khi deploy version mới (không có test tự động
  cho Apps Script, giống cách `sync.gs` hiện tại không có test).

## Rủi ro & điểm cần xác nhận thêm khi triển khai

1. **Chèn ảnh vào docx từ đầu (raw OOXML)** — rủi ro kỹ thuật lớn nhất, cần làm spike trước khi
   viết plan chi tiết cho phần còn lại.
2. **Google Sheets API quota qua Apps Script** khi nhiều admin cùng mở tab — Apps Script có quota
   theo ngày, nhưng tần suất dùng tính năng này (tạo HĐ) thấp nên không đáng lo.
3. **`thuMucGocDriveId`**: cần bạn xác định lại ID (hoặc URL) của thư mục gốc chứa các folder đối
   tác trên Drive thật (khác với đường dẫn ổ `G:` cũ) khi cấu hình `contractSettings` lần đầu.
