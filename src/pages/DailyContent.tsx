import { useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, ChevronRight, ChevronLeft, CalendarDays, LayoutGrid, Calendar as CalIcon } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Button, Card, Badge, STATUS_BADGE, STATUS_LABEL, Modal, Input, Select, Textarea, Field, ConfirmDialog, Avatar, EmptyState } from '../components/ui';
import { createDailyContent, updateDailyContent, deleteDailyContent } from '../lib/actions';
import { currentMonth, shiftMonth, monthLabel, todayStr, formatDate } from '../lib/utils';
import { useToast } from '../hooks/useToast';
import type { DailyContent, DailyStatus } from '../types';
import type { User } from '../lib/firebase';

const STATUSES: DailyStatus[] = ['planned', 'in-progress', 'done', 'published'];
const NEXT_STATUS: Record<DailyStatus, DailyStatus | null> = {
  planned: 'in-progress', 'in-progress': 'done', done: 'published', published: null,
};
const TYPES = ['Reels', 'Short', 'Viral / Trending', 'Brand Content', 'Lịch đăng'];
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'YouTube', 'Đa kênh'];
const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const PLATFORM_COLOR: Record<string, string> = {
  Instagram: 'bg-pink-500/15 text-pink-300',
  TikTok: 'bg-slate-500/15 text-slate-200',
  Facebook: 'bg-blue-500/15 text-blue-300',
  YouTube: 'bg-red-500/15 text-red-300',
  'Đa kênh': 'bg-violet-500/15 text-violet-300',
};

