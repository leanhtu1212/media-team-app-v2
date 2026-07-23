import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { createTag, updateTag, deleteTag } from '../lib/actions';
import { useToast } from '../hooks/useToast';
import { Modal, Input, Select, Button, Field } from './ui';
import type { User } from '../lib/firebase';
import type { TagScope } from '../types';

/** Các loại tag có thể gán + nhãn hiển thị. Rỗng ('') = dùng chung mọi nơi. */
export const TAG_SCOPES: { value: TagScope; label: string }[] = [
  { value: 'inhouse-photo', label: 'Inhouse · Ảnh' },
  { value: 'inhouse-video', label: 'Inhouse · Video' },
  { value: 'ecom', label: 'Ecom' },
  { value: 'outsource', label: 'Outsource' },
  { value: 'note', label: 'Note' },
  { value: 'content', label: 'Content' },
];
export const scopeLabel = (s?: string) => TAG_SCOPES.find((x) => x.value === s)?.label || 'Dùng chung';

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
 * `scope` lọc theo ngữ cảnh: chỉ hiện tag đúng loại + tag dùng chung (không gán loại).
 * Có thể truyền mảng loại (vd inhouse gồm cả ảnh & video).
 * `autoSelect` = tự điền tag mặc định khi chưa chọn (ưu tiên tag đúng loại, không ưu tiên tag dùng chung).
 */
export function TagSelect({ value, onChange, scope, autoSelect }: { value?: string; onChange: (id: string) => void; scope?: TagScope | TagScope[]; autoSelect?: boolean }) {
  const { tags } = useAppData();
  const cur = tags.find((t) => t.id === value);
  const allowed = scope ? (Array.isArray(scope) ? scope : [scope]) : null;
  let list = allowed ? tags.filter((t) => !t.scope || allowed.includes(t.scope)) : tags;
  // Giữ tag đang chọn hiển thị dù khác loại (vd đổi loại dự án sau khi đã gán tag)
  if (cur && !list.some((t) => t.id === cur.id)) list = [cur, ...list];

  // Tự điền tag mặc định: ưu tiên tag gán đúng loại, chỉ dùng tag "dùng chung" khi không có tag loại nào.
  useEffect(() => {
    if (!autoSelect || value) return;
    const pick = list.find((t) => t.scope) || list[0];
    if (pick) onChange(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect, value, tags]);

  return (
    <div className="flex items-center gap-2">
      <span className="w-4 h-4 rounded-full shrink-0 border border-line" style={{ backgroundColor: cur?.color || 'transparent' }} />
      <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className="flex-1">
        <option value="" disabled>— Chọn tag —</option>
        {list.map((t) => <option key={t.id} value={t.id}>{t.name}{t.scope ? ` · ${scopeLabel(t.scope)}` : ''}</option>)}
      </Select>
    </div>
  );
}

/** Modal quản lý tag: tạo mới, đổi tên/màu, xoá. Chỉ editor/admin dùng. */
export function TagManagerModal({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const { tags } = useAppData();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#f97316');
  const [newScope, setNewScope] = useState<TagScope | ''>('');
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
      await createTag({ name, color: newColor, ...(newScope ? { scope: newScope } : {}) }, user);
      setNewName('');
      toast('Đã thêm tag');
    } catch (e: unknown) { toast(`Lỗi: ${(e as Error).message}`, 'error'); }
  };

  const del = async (id: string) => {
    try { await deleteTag(id); toast('Đã xoá tag'); } catch (e: unknown) { toast(`Lỗi: ${(e as Error).message}`, 'error'); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quản lý tag màu">
      <div className="space-y-4">
        <div className="space-y-2">
          {tags.length === 0 && <p className="text-sm text-dim">Chưa có tag nào. Thêm tag đầu tiên bên dưới.</p>}
          {tags.map((t) => (
            <div key={t.id} className="rounded-lg border border-line p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={t.color}
                  onChange={(e) => updateTag(t.id, { color: e.target.value }).catch(() => {})}
                  className="w-9 h-9 rounded-lg bg-transparent border border-line cursor-pointer shrink-0 p-0.5"
                  title="Đổi màu"
                />
                <div className="flex-1 min-w-0">
                  <Input
                    value={nameOf(t.id, t.name)}
                    onChange={(e) => setNames((p) => ({ ...p, [t.id]: e.target.value }))}
                    onBlur={() => commitName(t.id, t.name)}
                    placeholder="Tên tag"
                  />
                </div>
                <button type="button" onClick={() => del(t.id)} className="p-2 text-dim hover:text-red-400 cursor-pointer shrink-0" title="Xoá tag">
                  <Trash2 size={16} />
                </button>
              </div>
              <Select
                value={t.scope || ''}
                onChange={(e) => updateTag(t.id, { scope: (e.target.value || '') as TagScope }).catch(() => {})}
                title="Loại áp dụng"
              >
                <option value="">Dùng chung</option>
                {TAG_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
          ))}
        </div>

        <div className="border-t border-line pt-3">
          <Field label="Thêm tag mới">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-9 h-9 rounded-lg bg-transparent border border-line cursor-pointer shrink-0 p-0.5"
                  title="Chọn màu"
                />
                <div className="flex-1 min-w-0">
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên tag (vd: Gấp, Ưu tiên…)" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select value={newScope} onChange={(e) => setNewScope((e.target.value || '') as TagScope | '')} title="Loại áp dụng">
                    <option value="">Dùng chung</option>
                    {TAG_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </div>
                <Button onClick={add} disabled={!newName.trim()} className="shrink-0">Thêm</Button>
              </div>
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
