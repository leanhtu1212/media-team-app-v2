import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, FileText, Download } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { Button, Card, Badge, Modal, Input, Select, Textarea, Field, ConfirmDialog, Avatar, EmptyState } from '../components/ui';
import { createManualReport, updateReport, deleteReport } from '../lib/actions';
import { currentMonth, shiftMonth, monthLabel, monthRange, todayStr, formatDate, isProjectFinished } from '../lib/utils';
import { hexA } from '../components/tags';
import { useToast } from '../hooks/useToast';
import type { Report } from '../types';
import type { User } from '../lib/firebase';

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

// Mỗi người 1 màu ổn định (hash id/email → palette) để dễ phân biệt trên lịch báo cáo
const MEMBER_PALETTE = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#06b6d4', '#eab308', '#a855f7', '#ef4444', '#14b8a6', '#f472b6'];
function keyColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return MEMBER_PALETTE[h % MEMBER_PALETTE.length];
}

export function ReportsPage({ user }: { user: User }) {
  const { reports, projects, members, productTypes, allTasks, isEditor } = useAppData();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<'all' | 'manual' | 'auto'>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);
  const [confirmDel, setConfirmDel] = useState<Report | null>(null);

  const [monthStart, monthEnd] = monthRange(month);

  const monthReports = useMemo(
    () =>
      reports
        .filter((r) => r.reportDate >= monthStart && r.reportDate <= monthEnd)
        .filter((r) => {
          if (filter === 'all') return true;
          const isAuto = r.reportType === 'auto' || r.content?.startsWith('Báo cáo tự động:');
          return filter === 'auto' ? isAuto : !isAuto;
        }),
    [reports, monthStart, monthEnd, filter],
  );

  const byDay = useMemo(() => {
    const map: Record<string, Report[]> = {};
    monthReports.forEach((r) => {
      (map[r.reportDate] ||= []).push(r);
    });
    return map;
  }, [monthReports]);

  // Calendar grid
  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDate = new Date(y, m, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDate) / 7) * 7;
  const cells: (string | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= lastDate ? `${month}-${String(d).padStart(2, '0')}` : null;
  });

  const memberOf = (r: Report) =>
    members.find((mm) => mm.uid === r.createdBy || mm.id === r.createdBy || mm.email?.toLowerCase() === r.userEmail?.toLowerCase());

  // Màu theo người báo cáo (ổn định theo id/email)
  const colorOf = (r: Report) => keyColor(memberOf(r)?.id || r.createdBy || r.userEmail || '?');

  // Chú thích: danh sách người có báo cáo trong tháng + màu tương ứng
  const reporters = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    monthReports.forEach((r) => {
      const mem = memberOf(r);
      const key = mem?.id || r.createdBy || r.userEmail || '?';
      if (!map.has(key)) map.set(key, { name: mem?.username || r.userEmail?.split('@')[0] || '?', color: keyColor(key) });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [monthReports, members]);

  const exportCsv = () => {
    const rows = [
      ['Ngày', 'Thành viên', 'Nội dung', 'Project', 'Loại', 'Số lượng', 'Loại báo cáo'],
      ...monthReports
        .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
        .map((r) => {
          const proj = projects.find((p) => p.id === r.projectId);
          return [
            r.reportDate, memberOf(r)?.username || r.userEmail || '', `"${(r.content || '').replace(/"/g, '""')}"`,
            proj?.title || '', r.outputType || '', r.quantity || 1, r.reportType || 'manual',
          ];
        }),
    ];
    const csv = '﻿' + rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `bao-cao-${month}.csv`;
    a.click();
    toast('Đã xuất CSV');
  };

  const dayReports = selectedDay ? (byDay[selectedDay] || []) : [];

  return (
    <div className="fade-up space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Báo cáo</h1>
          <p className="text-sm text-muted">{monthReports.length} báo cáo trong {monthLabel(month).toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!w-auto">
            <option value="all">Tất cả</option>
            <option value="manual">Thủ công</option>
            <option value="auto">Tự động</option>
          </Select>
          <Button variant="outline" onClick={exportCsv}><Download size={14} /> CSV</Button>
          {isEditor && (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={15} /> Báo cáo</Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 text-muted hover:text-ink cursor-pointer"><ChevronLeft size={18} /></button>
          <div className="flex items-center gap-3">
            <h2 className="font-bold">{monthLabel(month)}</h2>
            <button onClick={() => setMonth(currentMonth())} className="text-xs text-indigo-300 hover:underline cursor-pointer">Hôm nay</button>
          </div>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 text-muted hover:text-ink cursor-pointer"><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {DAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs font-bold text-dim py-1">{d}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const list = byDay[date] || [];
            const isToday = date === todayStr();
            const isSelected = date === selectedDay;
            return (
              <button
                key={date}
                onClick={() => setSelectedDay(isSelected ? null : date)}
                className={`min-h-28 rounded-lg border p-1.5 text-left transition-all cursor-pointer overflow-hidden ${
                  isSelected ? 'border-accent bg-accent/10' : isToday ? 'border-indigo-500/40 bg-surface-2' : 'border-line hover:border-line-2'
                }`}
              >
                <span className={`text-sm font-bold ${isToday ? 'text-indigo-300' : 'text-muted'}`}>{Number(date.slice(8))}</span>
                {list.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {list.slice(0, 3).map((r) => {
                      const isAuto = r.reportType === 'auto' || r.content?.startsWith('Báo cáo tự động:');
                      const name = memberOf(r)?.username || r.userEmail?.split('@')[0] || '?';
                      const summary = isAuto ? (r.content || '').replace('Báo cáo tự động: ', '') : (r.content || '');
                      const color = colorOf(r);
                      return (
                        <div
                          key={r.id}
                          style={{ backgroundColor: hexA(color, 0.14), borderLeft: `3px solid ${color}` }}
                          className="rounded px-1.5 py-1 text-[11px] leading-tight text-ink/90"
                          title={isAuto ? 'Báo cáo tự động' : 'Báo cáo thủ công'}
                        >
                          <span className="font-bold" style={{ color }}>{name}:</span>{' '}
                          <span className="opacity-80">{summary.length > 42 ? summary.slice(0, 42) + '…' : summary}</span>
                        </div>
                      );
                    })}
                    {list.length > 3 && <span className="text-[10px] text-dim block pl-1">+{list.length - 3} báo cáo khác</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-muted items-center">
          {reporters.length > 0 && <span className="font-bold text-dim uppercase text-[10px] tracking-wide">Người báo cáo</span>}
          {reporters.map((rp) => (
            <span key={rp.name} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: rp.color }} /> {rp.name}</span>
          ))}
          <span className="ml-auto text-dim">Nhấn vào ngày để xem đầy đủ</span>
        </div>
      </Card>

      {selectedDay && (
        <Card className="fade-up">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h3 className="font-bold text-sm">Báo cáo ngày {formatDate(selectedDay)}</h3>
            <span className="text-xs text-muted">{dayReports.length} báo cáo</span>
          </div>
          <div className="divide-y divide-line px-4">
            {dayReports.length === 0 && <p className="text-sm text-dim py-6 text-center">Không có báo cáo</p>}
            {dayReports.map((r) => {
              const proj = projects.find((p) => p.id === r.projectId);
              const creator = memberOf(r);
              const isAuto = r.reportType === 'auto' || r.content?.startsWith('Báo cáo tự động:');
              const canEdit = isEditor && !isAuto && (r.createdBy === user.uid);
              return (
                <div key={r.id} className="flex items-center gap-3 py-3 group">
                  <Avatar name={creator?.username} url={creator?.avatarUrl} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{r.content}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-dim flex-wrap">
                      <span className="font-bold text-muted">{creator?.username || r.userEmail}</span>
                      {proj && <span>· {proj.title}</span>}
                      {r.outputType && r.outputType !== 'none' && <span>· {r.quantity || 1} {r.outputType}</span>}
                    </div>
                  </div>
                  <Badge color={isAuto ? 'bg-indigo-500/15 text-indigo-300' : 'bg-emerald-500/15 text-emerald-400'}>
                    {isAuto ? 'Tự động' : 'Thủ công'}
                  </Badge>
                  {canEdit && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditing(r); setModalOpen(true); }} className="text-muted hover:text-ink cursor-pointer p-1"><Pencil size={13} /></button>
                      <button onClick={() => setConfirmDel(r)} className="text-muted hover:text-red-400 cursor-pointer p-1"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!selectedDay && monthReports.length === 0 && (
        <EmptyState icon={<FileText size={32} />} text="Chưa có báo cáo nào trong tháng" />
      )}

      <ReportFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSave={async (data) => {
          try {
            if (editing) {
              await updateReport(editing.id, data);
              toast('Đã cập nhật báo cáo');
            } else {
              await createManualReport(data, user);
              toast('Đã tạo báo cáo');
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
        title="Xoá báo cáo?"
        message="Báo cáo sẽ bị xoá vĩnh viễn."
        onConfirm={async () => {
          if (!confirmDel) return;
          try {
            // If a task was auto-created from this report, un-link it
            const linked = allTasks.find((t) => t.sourceReportId === confirmDel.id);
            if (linked) {
              const { updateTask } = await import('../lib/actions');
              await updateTask(linked.projectId, linked.id, { sourceReportId: '' });
            }
            await deleteReport(confirmDel.id);
            toast('Đã xoá báo cáo');
          } catch (e: unknown) {
            toast(`Lỗi: ${(e as Error).message}`, 'error');
          }
        }}
      />
    </div>
  );
}

function ReportFormModal({
  open, onClose, editing, onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: Report | null;
  onSave: (data: Partial<Report>) => Promise<void>;
}) {
  const { projects } = useAppData();
  const [form, setForm] = useState<Partial<Report>>({});
  const [busy, setBusy] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setForm(editing ? { ...editing } : { reportDate: todayStr(), quantity: 1, outputType: 'none' });
    setLastOpen(true);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const set = (k: keyof Report, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (busy || !form.content || !form.projectId) return;
    setBusy(true);
    await onSave(form);
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} onSubmit={submit} title={editing ? 'Sửa báo cáo' : 'Báo cáo mới'}>
      <div className="space-y-4">
        <Field label="Nội dung">
          <Textarea rows={3} value={form.content || ''} onChange={(e) => set('content', e.target.value)} placeholder="Hôm nay đã làm..." autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày">
            <Input type="date" value={form.reportDate || ''} onChange={(e) => set('reportDate', e.target.value)} />
          </Field>
          <Field label="Project">
            <Select value={form.projectId || ''} onChange={(e) => set('projectId', e.target.value)}>
              <option value="">— Chọn project —</option>
              {projects.filter((p) => !isProjectFinished(p.status)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              <optgroup label="Đã hoàn thành">
                {projects.filter((p) => isProjectFinished(p.status)).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </optgroup>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại sản phẩm">
            <Select value={form.outputType || 'none'} onChange={(e) => set('outputType', e.target.value)}>
              <option value="none">Không tính điểm</option>
              <option value="photo">Ảnh</option>
              <option value="video">Video</option>
              <option value="pre-production">Tiền kỳ</option>
            </Select>
          </Field>
          <Field label="Số lượng">
            <Input type="number" min={1} value={form.quantity ?? 1} onChange={(e) => set('quantity', Math.max(1, Number(e.target.value)))} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="submit" disabled={busy || !form.content || !form.projectId}>
            {editing ? 'Lưu' : 'Tạo báo cáo'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