export function DailyContentPage({ user }: { user: User }) {
  const { dailyContent, members, isEditor } = useAppData();
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'kanban' | 'month'>('month');
  const [month, setMonth] = useState(currentMonth());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DailyContent | null>(null);
  const [confirmDel, setConfirmDel] = useState<DailyContent | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<DailyStatus | null>(null);

  const handleDrop = async (id: string, status: DailyStatus) => {
    const item = dailyContent.find((d) => d.id === id);
    if (!item || item.status === status) return;
    try {
      await updateDailyContent(id, { status });
      toast(`"${item.title}" → ${STATUS_LABEL[status]}`);
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    }
  };

  const memberOf = (id?: string) => members.find((m) => m.uid === id || m.id === id);

  const monthItems = useMemo(
    () => dailyContent.filter((d) => (d.dueDate || '').startsWith(month)),
    [dailyContent, month],
  );

  const openNew = (presetDate?: string) => {
    setEditing(presetDate ? ({ dueDate: presetDate } as DailyContent) : null);
    setModalOpen(true);
  };

  const ItemCard = ({ item }: { item: DailyContent }) => {
    const assignee = memberOf(item.assigneeId);
    const overdue = item.status !== 'published' && item.status !== 'done' && (item.dueDate || '') < todayStr();
    const next = NEXT_STATUS[item.status];
    return (
      <Card
        draggable={isEditor}
        onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', item.id)}
        className="p-3 group hover:border-line-2 transition-all"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <Badge color={PLATFORM_COLOR[item.platform] || PLATFORM_COLOR['Đa kênh']}>{item.platform}</Badge>
          {isEditor && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditing(item); setModalOpen(true); }} className="text-muted hover:text-ink cursor-pointer"><Pencil size={12} /></button>
              <button onClick={() => setConfirmDel(item)} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={12} /></button>
            </div>
          )}
        </div>
        <p className="text-sm font-bold leading-snug">{item.title}</p>
        <p className="text-[11px] text-dim mt-0.5">{item.type}</p>
        {item.notes && <p className="text-[11px] text-muted mt-1 line-clamp-2">{item.notes}</p>}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5">
            {assignee && <Avatar name={assignee.username} url={assignee.avatarUrl} size={20} />}
            <span className={`text-[11px] ${overdue ? 'text-red-400 font-bold' : 'text-dim'}`}>{formatDate(item.dueDate)}</span>
          </div>
          {isEditor && next && (
            <button
              onClick={() => updateDailyContent(item.id, { status: next }).then(() => toast(`→ ${STATUS_LABEL[next]}`)).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
              className="flex items-center gap-0.5 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer"
            >
              {STATUS_LABEL[next]} <ChevronRight size={11} />
            </button>
          )}
        </div>
      </Card>
    );
  };

  // Month calendar cells
  const [yy, mm] = month.split('-').map(Number);
  const startOffset = (new Date(yy, mm - 1, 1).getDay() + 6) % 7;
  const lastDate = new Date(yy, mm, 0).getDate();
  const totalCells = Math.ceil((startOffset + lastDate) / 7) * 7;
  const cells: (string | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= lastDate ? `${month}-${String(d).padStart(2, '0')}` : null;
  });
  const byDay = useMemo(() => {
    const map: Record<string, DailyContent[]> = {};
    monthItems.forEach((d) => { (map[d.dueDate || ''] ||= []).push(d); });
    return map;
  }, [monthItems]);

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Daily Content</h1>
          <p className="text-sm text-muted">{monthItems.length} nội dung trong {monthLabel(month).toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface border border-line rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${viewMode === 'month' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
            >
              <CalIcon size={13} /> Lịch tháng
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${viewMode === 'kanban' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
            >
              <LayoutGrid size={13} /> Kanban
            </button>
          </div>
          {isEditor && <Button onClick={() => openNew()}><Plus size={15} /> Nội dung</Button>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 text-muted hover:text-ink cursor-pointer"><ChevronLeft size={17} /></button>
        <span className="font-bold text-sm">{monthLabel(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 text-muted hover:text-ink cursor-pointer"><ChevronRight size={17} /></button>
        {month !== currentMonth() && (
          <button onClick={() => setMonth(currentMonth())} className="text-xs text-indigo-300 hover:underline cursor-pointer">Về tháng này</button>
        )}
      </div>

      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUSES.map((status) => {
            const items = monthItems.filter((d) => d.status === status).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
            return (
              <div
                key={status}
                className={`space-y-3 rounded-xl transition-colors ${dragOverCol === status ? 'bg-accent/5 outline-2 outline-dashed outline-accent/40' : ''}`}
                onDragOver={(e) => { if (isEditor) { e.preventDefault(); setDragOverCol(status); } }}
                onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) handleDrop(id, status);
                }}
              >
                <div className="flex items-center justify-between px-1">
                  <Badge color={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
                  <span className="text-xs font-bold text-dim">{items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {items.map((item) => <ItemCard key={item.id} item={item} />)}
                  {items.length === 0 && <div className="border border-dashed border-line rounded-xl py-8 text-center text-xs text-dim">Trống</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <Card className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-2">
              {DAY_LABELS.map((d) => <div key={d} className="text-center text-xs font-bold text-dim py-1">{d}</div>)}
              {cells.map((date, i) => {
                if (!date) return <div key={i} />;
                const list = byDay[date] || [];
                const isToday = date === todayStr();
                const isSelected = date === selectedDay;
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDay(isSelected ? null : date)}
                    onDoubleClick={() => isEditor && openNew(date)}
                    title={isEditor ? 'Nhấn đúp để tạo nội dung' : undefined}
                    className={`min-h-32 sm:min-h-40 rounded-lg border p-2 text-left transition-all cursor-pointer overflow-hidden flex flex-col ${
                      isSelected ? 'border-accent bg-accent/10' : isToday ? 'border-indigo-500/40 bg-surface-2' : 'border-line hover:border-line-2'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-sm font-bold ${isToday ? 'text-indigo-300' : 'text-muted'}`}>{Number(date.slice(8))}</span>
                      {list.length > 0 && <span className="text-[10px] font-bold text-dim">{list.length}</span>}
                    </div>
                    <div className="space-y-1 flex-1">
                      {list.slice(0, 4).map((d) => {
                        const assignee = memberOf(d.assigneeId);
                        const overdue = d.status !== 'published' && d.status !== 'done' && (d.dueDate || '') < todayStr();
                        return (
                          <div
                            key={d.id}
                            className={`rounded-md px-1.5 py-1 border-l-2 ${STATUS_BADGE[d.status]} ${overdue ? 'border-red-500' : 'border-transparent'}`}
                          >
                            <p className="text-[11px] font-bold leading-tight line-clamp-2">{d.title}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[9px] px-1 rounded font-bold ${PLATFORM_COLOR[d.platform] || PLATFORM_COLOR['Đa kênh']}`}>{d.platform}</span>
                              {assignee && <span className="text-[9px] text-dim truncate">{assignee.username}</span>}
                            </div>
                          </div>
                        );
                      })}
                      {list.length > 4 && <span className="text-[10px] text-dim block pl-1">+{list.length - 4} nội dung khác</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-muted">
              {(['planned', 'in-progress', 'done', 'published'] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm ${STATUS_BADGE[s]}`} /> {STATUS_LABEL[s]}</span>
              ))}
              <span className="flex items-center gap-1.5 ml-auto"><span className="w-0.5 h-3 bg-red-500 rounded" /> Quá hạn</span>
            </div>
          </Card>

          {selectedDay && (
            <Card className="fade-up">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <h3 className="font-bold text-sm">Nội dung ngày {formatDate(selectedDay)}</h3>
                {isEditor && (
                  <Button variant="outline" onClick={() => openNew(selectedDay)} className="!py-1 !px-2.5 !text-xs"><Plus size={13} /> Thêm</Button>
                )}
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(byDay[selectedDay] || []).map((item) => <ItemCard key={item.id} item={item} />)}
                {(byDay[selectedDay] || []).length === 0 && <p className="text-sm text-dim col-span-full text-center py-4">Chưa có nội dung</p>}
              </div>
            </Card>
          )}
        </>
      )}

      {monthItems.length === 0 && viewMode === 'kanban' && (
        <EmptyState icon={<CalendarDays size={32} />} text="Chưa có nội dung nào trong tháng" />
      )}

      <ContentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        members={members.filter((m) => m.role !== 'viewer')}
        onSave={async (data) => {
          try {
            if (editing?.id) {
              await updateDailyContent(editing.id, data);
              toast('Đã cập nhật');
            } else {
              await createDailyContent(data, user);
              toast('Đã thêm nội dung');
            }
            setModalOpen(false);
          } catch (e: unknown) {
            toast(`Lỗi: ${(e as Error).message}`, 'error');
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Xoá nội dung?"
        message={`Xoá "${confirmDel?.title}"?`}
        onConfirm={() => confirmDel && deleteDailyContent(confirmDel.id).then(() => toast('Đã xoá')).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
      />
    </div>
  );
}

function ContentFormModal({
  open, onClose, editing, members, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: DailyContent | null;
  members: { uid?: string; id: string; username: string }[];
  onSave: (data: Partial<DailyContent>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<DailyContent>>({});
  const [busy, setBusy] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setForm(editing ? { ...editing } : { type: 'Reels', platform: 'Đa kênh', status: 'planned', dueDate: todayStr(), points: 3 });
    setLastOpen(true);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const set = (k: keyof DailyContent, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={editing?.id ? 'Sửa nội dung' : 'Nội dung mới'}>
      <div className="space-y-4">
        <Field label="Tiêu đề">
          <Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} placeholder="VD: Reels trend tuần này" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại">
            <Select value={form.type || 'Reels'} onChange={(e) => set('type', e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Nền tảng">
            <Select value={form.platform || 'Đa kênh'} onChange={(e) => set('platform', e.target.value)}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Người phụ trách">
            <Select value={form.assigneeId || ''} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">— Chưa gán —</option>
              {members.map((m) => <option key={m.uid || m.id} value={m.uid || m.id}>{m.username}</option>)}
            </Select>
          </Field>
          <Field label="Ngày đăng">
            <Input type="date" value={form.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Trạng thái">
          <Select value={form.status || 'planned'} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Ghi chú">
          <Textarea rows={2} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button disabled={busy || !form.title} onClick={async () => { setBusy(true); await onSave(form); setBusy(false); }}>
            {editing?.id ? 'Lưu' : 'Thêm'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
