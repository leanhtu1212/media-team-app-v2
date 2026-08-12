// Firestore data model — field names & enums MUST match legacy app exactly.

export type Role = 'admin' | 'editor' | 'viewer' | 'content';

export interface Member {
  id: string; // doc id = uid
  uid: string;
  email: string;
  username: string;
  password?: string; // DEPRECATED — không ghi mới (bảo mật). Doc cũ có thể còn field này.
  role: Role;
  title?: string;
  avatarUrl?: string;
  kpiOutput?: number; // target output points, default 100
  kpiQuality?: number; // target quality 0-10, default 10
  kpiDeadline?: number; // target deadline 0-10, default 10
  joinedAt?: unknown;
}

export type ProjectStatus = 'plan' | 'pre-production' | 'post-production' | 'done' | 'payment';
export type ProjectType = 'inhouse' | 'outsource';

export interface Project {
  id: string;
  title: string;
  description?: string;
  startDate?: string; // YYYY-MM-DD — ngày bắt đầu (vẽ thanh lịch từ đây → deadline)
  deadline?: string; // YYYY-MM-DD
  status: ProjectStatus;
  projectType?: ProjectType | string;
  productType?: string; // name from productTypes
  productCount?: number;
  photoTarget?: number;
  videoTarget?: number;
  photoLink?: string; // link album/thư mục ảnh của dự án
  photoPoint?: number; // default 1
  videoPoint?: number; // default 3
  qualityScore?: number; // 0-10 when done
  // Tag của dự án: `tagIds` là nguồn sự thật (thứ tự [Loại, Mảng, …dùng chung]).
  // `tagId` là field CŨ 1-tag, chỉ còn để đọc dữ liệu cũ + ghi mirror cho bundle cũ còn cache.
  // ĐỪNG đọc thẳng 2 field này ở UI — luôn qua projectTagIds() trong lib/tags.ts.
  tagIds?: string[];
  tagId?: string;
  assigneeIds?: string[]; // người phụ trách (1 hoặc nhiều) — lưu uid/member id
  createdAt?: unknown;
  createdBy?: string;
  // Thời điểm dự án chuyển sang 'done' — chỉ để sắp xếp danh sách "Đã hoàn thành".
  // Dự án done từ trước khi có field này thì rỗng → xếp theo deadline/createdAt.
  completedAt?: unknown;
}

export type TaskCategory = 'photo' | 'video' | 'pre-production';
export type TaskStatus = 'pending' | 'in-progress' | 'completed';

export interface Task {
  id: string;
  projectId: string;
  teamId?: string;
  title: string;
  description?: string; // mô tả thêm (dùng cho khoản chi phí tiền kỳ)
  category: TaskCategory;
  status: TaskStatus;
  quantity?: number;
  amount?: number; // VND, pre-production only
  difficulty?: number; // 1-5
  dntt?: boolean;
  link?: string; // link thành phẩm (ảnh/video), không bắt buộc
  deadline?: string;
  tagId?: string;
  hasKB?: boolean;
  images?: string[];
  reportDate?: string; // YYYY-MM-DD
  createdAt?: unknown;
  createdBy?: string;
  completedAt?: unknown;
  sourceReportId?: string;
  // "Đã sử dụng" — bên content tick ở trang DS Content khi đã đăng video này.
  // Không liên quan tới status/dntt của task, không ảnh hưởng tiến độ hay KPI.
  used?: boolean;
  usedDate?: string;
  usedBy?: string;
}

export type OutputType = 'none' | 'photo' | 'video' | 'pre-production';

export interface Report {
  id: string;
  content: string;
  reportDate: string;
  projectId?: string;
  quantity?: number;
  outputType?: OutputType;
  hasKB?: boolean;
  reportType?: 'manual' | 'auto';
  createdAt?: unknown;
  createdBy?: string;
  userEmail?: string;
  relatedTaskId?: string;
  relatedContentId?: string; // id daily content nguồn (báo cáo auto từ trả video content)
  link?: string; // link thành phẩm ảnh/video (nếu có)
}

export interface ProductType {
  id: string;
  name: string;
  points: number;
  category: string; // 'Ảnh' | 'Video' | 'Outsource'
  notes?: string;
}

export type DailyStatus = 'planned' | 'in-progress' | 'done';

/** Video con thuộc 1 content — 1 content có thể gồm nhiều video, tick xong từng cái.
 *  Lưu thẳng dạng mảng trên doc dailyContent (không cần subcollection). */
