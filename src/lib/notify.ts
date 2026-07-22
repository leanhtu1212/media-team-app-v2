/**
 * Thông báo Telegram qua Apps Script webhook (xem apps-script/notify.gs).
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

/** Gửi 1 dòng thông báo vào group Telegram. Không cấu hình webhook → bỏ qua im lặng. */
export function notify(text: string): void {
  if (!webhookUrl || !text) return;
  // Không headers → text/plain → không dính CORS preflight (giống sheets.ts)
  fetch(webhookUrl, { method: 'POST', body: JSON.stringify({ type: 'notify', text }) }).catch(() => {});
}

/** Tên hiển thị từ tài khoản đăng nhập (username@production.team → username). */
export function displayName(user: { email?: string | null }): string {
  return (user.email || '').split('@')[0] || 'ai đó';
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
      ? { ok: true, message: '✅ Đã gửi tin thử — kiểm tra group Telegram' }
      : { ok: false, message: data.error || 'Webhook trả về lỗi không xác định' };
  } catch {
    return res.ok
      ? { ok: true, message: '✅ Đã gửi (không đọc được phản hồi) — kiểm tra group Telegram' }
      : { ok: false, message: `Lỗi HTTP ${res.status}` };
  }
}
