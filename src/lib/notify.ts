/**
 * Thông báo tức thì (mọi thay đổi trong app) qua webhook tuỳ chỉnh — Apps Script Telegram
 * (xem apps-script/notify.gs) hoặc n8n Webhook node đẩy tiếp sang Lark/nơi khác, tuỳ team cấu hình.
 * Client chỉ POST text tới webhook — bot token nằm trong Apps Script, không lộ ra ngoài.
 *
 * Fire-and-forget: thông báo lỗi/không có mạng KHÔNG được làm hỏng thao tác chính,
 * nên notify() không await và nuốt mọi lỗi.
 */

let webhookUrl = '';

/** AppDataContext gọi mỗi khi team doc thay đổi (field notifyWebhookUrl). */
export function setNotifyWebhook(url?: string): void {
  webhookUrl = (url || '').trim();
}

/** Gửi 1 dòng thông báo tới webhook đang cấu hình. Không cấu hình → bỏ qua im lặng. */
export function notify(text: string): void {
  if (!webhookUrl || !text) return;
  // Không headers → text/plain → không dính CORS preflight (giống sheets.ts)
  fetch(webhookUrl, { method: 'POST', body: JSON.stringify({ type: 'notify', text }) }).catch(() => {});
}

/** Tên hiển thị từ tài khoản đăng nhập (username@production.team → username). */
export function displayName(user: { email?: string | null }): string {
  return (user.email || '').split('@')[0] || 'ai đó';
}

export interface DiffField<T> {
  key: keyof T;
  label: string;
  /** Định dạng 1 giá trị (cũ hoặc mới) để hiển thị. Mặc định: rỗng/undefined → "(trống)". */
  fmt?: (v: unknown) => string;
}

const defaultFmt = (v: unknown): string => (v === undefined || v === null || v === '' ? '(trống)' : String(v));

/**
 * So sánh object CŨ với patch SẮP GHI, trả về các dòng "Nhãn: cũ → mới" cho từng field
 * thực sự đổi (chỉ xét field có mặt trong patch — field không đụng tới thì bỏ qua).
 * Dùng để dựng nội dung thông báo "sửa từ gì thành gì" trong actions.ts.
 */
export function diffLines<T>(
  oldObj: T,
  patch: Partial<T>,
  fields: DiffField<T>[],
): string[] {
  const lines: string[] = [];
  for (const f of fields) {
    if (!(f.key in patch)) continue;
    const fmt = f.fmt || defaultFmt;
    const before = fmt(oldObj[f.key]);
    const after = fmt(patch[f.key]);
    if (before !== after) lines.push(`${f.label}: ${before} → ${after}`);
  }
  return lines;
}

/** Gửi thử từ Settings — có chờ kết quả để hiện toast. */
export async function sendTestNotify(url: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({ type: 'notify', text: '🔔 Test thông báo từ Media Team App — cấu hình thành công!' }),
  });
  try {
    const data = await res.json();
    return data.ok
      ? { ok: true, message: '✅ Đã gửi tin thử — kiểm tra group đã cấu hình' }
      : { ok: false, message: data.error || 'Webhook trả về lỗi không xác định' };
  } catch {
    return res.ok
      ? { ok: true, message: '✅ Đã gửi (không đọc được phản hồi) — kiểm tra group đã cấu hình' }
      : { ok: false, message: `Lỗi HTTP ${res.status}` };
  }
}