export interface ContentItem {
  id: string;
  title: string;
  done: boolean;
  link?: string; // link tham khảo/thành phẩm (không bắt buộc)
  doneDate?: string; // ngày trả video (YYYY-MM-DD), set khi done=true
  reportId?: string; // id báo cáo auto liên kết (xoá video → xoá báo cáo)
  addedBy?: string; // uid người thêm video (người được ghi công báo cáo)
  addedByEmail?: string;
  // ĐÃ SỬ DỤNG — hoàn toàn tách biệt với `done` (done = editor đã TRẢ video).
  // Chỉ tick/bỏ tick ở trang DS Content, không đụng tới tiến độ hay KPI.
  used?: boolean;
  usedDate?: string; // ngày đánh dấu đã dùng (YYYY-MM-DD)
  usedBy?: string;   // uid người đánh dấu
}

/**
 * Dạng content — KHÔNG phải tag, chỉ quy đổi sản lượng video:
 *   'full-video' (mặc định) 1 video trả = 1 video sản lượng
 *   'thumb-sub'             2 video trả = 1 video sản lượng (mỗi video = 0,5)
 * Doc cũ không có field này ⇒ hiểu là 'full-video', không cần migrate.
 */
export type ContentFormat = 'full-video' | 'thumb-sub';

export interface DailyContent {
  id: string;
  title: string;
  type: string; // Reels | Short | Viral / Trending | Brand Content | Lịch đăng
  platform: string; // Instagram | TikTok | Facebook | YouTube | Đa kênh
  assigneeId?: string;
  // Người DỰNG video (editor). Tách hẳn với assigneeId (bên content phụ trách nội dung) —
  // chọn ngay lúc tạo content để biết trước ai dựng, khác `ContentItem.addedBy` (chỉ có sau
  // khi video đã trả). Bot báo deadline Lark đọc field này để hiện tên người dựng.
  editorId?: string;
  orderDate?: string; // ngày order/đặt nội dung — mặc định là ngày thêm content
  dueDate?: string;
  notes?: string;
  points?: number;
  quantity?: number; // số lượng nội dung (mặc định 1)
  contentFormat?: ContentFormat; // dạng content — chỉ đổi hệ số quy đổi sản lượng, không phải tag
  items?: ContentItem[]; // danh sách video con; tiến độ = số video done / tổng
  status: DailyStatus;
  projectId?: string;
  tagId?: string;
  createdAt?: unknown;
  createdBy?: string;
}

/** Ghi chú tự do ghim vào 1 ngày trên lịch (collection teams/{id}/notes). */
export interface Note {
  id: string;
  text: string;    // nội dung ghi chú
  date: string;    // YYYY-MM-DD — ngày ghim
  tagId?: string;
  createdAt?: unknown;
  createdBy?: string;
}

/**
 * Cấp áp dụng của tag (field `scope` trong Firestore). Rỗng = dùng chung (hiện ở mọi form).
 * 3 giá trị GHI MỚI: 'loai' (Ảnh/Video) · 'mang' (Ecom/Content/Trade/Brand) · 'note'.
 * 5 giá trị LEGACY chỉ để ĐỌC doc cũ — đừng ghi mới, tagLevel() trong lib/tags.ts tự quy đổi.
 * ('content' là cấp riêng cho Daily Content thời trước, nay quy đổi thành 'mang'.)
 */
export type TagScope =
  | 'loai' | 'mang' | 'note'
  | 'content' | 'inhouse-photo' | 'inhouse-video' | 'ecom' | 'outsource';

/**
 * Ngữ cảnh dùng được của tag cấp Mảng — Mảng khác nhau theo loại dự án và Ảnh/Video:
 * inhouse (Ecom, Content, Trade, Brand) · outsource-Ảnh (Nền trắng, Flatlay…) · outsource-Video.
 * Tag Mảng không khai báo ctx (dữ liệu cũ) = dùng được ở MỌI ngữ cảnh.
 */
export type TagCtx = 'inhouse' | 'os-photo' | 'os-video';

/** Tag màu tuỳ chỉnh gán cho mục trên lịch (collection teams/{id}/tags). */
export interface Tag {
  id: string;
  name: string;
  color: string; // hex, vd "#f97316"
  scope?: TagScope; // cấp áp dụng; rỗng = dùng chung mọi nơi
  ctx?: TagCtx[]; // chỉ dùng cho tag cấp 'mang'
  createdAt?: unknown;
  createdBy?: string;
}

export interface TeamDoc {
  id: string;
  name?: string;
  sheetsWebhookUrl?: string;
  notifyWebhookUrl?: string; // webhook Apps Script gửi thông báo Telegram (apps-script/notify.gs)
  createdBy?: string;
}
