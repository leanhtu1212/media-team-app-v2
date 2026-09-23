import { Calendar } from 'lucide-react';
import { formatDate, formatDateTime, todayStr, tsToDate } from '../lib/utils';

/** Ngày tạo chỉ để xem; thời điểm thực tế được ghi bằng serverTimestamp khi lưu. */
export function CreatedAtInfo({ createdAt, isNew = false }: { createdAt?: unknown; isNew?: boolean }) {
  const date = tsToDate(createdAt);
  const label = isNew
    ? formatDate(todayStr())
    : date && Number.isFinite(date.getTime()) ? formatDateTime(date) : 'Chưa có thông tin';

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-bg px-3 py-2.5 text-xs">
      <Calendar size={14} className="shrink-0 text-muted" aria-hidden="true" />
      <span className="text-muted">Ngày tạo:</span>
      <span className="font-semibold text-ink tabular-nums">{label}</span>
      {isNew && <span className="text-dim">· Tự động ghi khi lưu</span>}
    </div>
  );
}
