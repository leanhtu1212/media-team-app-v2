import { useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Loader2, LogOut, Pencil, Plus, RefreshCw, Save, Trash2, UserPlus, Link2, Sheet } from 'lucide-react';
import { setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage, signOut, updatePassword, createNewUser, type User } from '../lib/firebase';
import { useAppData } from '../store/AppDataContext';
import { Button, Card, Input, Select, Field, ConfirmDialog, Avatar, Modal } from '../components/ui';
import { ref as dbRef, deleteOrphans } from '../lib/actions';
import { buildSheetsPayload, postToWebhook } from '../lib/sheets';
import { currentMonth, formatVND } from '../lib/utils';
import { DEFAULT_PRODUCT_TYPES } from '../lib/points';
import { useToast } from '../hooks/useToast';
import type { Member, Role } from '../types';

type Tab = 'general' | 'members' | 'kpi' | 'products' | 'sheets' | 'data';

export function SettingsPage({ user }: { user: User }) {
  const { isAdmin } = useAppData();
  const [tab, setTab] = useState<Tab>('general');

  const tabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: 'general', label: 'Tài khoản' },
    { key: 'members', label: 'Thành viên' },
    { key: 'kpi', label: 'KPI', adminOnly: true },
    { key: 'products', label: 'Loại sản phẩm', adminOnly: true },
    { key: 'sheets', label: 'Google Sheet', adminOnly: true },
    { key: 'data', label: 'Dọn dữ liệu', adminOnly: true },
  ];

  return (
    <div className="fade-up space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted">Quản lý tài khoản và hệ thống</p>
      </div>

      <div className="flex bg-surface border border-line rounded-lg p-0.5 w-fit flex-wrap">
        {tabs.filter((t) => !t.adminOnly || isAdmin).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              tab === t.key ? 'bg-accent text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab user={user} />}
      {tab === 'members' && <MembersTab user={user} />}
      {tab === 'kpi' && isAdmin && <KpiTab />}
      {tab === 'products' && isAdmin && <ProductsTab />}
      {tab === 'sheets' && isAdmin && <SheetsTab />}
      {tab === 'data' && isAdmin && <DataCleanupTab />}
    </div>
  );
}

/* ---------- Dọn dữ liệu mồ côi ---------- */

