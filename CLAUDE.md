# Media Team App v2 — Context cho AI

## Tổng quan
SPA quản lý team media (2–5 người, tiếng Việt) được **build lại từ app cũ** tại `/Users/tule/Downloads/media-team-manager (3)` (App.tsx 7.400 dòng, có Express server — KHÔNG đụng vào folder cũ). App v2 là SPA thuần, deploy tĩnh (Mắt Bão/Plesk chỉ cần upload `dist/`), dùng **chung Firebase backend với app cũ** để giữ nguyên dữ liệu.

## Stack & chạy dev
- Vite + React 19 + TypeScript + Tailwind v4 (`@theme` tokens trong `src/index.css`), lucide-react, date-fns. Không UI lib nặng, không router (chuyển view bằng state trong `App.tsx`).
- Dev: `npx vite --port 5199` (preview panel của Claude bị macOS chặn quyền Downloads — chạy qua Bash). Build: `npm run build`. Type-check: `npx tsc --noEmit`.
- Deploy 2 cách: (a) **tĩnh** — upload nội dung `dist/` lên httpdocs Plesk; (b) **container/Node app** (Mắt Bão App Platform, domain tinhgon.xyz) — có `server.mjs` (static server zero-dependency, SPA fallback, đọc `PORT` env) + `npm start` + `Dockerfile`. Deploy container phải build trước rồi start. Domain mới phải thêm vào Firebase Auth → Authorized domains, không thì login lỗi `auth/unauthorized-domain`.
- Font Be Vietnam Pro, dark theme kiểu Linear (bg `#0a0a0b`, surface `#131316`, accent indigo `#6366f1`).

## Firebase (QUAN TRỌNG)
- Project `gen-lang-client-0678978112`, config: `firebase-applet-config.json` (copy từ app cũ).
- **Custom Firestore DB id** `ai-studio-9933e878-0247-44cf-b7f0-e77cd2ac2eac` — mọi `getFirestore` PHẢI truyền id này (đã làm trong `src/lib/firebase.ts`), quên là trỏ vào DB rỗng.
- Team path: `teams/MEDIA_TEAM_01`. Subcollections: `members`, `projects`, `projects/{id}/tasks`, `reports`, `productTypes`, `dailyContent`.
- Auth: email/password; username tự thêm `@production.team`. Admin cứng: `leanhtu1212@gmail.com`, `admin@production.team`. Role lấy từ members doc (`admin|editor|viewer`).
- Firestore rules đã deploy sẵn (file `firestore.rules` bên app cũ) — app v2 phải hoạt động dưới rules đó.
- **Tương thích dữ liệu cũ bắt buộc**: giữ nguyên tên field/enum (projects.status `plan|pre-production|post-production|done`, tasks.category `photo|video|pre-production`, tasks.dntt, reports.reportType `manual|auto`, dailyContent.status `planned|in-progress|done|published`...). projectType cũ có thể là `photo`/`video` → mọi thứ không phải `outsource` coi là inhouse.

## Cấu trúc
```
src/
├── App.tsx            # auth gate + view switching (dashboard/projects/daily/reports/performance/settings)
├── lib/  firebase.ts, kpi.ts, sheets.ts, utils.ts, actions.ts (mọi ghi Firestore), points.ts (chỉ còn DEFAULT_PRODUCT_TYPES)
├── types/index.ts
├── store/AppDataContext.tsx  # onSnapshot tất cả collections (tasks qua collectionGroup không filter, lọc path client-side)
├── hooks/useToast.tsx
├── components/ui/index.tsx (Button, Modal, Badge, STATUS_BADGE/LABEL...), layout/Sidebar.tsx
└── pages/ Dashboard, Projects, ProjectDetail, DailyContent, Reports, Performance, Settings, Login
```

