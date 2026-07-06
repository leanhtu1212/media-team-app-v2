import type { Project, Tag } from '../types';

/* ================================================================
 * Sinh chuỗi iCalendar (.ics) từ dữ liệu lịch → phục vụ subscription
 * feed cho Apple Calendar / Google Calendar (đồng bộ 1 chiều web→lịch).
 * Mọi sự kiện là "all-day" (VALUE=DATE) nên không dính timezone.
 * ================================================================ */

// Icon tiêu đề sự kiện — đổi ở đây nếu muốn ký hiệu khác.
const ICON_PHOTO = '📸'; // chụp ảnh (tag loại Inhouse·Ảnh)
const ICON_VIDEO = '🎥'; // quay video (tag loại Inhouse·Video)

/** Chọn icon theo loại tag; nếu tag không rõ loại thì đoán theo target ảnh/video. */
function iconFor(p: Project, tag?: Tag): string {
  if (tag?.scope === 'inhouse-video') return ICON_VIDEO;
  if (tag?.scope === 'inhouse-photo') return ICON_PHOTO;
  const hasVideo = (p.videoTarget || 0) > 0;
  const hasPhoto = (p.photoTarget || 0) > 0;
  if (hasVideo && !hasPhoto) return ICON_VIDEO;
  return ICON_PHOTO;
}

/** Escape text theo RFC 5545 (\, ; , và xuống dòng). */
function esc(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** "YYYY-MM-DD" → "YYYYMMDD". */
const dateBasic = (d: string) => d.replace(/-/g, '');

/** Cộng 1 ngày — DTEND của all-day event là exclusive nên phải +1. */
function nextDay(d: string): string {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Timestamp UTC dạng basic: 20260706T031500Z. */
function dtstamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

interface Ev { uid: string; start: string; end: string; summary: string; desc?: string }

function vevent(e: Ev): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${dtstamp()}`,
    `DTSTART;VALUE=DATE:${dateBasic(e.start)}`,
    `DTEND;VALUE=DATE:${dateBasic(nextDay(e.end))}`,
    `SUMMARY:${esc(e.summary)}`,
  ];
  if (e.desc) lines.push(`DESCRIPTION:${esc(e.desc)}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/**
 * Build .ics CHỈ gồm dự án Inhouse (loại trừ outsource, nội dung, ghi chú,
 * khoản chi phí). Mỗi dự án là 1 khối all-day từ ngày bắt đầu → deadline.
 * `tagOf(id)` (tuỳ chọn) trả về tag để chọn icon (chụp/quay) + ghi tên tag.
 */
export function buildInhouseICS(projects: Project[], tagOf?: (id?: string) => Tag | undefined): string {
  const events: Ev[] = projects
    .filter((p) => p.projectType !== 'outsource' && (p.deadline || p.startDate))
    .map((p) => {
      const start = p.startDate || p.deadline!;
      const end = p.deadline && p.deadline >= start ? p.deadline : start;
      const tag = tagOf?.(p.tagId);
      return {
        uid: `project-${p.id}@media-team`,
        start,
        end,
        summary: `${iconFor(p, tag)} ${p.title || 'Dự án'}${tag?.name ? ` · ${tag.name}` : ''}`,
        desc: `Inhouse${p.productType ? ' · ' + p.productType : ''}`,
      };
    });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Media Team//Lich Inhouse//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Media Team - Inhouse',
    'NAME:Media Team - Inhouse',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.map(vevent),
    'END:VCALENDAR',
  ].join('\r\n');
}

/** POST chuỗi .ics tới Apps Script để cache & phục vụ qua doGet. */
export async function pushICS(url: string, ics: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ type: 'ics', ics, syncedAt: new Date().toLocaleString('vi-VN') }) });
    try {
      const data = await res.json();
      if (data.ok) return { ok: true, message: '✅ Đã cập nhật feed lịch Apple' };
      return { ok: false, message: data.error || 'Webhook trả về lỗi' };
    } catch {
      return res.ok ? { ok: true, message: '✅ Đã gửi feed (không đọc được phản hồi)' } : { ok: false, message: `Lỗi HTTP ${res.status}` };
    }
  } catch (e: unknown) {
    return { ok: false, message: `Lỗi mạng: ${(e as Error).message}` };
  }
}
