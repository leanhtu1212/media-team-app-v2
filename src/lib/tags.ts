import type { Project, Tag, TagCtx } from '../types';
import { normalize } from './utils';

/* ================================================================
 * Model tag 3 cấp (thuần, không React — kpi.ts/sheets.ts/ics.ts import được):
 *   Cấp 1: Inhouse / Outsource → là `Project.projectType`, KHÔNG phải tag.
 *   Cấp 2 'loai': Ảnh, Video.
 *   Cấp 3 'mang': Ecom, Content, Trade, Brand.
 * Tag cấp 2 & 3 dùng chung cho CẢ inhouse lẫn outsource — "Ecom" chỉ là một mảng
 * mà đội inhouse hay đối tác outsource đều có thể sản xuất cho.
 * Daily Content cũng gắn tag Mảng (danh sách ngữ cảnh inhouse), KHÔNG có cấp riêng.
 * ================================================================ */

export type TagLevel = 'loai' | 'mang' | 'note' | '';

export const TAG_LEVELS: { value: Exclude<TagLevel, ''>; label: string; hint: string }[] = [
  { value: 'loai', label: 'Loại', hint: 'Ảnh, Video' },
  { value: 'mang', label: 'Mảng', hint: 'Ecom, Content, Trade, Brand' },
  { value: 'note', label: 'Ghi chú', hint: '' },
];

export const levelLabel = (l?: TagLevel) => TAG_LEVELS.find((x) => x.value === l)?.label || 'Dùng chung';

export const TAG_CTXS: { value: TagCtx; label: string }[] = [
  { value: 'inhouse', label: 'Inhouse' },
  { value: 'os-photo', label: 'Outsource · Ảnh' },
  { value: 'os-video', label: 'Outsource · Video' },
];
export const ctxLabel = (c: TagCtx) => TAG_CTXS.find((x) => x.value === c)?.label || c;

const ALL_CTX: TagCtx[] = ['inhouse', 'os-photo', 'os-video'];

/** Ngữ cảnh dùng được của 1 tag Mảng. Chưa khai báo (dữ liệu cũ) = dùng được mọi nơi. */
export function tagContexts(t?: Tag): TagCtx[] {
  const arr = (Array.isArray(t?.ctx) ? t!.ctx : []).filter((c) => ALL_CTX.includes(c));
  return arr.length ? arr : ALL_CTX;
}

/** Ngữ cảnh Mảng của dự án đang mở form: outsource còn phải biết đang làm Ảnh hay Video. */
export function mangContext(projectType: string | undefined, loaiTag?: Tag): TagCtx | undefined {
  if ((projectType || 'inhouse') !== 'outsource') return 'inhouse';
  const hint = photoVideoHint(loaiTag);
  return hint === 'video' ? 'os-video' : hint === 'photo' ? 'os-photo' : undefined;
}

/** Bộ tag chuẩn của 2 cấp dưới — nút "Tạo bộ tag chuẩn" ở Quản lý tag tạo những cái CÒN THIẾU. */
export const DEFAULT_TAGS: { name: string; color: string; level: 'loai' | 'mang'; ctx?: TagCtx[] }[] = [
  { name: 'Ảnh', color: '#6366f1', level: 'loai' },
  { name: 'Video', color: '#8b5cf6', level: 'loai' },
  // Mảng của dự án inhouse
  { name: 'Ecom', color: '#14b8a6', level: 'mang', ctx: ['inhouse'] },
  { name: 'Content', color: '#0ea5e9', level: 'mang', ctx: ['inhouse', 'os-video'] },
  { name: 'Trade', color: '#f59e0b', level: 'mang', ctx: ['inhouse'] },
  { name: 'Brand', color: '#f43f5e', level: 'mang', ctx: ['inhouse'] },
  // Mảng riêng của outsource
  { name: 'Nền trắng', color: '#94a3b8', level: 'mang', ctx: ['os-photo'] },
  { name: 'Flatlay', color: '#a855f7', level: 'mang', ctx: ['os-photo'] },
  { name: 'Model', color: '#ec4899', level: 'mang', ctx: ['os-photo', 'os-video'] },
  { name: 'Campaign', color: '#ef4444', level: 'mang', ctx: ['os-photo', 'os-video'] },
];

/**
 * Quy đổi `scope` trong Firestore (gồm cả 4 giá trị của bản cũ) → cấp hiện tại.
 * Nhờ hàm này không cần migrate dữ liệu: doc cũ scope 'ecom' tự hiểu là cấp Mảng.
 */
export function tagLevel(t?: Tag): TagLevel {
  switch (t?.scope) {
    case 'loai':
    case 'inhouse-photo':
    case 'inhouse-video':
      return 'loai';
    // Cấp 'content' cũ đã GỘP vào Mảng (2026-08): Daily Content dùng chung tag Mảng inhouse
    // với dự án, không còn nhóm riêng. Quy đổi lúc đọc nên không cần migrate doc cũ.
    case 'mang':
    case 'ecom':
    case 'outsource':
    case 'content':
      return 'mang';
    case 'note':
      return 'note';
    default:
      return '';
  }
}

type TaggedProject = Pick<Project, 'tagIds' | 'tagId'>;

/**
 * Danh sách tag của dự án — MỌI nơi phải đi qua đây, không đọc p.tagId/p.tagIds trực tiếp.
 * Đã có mảng thì dùng mảng (không trộn tagId cũ vào, không thì gỡ tag xong nó lại mọc lại).
 */
export function projectTagIds(p?: TaggedProject): string[] {
  if (!p) return [];
  // dedup: dữ liệu cũ có thể lặp id → bảng "Sản lượng theo tag" sẽ cộng đôi cùng một dòng
  const arr = Array.from(new Set((Array.isArray(p.tagIds) ? p.tagIds : []).filter(Boolean)));
  if (arr.length) return arr;
  return p.tagId ? [p.tagId] : [];
}

export const primaryTagId = (p?: TaggedProject): string | undefined => projectTagIds(p)[0];

/** Màu đại diện của dự án (chip lịch, thanh dự án) = tag đầu tiên tra được. */
export function projectTagColor(p: TaggedProject, tags: Tag[]): string | undefined {
  for (const id of projectTagIds(p)) {
    const c = tags.find((t) => t.id === id)?.color;
    if (c) return c;
  }
  return undefined;
}

/**
 * Đoán tag này là ảnh hay video — chỉ dùng cho icon .ics.
 * Gộp scope cũ 'inhouse-photo'/'inhouse-video' vào cùng cấp 'loai' làm mất phân biệt
 * ở tầng scope, nên đoán tiếp theo TÊN tag ("Ảnh"/"Video").
 */
export function photoVideoHint(t?: Tag): 'photo' | 'video' | undefined {
  if (t?.scope === 'inhouse-video') return 'video';
  if (t?.scope === 'inhouse-photo') return 'photo';
  const n = normalize(t?.name || '');
  if (/video|quay|clip|reel/.test(n)) return 'video';
  if (/anh|chup|hinh|photo/.test(n)) return 'photo';
  return undefined;
}