function DataCleanupTab() {
  const { projects, allTasks, reports } = useAppData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const liveIds = new Set(projects.map((p) => p.id));
  const orphanTasks = allTasks.filter((t) => t.projectId && !liveIds.has(t.projectId));
  const orphanReports = reports.filter((r) => r.projectId && !liveIds.has(r.projectId));
  const orphanCost = orphanTasks
    .filter((t) => t.category === 'pre-production')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const total = orphanTasks.length + orphanReports.length;

  const run = async () => {
    setBusy(true);
    try {
      await deleteOrphans(
        orphanTasks.map((t) => ({ projectId: t.projectId, id: t.id })),
        orphanReports.map((r) => r.id),
      );
      toast(`Đã dọn ${total} mục mồ côi`);
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="font-bold text-base">Dọn dữ liệu mồ côi</h2>
        <p className="text-sm text-muted mt-1">
          Xoá task (gồm chi phí) và báo cáo còn sót lại của các project đã bị xoá trước đây.
          Project xoá gần đây đã tự dọn — mục này chỉ để dọn dữ liệu cũ.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg border border-line rounded-xl p-3">
          <p className="text-2xl font-extrabold tabular-nums">{orphanTasks.length}</p>
          <p className="text-[11px] text-dim">task mồ côi</p>
        </div>
        <div className="bg-bg border border-line rounded-xl p-3">
          <p className="text-2xl font-extrabold tabular-nums">{orphanReports.length}</p>
          <p className="text-[11px] text-dim">báo cáo mồ côi</p>
        </div>
        <div className="bg-bg border border-line rounded-xl p-3">
          <p className="text-2xl font-extrabold tabular-nums text-amber-300">{formatVND(orphanCost)}</p>
          <p className="text-[11px] text-dim">chi phí mồ côi</p>
        </div>
      </div>

      <Button variant="danger" onClick={() => setConfirm(true)} disabled={busy || total === 0}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        {total === 0 ? 'Không có dữ liệu mồ côi' : `Dọn ${total} mục`}
      </Button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={run}
        title="Dọn dữ liệu mồ côi?"
        message={`Xoá vĩnh viễn ${orphanTasks.length} task và ${orphanReports.length} báo cáo của các project đã xoá. Không thể hoàn tác.`}
      />
    </Card>
  );
}

/* ---------- General ---------- */

function GeneralTab({ user }: { user: User }) {
  const { currentMember, team } = useAppData();
  const toast = useToast();
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentMember) return;
    setUploading(true);
    try {
      const sref = storageRef(storage, `avatars/${user.uid}_${Date.now()}`);
      await uploadBytes(sref, file);
      const url = await getDownloadURL(sref);
      await updateDoc(dbRef.member(currentMember.id), { avatarUrl: url });
      toast('Đã cập nhật ảnh đại diện');
    } catch (err: unknown) {
      toast(`Lỗi upload: ${(err as Error).message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (pw.next.length < 6) return toast('Mật khẩu tối thiểu 6 ký tự', 'error');
    if (pw.next !== pw.confirm) return toast('Mật khẩu xác nhận không khớp', 'error');
    setBusy(true);
    try {
      await updatePassword(auth.currentUser!, pw.next);
      if (currentMember) {
        try { await updateDoc(dbRef.member(currentMember.id), { password: pw.next }); } catch { /* legacy field */ }
      }
      setPw({ next: '', confirm: '' });
      toast('Đã đổi mật khẩu');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || '';
      toast(code.includes('requires-recent-login') ? 'Vui lòng đăng xuất và đăng nhập lại rồi thử lại' : `Lỗi: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="p-6">
        <h2 className="font-bold mb-5">Tài khoản của bạn</h2>
        <div className="flex items-center gap-4 mb-5">
          <div className="relative group">
            <Avatar name={currentMember?.username} url={currentMember?.avatarUrl} size={64} />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer"
            >
              {uploading ? <Loader2 size={18} className="animate-spin text-white" /> : <Camera size={18} className="text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </div>
          <div>
            <p className="font-bold">{currentMember?.username || user.email}</p>
            <p className="text-xs text-muted">{user.email}</p>
            <p className="text-[11px] font-bold uppercase text-indigo-300 mt-0.5">{currentMember?.role || 'viewer'}</p>
          </div>
        </div>
        <p className="text-xs text-dim mb-4">Team: {team?.name || 'Media Team'} · ID: MEDIA_TEAM_01</p>
        <Button variant="danger" onClick={() => signOut(auth)}><LogOut size={14} /> Đăng xuất</Button>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold mb-5">Đổi mật khẩu</h2>
        <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }} className="space-y-3">
          <Field label="Mật khẩu mới">
            <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="Xác nhận mật khẩu">
            <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <Button type="submit" disabled={busy || !pw.next} className="w-full">
            {busy ? <Loader2 size={15} className="animate-spin" /> : 'Cập nhật mật khẩu'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

/* ---------- Members ---------- */

function MembersTab({ user }: { user: User }) {
  const { members, isAdmin } = useAppData();
  const toast = useToast();
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [confirmDel, setConfirmDel] = useState<Member | null>(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'editor' as Role, title: '' });
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!form.username || form.password.length < 6) return toast('Điền tên và mật khẩu (≥6 ký tự)', 'error');
    if (members.length >= 10) return toast('Tối đa 10 thành viên', 'error');
    setBusy(true);
    try {
      const email = `${form.username.trim().toLowerCase().replace(/\s+/g, '')}@production.team`;
      const newUser = await createNewUser(email, form.password);
      await setDoc(dbRef.member(newUser.uid), {
        uid: newUser.uid,
        email,
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        title: form.title || '',
        kpiOutput: 100, kpiQuality: 10, kpiDeadline: 10,
        joinedAt: serverTimestamp(),
      });
      toast(`Đã tạo thành viên ${form.username}`);
      setAddOpen(false);
      setForm({ username: '', password: '', role: 'editor', title: '' });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code || '';
      toast(code.includes('email-already-in-use') ? 'Tên đăng nhập đã tồn tại' : `Lỗi: ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="font-bold">Thành viên ({members.length})</h2>
        {isAdmin && <Button onClick={() => setAddOpen(true)} className="!py-1.5"><UserPlus size={15} /> Thêm</Button>}
      </div>
      <div className="divide-y divide-line">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 group">
            <Avatar name={m.username} url={m.avatarUrl} size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{m.username}</p>
              <p className="text-[11px] text-muted">{m.email} · <span className="uppercase font-bold">{m.role}</span>{m.title ? ` · ${m.title}` : ''}</p>
            </div>
            {isAdmin && m.password && (
              <div className="flex items-center gap-1.5 text-xs text-dim font-mono">
                {showPw[m.id] ? m.password : '••••••'}
                <button onClick={() => setShowPw((s) => ({ ...s, [m.id]: !s[m.id] }))} className="text-muted hover:text-ink cursor-pointer">
                  {showPw[m.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            )}
            {isAdmin && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditMember(m)} className="text-muted hover:text-ink cursor-pointer p-1"><Pencil size={14} /></button>
                {(m.uid || m.id) !== user.uid && (
                  <button onClick={() => setConfirmDel(m)} className="text-muted hover:text-red-400 cursor-pointer p-1"><Trash2 size={14} /></button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} title="Thêm thành viên">
        <div className="space-y-4">
          <Field label="Tên đăng nhập">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="VD: hieu" autoFocus />
          </Field>
          <Field label="Mật khẩu">
            <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Tối thiểu 6 ký tự" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vai trò">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
                <option value="content">Content</option>
                <option value="viewer">Viewer</option>
              </Select>
            </Field>
            <Field label="Chức danh">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VD: Photographer" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Huỷ</Button>
            <Button type="submit" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : 'Tạo tài khoản'}</Button>
          </div>
        </div>
      </Modal>

      {editMember && (
        <Modal open onClose={() => setEditMember(null)} title={`Sửa: ${editMember.username}`}>
          <EditMemberForm member={editMember} onDone={() => setEditMember(null)} />
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Xoá thành viên?"
        message={`Xoá ${confirmDel?.username} khỏi team? (Tài khoản đăng nhập vẫn tồn tại nhưng mất quyền truy cập)`}
        onConfirm={() => confirmDel && deleteDoc(dbRef.member(confirmDel.id)).then(() => toast('Đã xoá thành viên')).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
      />
    </Card>
  );
}

function EditMemberForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ username: member.username || '', role: member.role, title: member.title || '' });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(dbRef.member(member.id), form);
      toast('Đã cập nhật thành viên');
      onDone();
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
      <Field label="Tên hiển thị">
        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vai trò">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
            <option value="content">Content</option>
            <option value="viewer">Viewer</option>
          </Select>
        </Field>
        <Field label="Chức danh">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Huỷ</Button>
        <Button type="submit" disabled={busy}>
          <Save size={14} /> Lưu
        </Button>
      </div>
    </form>
  );
}

/* ---------- KPI targets ---------- */

function KpiTab() {
  const { members } = useAppData();
  const toast = useToast();
  const [forms, setForms] = useState<Record<string, number>>({});

  const outputOf = (m: Member) => forms[m.id] ?? (m.kpiOutput || 100);

  return (
    <Card>
      <div className="px-5 py-4 border-b border-line">
        <h2 className="font-bold">Chỉ tiêu sản lượng thành viên</h2>
        <p className="text-xs text-muted mt-0.5">Số sản phẩm cần đạt mỗi tháng (project ảnh + video + DNTT). KPI = sản lượng thực / chỉ tiêu.</p>
      </div>
      <div className="divide-y divide-line">
        {members.filter((m) => m.role === 'admin' || m.role === 'editor').map((m) => {
          const output = outputOf(m);
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <div className="flex items-center gap-2.5 flex-1 min-w-44">
                <Avatar name={m.username} url={m.avatarUrl} size={30} />
                <p className="font-bold text-sm truncate">{m.username}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-muted uppercase">Chỉ tiêu</label>
                <Input type="number" min={0} value={output} onChange={(e) => setForms((s) => ({ ...s, [m.id]: Number(e.target.value) }))} className="!w-28" title="Sản lượng / tháng" />
              </div>
              <Button
                variant="outline"
                className="!py-1.5 !px-3"
                onClick={async () => {
                  try {
                    await updateDoc(dbRef.member(m.id), { kpiOutput: output });
                    toast(`Đã lưu chỉ tiêu của ${m.username}`);
                  } catch (e: unknown) {
                    toast(`Lỗi: ${(e as Error).message}`, 'error');
                  }
                }}
              >
                <Save size={13} /> Lưu
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- Product types ---------- */

function ProductsTab() {
  const { productTypes } = useAppData();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', points: 1, category: 'Ảnh' });
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);

  const seedDefaults = async () => {
    try {
      for (const t of DEFAULT_PRODUCT_TYPES) {
        const id = t.name.toLowerCase().replace(/\s+/g, '_');
        await setDoc(dbRef.productType(id), { ...t, id });
      }
      toast('Đã khởi tạo loại sản phẩm mặc định');
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Card>
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="font-bold">Loại sản phẩm</h2>
        {productTypes.length === 0 && (
          <Button variant="outline" onClick={seedDefaults} className="!py-1.5"><RefreshCw size={13} /> Khởi tạo mặc định</Button>
        )}
      </div>
      <div className="divide-y divide-line">
        {productTypes.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-5 py-3 group">
            <span className="text-[10px] font-bold uppercase text-dim w-20">{t.category}</span>
            <p className="flex-1 text-sm font-medium">{t.name}</p>
            <button onClick={() => setConfirmDel({ id: t.id, name: t.name })} className="text-muted hover:text-red-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity p-1">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 border-t border-line flex flex-wrap items-end gap-2">
        <Field label="Tên loại mới">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Ảnh 360" className="!w-44" />
        </Field>
        <Field label="Nhóm">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="!w-32">
            <option>Ảnh</option><option>Video</option><option>Outsource</option>
          </Select>
        </Field>
        <Button
          disabled={!form.name}
          onClick={async () => {
            try {
              const id = form.name.toLowerCase().replace(/\s+/g, '_');
              await setDoc(dbRef.productType(id), { ...form, id });
              toast('Đã thêm loại sản phẩm');
              setForm({ name: '', points: 1, category: 'Ảnh' });
            } catch (e: unknown) {
              toast(`Lỗi: ${(e as Error).message}`, 'error');
            }
          }}
        >
          <Plus size={14} /> Thêm
        </Button>
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Xoá loại sản phẩm?"
        message={`Xoá "${confirmDel?.name}"? Các project đang dùng sẽ quay về điểm tuỳ chỉnh.`}
        onConfirm={() => confirmDel && deleteDoc(dbRef.productType(confirmDel.id)).then(() => toast('Đã xoá')).catch((e) => toast(`Lỗi: ${e.message}`, 'error'))}
      />
    </Card>
  );
}

/* ---------- Google Sheets sync ---------- */

function SheetsTab() {
  const { team, members, projects, allTasks, reports } = useAppData();
  const toast = useToast();
  const [url, setUrl] = useState(team?.sheetsWebhookUrl || '');
  const [month, setMonth] = useState(currentMonth());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const saveUrl = async () => {
    try {
      await updateDoc(dbRef.team(), { sheetsWebhookUrl: url.trim() });
      toast('Đã lưu URL webhook');
    } catch (e: unknown) {
      toast(`Lỗi: ${(e as Error).message}`, 'error');
    }
  };

  const sync = async () => {
    const target = (url || team?.sheetsWebhookUrl || '').trim();
    if (!target) return toast('Chưa cấu hình URL webhook', 'error');
    setBusy(true);
    setResult(null);
    try {
      const payload = buildSheetsPayload(month, members, projects, allTasks, reports);
      const res = await postToWebhook(target, payload);
      setResult(res);
      if (res.ok) toast(res.message);
      else toast(res.message, 'error');
    } catch (e: unknown) {
      const msg = `Lỗi kết nối: ${(e as Error).message}`;
      setResult({ ok: false, message: msg });
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="font-bold mb-1 flex items-center gap-2"><Sheet size={16} className="text-emerald-400" /> Đồng bộ Google Sheet</h2>
        <p className="text-xs text-muted mb-5">
          Xuất KPI, danh sách project và task theo tháng vào Google Sheet. Cần cài Apps Script webhook một lần
          (xem file <code className="text-indigo-300">apps-script/sync.gs</code> trong source code — có hướng dẫn từng bước).
        </p>
        <div className="space-y-3">
          <Field label="Webhook URL (Apps Script Web App)">
            <div className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..../exec" />
              <Button variant="outline" onClick={saveUrl} disabled={!url}><Link2 size={14} /> Lưu</Button>
            </div>
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Tháng dữ liệu">
              <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="!w-40" />
            </Field>
            <Button disabled={busy} onClick={sync}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={14} />} Đồng bộ ngay
            </Button>
          </div>
          {result && (
            <p className={`text-sm px-4 py-3 rounded-lg ${result.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
              {result.message}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