## Nghiệp vụ hiện tại (đã thay đổi nhiều so với app cũ!)
1. **HỆ THỐNG ĐIỂM ĐÃ GỠ BỎ HOÀN TOÀN** (không còn getPointsOfTask, Video Ecom KB, photoPoint/videoPoint trên UI). Field điểm cũ vẫn nằm trong Firestore nhưng không dùng.
2. **KPI = Sản lượng / 1 chỉ tiêu chung** (bỏ hẳn chất lượng 40% + kỷ luật 20%). Sản lượng tách 3 mục (`src/lib/kpi.ts`):
   - **Ảnh** = số project INHOUSE đạt đủ target ảnh (target=0 thì cần ≥1 ảnh xong)
   - **Video** = số lượng video INHOUSE
   - **Outsource** = số project outsource hoàn thành (đủ target hoặc status done, không kể số lượng)
   - DNTT chỉ hiển thị, KHÔNG tính KPI. Chỉ tiêu đặt ở Settings → KPI (field `kpiOutput` trên member).
3. **Task ảnh/video: thêm = xong luôn** (status completed ngay khi tạo, không có ô tích), tên task tự lấy tên project, chỉ nhập số lượng + ngày. Tạo task completed → tự tạo report `auto` (relatedTaskId/sourceReportId hai chiều); xoá task → xoá report liên kết. Pre-production giữ ô tích DNTT (admin duyệt → complete + auto-report).
4. **ProjectDetail có InfoPanel "Thông tin dự án"** (port từ bản cũ): Tình trạng hàng (`itemStatus`: chưa nhận/đã nhận/đang triển khai/đang sản xuất/đã hoàn thành/đã trả), cảnh báo lệch với status dự án + nút "Đưa về", mô tả edit inline (URL clickable qua Linkify), sản phẩm/deadline/loại, đổi status thì itemStatus tự map (plan→chưa nhận, pre-production→đang triển khai, post-production→đang sản xuất, done→đã hoàn thành).
5. **Tiền kỳ & chi phí (amount VND) + phân tích chi phí: admin only.**
6. Daily Content: mặc định **lịch tháng** (trước kanban), ô lịch to hiển thị title/platform/assignee, double-click ngày để tạo nội dung.
7. Reports: lịch tháng hiện trực tiếp "Tên: nội dung" trong ô ngày (xanh lá=thủ công, tím=tự động), click ngày ra panel chi tiết, export CSV.
8. Dashboard: 8 stat cards + phân bố trạng thái dự án (chỉ project trong tháng, theo deadline/createdAt) + deadline watchlist (còn/quá Nd) + xếp hạng KPI + báo cáo gần đây + content sắp đăng.
9. Performance (admin): delta cards vs tháng trước, bar chart project ảnh & video 6 tháng, line chart KPI trung bình, bảng KPI (cột: Project ảnh/Video/Outsource/DNTT/Sản lượng/KPI/So T.trước), drill-down thành viên, phân tích chi phí. Charts là SVG tự viết trong Performance.tsx.
10. **Google Sheets sync**: nút bấm thủ công ở Settings → Google Sheet. Client build payload (`src/lib/sheets.ts`) → POST text/plain tới Google Apps Script webhook (code mẫu + hướng dẫn: `apps-script/sync.gs`). URL lưu ở team doc field `sheetsWebhookUrl`. Không có server/cron.
11. UI labels: "Inhouse" (không dùng "Nội bộ"). Tab Inhouse/Outsource ở Projects được lift state lên App.tsx để không reset khi mở project.
12. **Kéo-thả kanban** (HTML5 DnD thuần, editor trở lên): kéo card dự án giữa các cột đổi status (itemStatus tự map qua `itemStatusFromProjectStatus` trong `src/lib/utils.ts` — dùng chung với ProjectDetail); kéo card Daily Content ở view kanban đổi status. Projects có ô tìm kiếm không dấu (normalize) theo tên/loại sản phẩm/mô tả.

## App cũ (tham khảo, không sửa)
- Repo GitHub `leanhtu1212/media-anna-manage`, deploy Mắt Bão/Plesk qua Passenger, entry `dist/index.cjs`, build esbuild CJS. Domain: annatoiyeu.info.vn.
