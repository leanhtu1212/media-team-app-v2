import { type ReactNode, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X, AlertTriangle } from 'lucide-react';

/* ---------- Button ---------- */
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'outline';
export function Button({
  variant = 'primary', className = '', children, type = 'button', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-4 py-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-accent hover:bg-indigo-500 text-white shadow-sm',
    ghost: 'text-muted hover:text-ink hover:bg-surface-2',
    danger: 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white',
    outline: 'border border-line-2 text-ink hover:bg-surface-2',
  };
  return <button type={type} className={`${base} ${styles[variant]} ${className}`} {...rest}>{children}</button>;
}

/* ---------- Input / Select / Textarea ---------- */
const fieldCls = 'w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-dim focus:outline-none focus:border-accent transition-colors';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldCls} ${className}`} {...rest} />;
}
export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldCls} ${className}`} {...rest}>{children}</select>;
}
export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldCls} ${className}`} {...rest} />;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open, onClose, title, children, wide = false, onSubmit,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; onSubmit?: () => void }) {
  if (!open) return null;
  // Khi có onSubmit: bọc nội dung trong <form> để Enter trong input tự submit.
  // Textarea không submit khi Enter (xuống dòng bình thường) — đúng ý.
  // LƯU Ý: KHÔNG định nghĩa component (vd `Body`) bên trong render — mỗi lần gõ
  // phím parent re-render, reference component mới → React remount cả subtree →
  // input mất focus sau 1 ký tự. Render thẳng <form>/<div> ngay tại chỗ.
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`fade-up bg-surface border border-line rounded-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-bold text-base">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink transition-colors cursor-pointer"><X size={18} /></button>
        </div>
        {onSubmit ? (
          <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="p-5 overflow-y-auto">{children}</form>
        ) : (
          <div className="p-5 overflow-y-auto">{children}</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Drawer (panel trượt từ cạnh màn hình) ---------- */
export function Drawer({
  open, onClose, title, children, side = 'right', headerExtra,
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; side?: 'left' | 'right'; headerExtra?: ReactNode }) {
  if (!open) return null;
  const isLeft = side === 'left';
  return (
    <div className={`fixed inset-0 z-[140] flex ${isLeft ? 'justify-start' : 'justify-end'} bg-black/60 backdrop-blur-sm`} onClick={onClose}>
      <div
        className={`${isLeft ? 'slide-in-left border-r' : 'slide-in-right border-l'} w-full max-w-md h-full bg-surface border-line overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-4 flex items-center gap-3 z-10">
          <div className="flex-1 min-w-0">{title}</div>
          {headerExtra}
          <button type="button" onClick={onClose} className="text-muted hover:text-ink cursor-pointer p-1 shrink-0"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------- ConfirmDialog ---------- */
export function ConfirmDialog({
  open, onClose, onConfirm, title, message,
}: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="fade-up bg-surface border border-line rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center text-red-400"><AlertTriangle size={18} /></div>
          <h3 className="font-bold">{title}</h3>
        </div>
        <p className="text-sm text-muted mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>Xoá</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${color}`}>
      {children}
    </span>
  );
}

export const STATUS_BADGE: Record<string, string> = {
  plan: 'bg-slate-500/15 text-slate-300',
  'pre-production': 'bg-amber-500/15 text-amber-400',
  'post-production': 'bg-indigo-500/15 text-indigo-300',
  done: 'bg-emerald-500/15 text-emerald-400',
  payment: 'bg-cyan-500/15 text-cyan-300',
  pending: 'bg-slate-500/15 text-slate-300',
  'in-progress': 'bg-amber-500/15 text-amber-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  planned: 'bg-slate-500/15 text-slate-300',
  published: 'bg-violet-500/15 text-violet-300',
};

export const STATUS_LABEL: Record<string, string> = {
  plan: 'Kế hoạch',
  'pre-production': 'Tiền kỳ',
  'post-production': 'Hậu kỳ',
  done: 'Hoàn thành',
  payment: 'Thanh toán',
  pending: 'Chờ làm',
  'in-progress': 'Đang làm',
  completed: 'Hoàn thành',
  planned: 'Kế hoạch',
  published: 'Đã đăng',
};

/* ---------- Avatar ---------- */
export function Avatar({ name, url, size = 32 }: { name?: string; url?: string; size?: number }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return url ? (
    <img src={url} alt={name} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div
      className="rounded-full bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-dim gap-3">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );
}

/* ---------- ProgressBar ---------- */
export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-accent' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={`h-1.5 bg-line rounded-full overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Card ---------- */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-surface border border-line rounded-xl ${className}`} {...rest}>{children}</div>;
}
