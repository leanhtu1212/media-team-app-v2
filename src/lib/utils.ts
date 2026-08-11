export const MAIN_TEAM_ID = 'MEDIA_TEAM_01';

export const ADMIN_EMAILS = ['leanhtu1212@gmail.com', 'admin@production.team'];

export function genId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return localDateStr(new Date());
}

/** Chuyển createdAt (Firestore Timestamp / Date / số / chuỗi) → Date (giờ local). */
export function tsToDate(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts === 'string') return new Date(ts);
  const o = ts as { toDate?: () => Date; seconds?: number };
  if (typeof o.toDate === 'function') return o.toDate();
  if (typeof o.seconds === 'number') return new Date(o.seconds * 1000);
  return null;
}

/** Chuyển createdAt (Firestore Timestamp / Date / số / chuỗi) → 'YYYY-MM-DD' theo giờ local. */
export function tsToDateStr(ts: unknown): string | null {
  if (typeof ts === 'string') return ts.slice(0, 10) || null;
  const d = tsToDate(ts);
  return d ? localDateStr(d) : null;
}

/** 'HH:mm · dd/MM/yyyy' từ Firestore Timestamp; rỗng nếu không có. */
export function formatDateTime(ts: unknown): string {
  const d = tsToDate(ts);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function currentMonth(): string {
  return todayStr().slice(0, 7);
}

export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

export function formatVND(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
}

export function formatDate(d?: string): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/**
 * Dự án THUỘC tháng nào: theo `deadline`, không có thì lấy `createdAt`. Trả 'YYYY-MM'.
 * Dùng tsToDateStr (giờ local) để không lệch tháng ở mốc đầu/cuối tháng theo UTC.
 * Dashboard và khối "Video cần làm trong tháng" phải dùng CHUNG hàm này, không thì hai nơi
 * gom dự án theo hai kiểu khác nhau.
 */
export function projectMonth(p: { deadline?: string; createdAt?: unknown }): string {
  return p.deadline ? p.deadline.slice(0, 7) : (tsToDateStr(p.createdAt)?.slice(0, 7) || '');
}

/** "done" hoặc "payment" đều coi là đã xong sản xuất — dùng cho các chỗ tính overdue/active/KPI. */
export function isProjectFinished(status: string): boolean {
  return status === 'done' || status === 'payment';
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Vietnamese month label, e.g. "Tháng 7, 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `Tháng ${Number(m)}, ${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ngày nghỉ của công ty: Chủ nhật hàng tuần + thứ 7 nghỉ cách tuần.
 * Thứ 7 tính THEO TỪNG THÁNG, không chạy liên tục theo mốc: thứ 7 thứ NHẤT của tháng nghỉ,
 * thứ 7 thứ hai đi làm, thứ ba nghỉ… (thứ 7 lẻ = nghỉ, chẵn = đi làm).
 * Hệ quả có chủ đích: chu kỳ reset đầu tháng nên đôi khi có 2 thứ 7 nghỉ liền nhau
 * (thứ 7 cuối tháng này lẻ, thứ 7 đầu tháng sau lại là thứ nhất).
 */
export function isDayOff(dateStr: string): boolean {
  const d = new Date(`${dateStr}T00:00:00`);
  const wd = d.getDay(); // 0=CN … 6=T7
  if (wd === 0) return true; // Chủ nhật luôn nghỉ
  if (wd !== 6) return false; // chỉ còn xét thứ 7
  const nth = Math.floor((d.getDate() - 1) / 7) + 1; // thứ 7 thứ mấy trong tháng
  return nth % 2 === 1;
}
