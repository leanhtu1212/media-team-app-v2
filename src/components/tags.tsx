import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { createTag, updateTag, deleteTag } from '../lib/actions';
import { useToast } from '../hooks/useToast';
import { Modal, Input, Select, Button, Field } from './ui';
import type { User } from '../lib/firebase';
import type { TagScope } from '../types';
import { TAG_LEVELS, TAG_CTXS, DEFAULT_TAGS, levelLabel, tagLevel, tagContexts, type TagLevel } from '../lib/tags';
import { normalize } from '../lib/utils';
import type { TagCtx } from '../types';

// Model cấp tag nằm ở lib/tags.ts (thuần, không React) — re-export cho tiện import ở UI.
export { TAG_LEVELS, levelLabel, tagLevel };
export type { TagLevel };

/** hex "#rrggbb" → "rgba(r,g,b,a)". Dùng để tô nền chip theo màu tag. */
export function hexA(hex: string, a: number): string {
  const h = (hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Ô chọn tag (đọc danh sách tag từ context). value = tagId, '' = không tag.
 * `level` lọc theo cấp: chỉ hiện tag đúng cấp + tag dùng chung (không gán cấp).
 * `clearable` = cho phép bỏ chọn (form dự án có 2 ô Loại/Mảng, mỗi ô đều bỏ trống được).
 * `autoSelect` = tự điền tag mặc định khi chưa chọn (ưu tiên tag đúng cấp).
 */
export function TagSelect({ value, onChange, level, autoSelect, clearable, ctx }: { value?: string; onChange: (id: string) => void; level?: TagLevel | TagLevel[]; autoSelect?: boolean; clearable?: boolean; ctx?: TagCtx }) {
  const { tags } = useAppData();
  const cur = tags.find((t) => t.id === value);
  const allowed = level ? (Array.isArray(level) ? level : [level]) : null;
  let list = allowed ? tags.filter((t) => !tagLevel(t) || allowed.includes(tagLevel(t))) : tags;
  // Tag Mảng còn lọc theo ngữ cảnh: inhouse / outsource-Ảnh / outsource-Video
  if (ctx) list = list.filter((t) => tagLevel(t) !== 'mang' || tagContexts(t).includes(ctx));
  // Giữ tag đang chọn hiển thị dù khác loại (vd đổi loại dự án sau khi đã gán tag)
  if (cur && !list.some((t) => t.id === cur.id)) list = [cur, ...list];

  // Tự điền tag mặc định: ưu tiên tag gán đúng cấp, chỉ dùng tag "dùng chung" khi không có tag cấp nào.
  useEffect(() => {
    if (!autoSelect || value) return;
    const pick = list.find((t) => tagLevel(t)) || list[0];
    if (pick) onChange(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect, value, tags]);

  // Ô đã lọc đúng 1 cấp (Loại/Mảng/Ghi chú) thì hậu tố "· Mảng" lặp lại ở mọi dòng, chỉ tốn chỗ —
  // nhãn của Field đã nói rõ đang chọn cấp nào. Chỉ ô không lọc mới cần ghi cấp để phân biệt.
  const showLevel = !allowed || allowed.length > 1;

  return (
    <div className="flex items-center gap-2">
      <span className="w-4 h-4 rounded-full shrink-0 border border-line" style={{ backgroundColor: cur?.color || 'transparent' }} />
      <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className="flex-1">
        <option value="" disabled={!clearable}>{clearable ? '— Không —' : '— Chọn tag —'}</option>
        {list.map((t) => <option key={t.id} value={t.id}>{t.name}{showLevel && tagLevel(t) ? ` · ${levelLabel(tagLevel(t))}` : ''}</option>)}
      </Select>
    </div>
  );
}

// Thứ tự nhóm trong modal quản lý — theo đúng phân cấp của hệ tag
const GROUPS: { level: TagLevel; label: string }[] = [
  { level: 'loai', label: 'Cấp 2 · Loại' },
  { level: 'mang', label: 'Cấp 3 · Mảng' },
  { level: 'note', label: 'Ghi chú' },
  { level: '', label: 'Dùng chung' },
];

/** Modal quản lý tag: tạo mới, đổi tên/màu, xoá. Chỉ editor/admin dùng. */
export function TagManagerModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const { tags } = useAppData();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#f97316');
  const [newLevel, setNewLevel] = useState<TagLevel>('');
  const [newCtx, setNewCtx] = useState<TagCtx[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const nameOf = (id: string, fallback: string) => (id in names ? names[id] : fallback);

  const commitName = async (id: string, fallback: string) => {
    const v = (names[id] ?? fallback).trim();
    if (!v || v === fallback) return;
    try { await updateTag(id, { name: v }); } catch (e: unknown) { toast(`Lỗi: ${(e as Error).message}`, 'error'); }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createTag({
        name,
        color: newColor,
        ...(newLevel ? { scope: newLevel as TagScope } : {}),
        ...(newLevel === 'mang' && newCtx.length ? { ctx: newCtx } : {}),
      }, user);
      setNewName('');
      setNewCtx([]);
      toast('Đã thêm tag');
    } catch (e: unknown) { toast(`Lỗi: ${(e as Error).message}`, 'error'); }
  };

  const del = async (id: string) => {
    try { await deleteTag(id); toast('Đã xoá tag'); } catch (e: unknown) { toast(`Lỗi: ${(e as Error).message}`, 'error'); }
  };

  // Bộ tag chuẩn (Loại: Ảnh/Video · Mảng: Ecom/Content/Trade/Brand) — chỉ tạo cái CÒN THIẾU,
  // so theo tên không dấu + đúng cấp nên bấm nhiều lần cũng không sinh tag trùng.
  const matchOf = (d: typeof DEFAULT_TAGS[number]) =>
    tags.find((t) => normalize(t.name) === normalize(d.name) && tagLevel(t) === d.level);
  const missing = DEFAULT_TAGS.filter((d) => !matchOf(d));
  // Tag chuẩn đã có nhưng chưa khai báo đúng ngữ cảnh (vd "Ecom" cũ đang hiện ở cả outsource)
  const needCtx = DEFAULT_TAGS.filter((d) => {
    const t = matchOf(d);
    if (!t || !d.ctx) return false;
    return [...(t.ctx || [])].sort().join() !== [...d.ctx].sort().join();
  });
  const [seeding, setSeeding] = useState(false);
  const seed = async () => {
    setSeeding(true);
    try {
      for (const d of missing) await createTag({ name: d.name, color: d.color, scope: d.level, ...(d.ctx ? { ctx: d.ctx } : {}) }, user);
      for (const d of needCtx) await updateTag(matchOf(d)!.id, { ctx: d.ctx });
      toast(`Đã tạo ${missing.length} tag, chỉnh ngữ cảnh ${needCtx.length} tag`);
    } catch (e: unknown) { toast(`Lỗi: ${(e as Error).message}`, 'error'); }
    setSeeding(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Quản lý tag màu" wide>
      <div className="space-y-4">
        {(missing.length > 0 || needCtx.length > 0) && (
          <div className="rounded-lg border border-accent/40 bg-accent/[0.07] p-3">
            <p className="text-sm font-bold mb-1">
              Bộ tag chuẩn: {missing.length > 0 && `thiếu ${missing.length}`}
              {missing.length > 0 && needCtx.length > 0 && ' · '}
              {needCtx.length > 0 && `${needCtx.length} tag sai ngữ cảnh`}
            </p>
            <p className="text-[11px] text-muted mb-2">
              Loại: Ảnh, Video · Mảng inhouse: Ecom, Content, Trade, Brand · Mảng outsource-Ảnh: Nền trắng, Flatlay, Model, Campaign · outsource-Video: Content, Model, Campaign
              {missing.length > 0 && <><br />Sẽ tạo: {missing.map((d) => d.name).join(', ')}</>}
              {needCtx.length > 0 && <><br />Sẽ chỉnh ngữ cảnh: {needCtx.map((d) => d.name).join(', ')}</>}
            </p>
            <Button onClick={seed} disabled={seeding}>{seeding ? 'Đang xử lý…' : 'Tạo bộ tag chuẩn'}</Button>
          </div>
        )}
        {tags.length === 0 && <p className="text-sm text-dim">Chưa có tag nào. Thêm tag đầu tiên bên dưới.</p>}
        {/* Nhóm theo CẤP để dễ soát: Loại → Mảng → Ghi chú → Dùng chung.
            Tag cấp 'content' cũ tự hiện trong nhóm Mảng (tagLevel quy đổi) — đã gộp. */}
        {GROUPS.map((g) => {
          const list = tags.filter((t) => tagLevel(t) === g.level).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
          if (list.length === 0) return null;
          return (
            <div key={g.level || 'shared'}>
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-dim">{g.label}</h4>
                <span className="text-[11px] text-dim">{list.length}</span>
                <div className="flex-1 h-px bg-line" />
              </div>
              <div className="space-y-1.5">
                {list.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                    <input
                      type="color"
                      value={t.color}
                      onChange={(e) => updateTag(t.id, { color: e.target.value }).catch(() => {})}
                      className="w-8 h-8 rounded-lg bg-transparent border border-line cursor-pointer shrink-0 p-0.5"
                      title="Đổi màu"
                    />
                    <div className="w-40 shrink-0">
                      <Input
                        value={nameOf(t.id, t.name)}
                        onChange={(e) => setNames((p) => ({ ...p, [t.id]: e.target.value }))}
                        onBlur={() => commitName(t.id, t.name)}
                        placeholder="Tên tag"
                      />
                    </div>
                    {/* Cấp hiển thị là cấp đã QUY ĐỔI: tag cũ scope 'ecom' hiện "Mảng".
                        Doc Firestore chỉ đổi khi ai đó chạm vào ô này — migration mềm, tự nguyện. */}
                    <div className="w-36 shrink-0">
                      <Select
                        value={tagLevel(t)}
                        onChange={(e) => updateTag(t.id, { scope: (e.target.value || '') as TagScope }).catch(() => {})}
                        title="Cấp áp dụng"
                      >
                        <option value="">Dùng chung</option>
                        {TAG_LEVELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </Select>
                    </div>
                    {/* Mảng dùng được ở ngữ cảnh nào — không tick cái nào = dùng mọi nơi (dữ liệu cũ) */}
                    {g.level === 'mang' && (
                      <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                        {TAG_CTXS.map((c) => {
                          const on = tagContexts(t).includes(c.value);
                          const explicit = Array.isArray(t.ctx) && t.ctx.length > 0;
                          return (
                            <button
                              key={c.value}
                              type="button"
                              title={explicit ? undefined : 'Chưa khai ngữ cảnh → đang dùng được mọi nơi'}
                              onClick={() => {
                                const cur = explicit ? tagContexts(t) : [];
                                const next = on && explicit ? cur.filter((x) => x !== c.value) : [...cur, c.value];
                                updateTag(t.id, { ctx: Array.from(new Set(next)) }).catch(() => {});
                              }}
                              className={`text-[11px] font-bold px-2 py-1 rounded-full border transition-all cursor-pointer ${
                                on ? (explicit ? 'border-accent bg-accent/15 text-ink' : 'border-line-2 bg-surface-2 text-muted') : 'border-line text-dim hover:border-line-2'
                              }`}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <button type="button" onClick={() => del(t.id)} className="p-2 text-dim hover:text-red-400 cursor-pointer shrink-0 ml-auto" title="Xoá tag">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="border-t border-line pt-3">
          <Field label="Thêm tag mới">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-9 h-9 rounded-lg bg-transparent border border-line cursor-pointer shrink-0 p-0.5"
                title="Chọn màu"
              />
              <div className="w-40 shrink-0">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên tag" />
              </div>
              <div className="w-36 shrink-0">
                <Select value={newLevel} onChange={(e) => { setNewLevel((e.target.value || '') as TagLevel); setNewCtx([]); }} title="Cấp áp dụng">
                  <option value="">Dùng chung</option>
                  {TAG_LEVELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </div>
              {newLevel === 'mang' && (
                <div className="flex flex-wrap gap-1.5">
                  {TAG_CTXS.map((c) => {
                    const on = newCtx.includes(c.value);
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setNewCtx((cur) => (on ? cur.filter((x) => x !== c.value) : [...cur, c.value]))}
                        className={`text-[11px] font-bold px-2 py-1 rounded-full border transition-all cursor-pointer ${
                          on ? 'border-accent bg-accent/15 text-ink' : 'border-line text-dim hover:border-line-2'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <Button onClick={add} disabled={!newName.trim()} className="shrink-0 ml-auto">Thêm</Button>
            </div>
          </Field>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </Modal>
  );
}
