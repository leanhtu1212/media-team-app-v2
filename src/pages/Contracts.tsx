import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileDown, FileSignature, Loader2, Plus, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { Button, ConfirmDialog, EmptyState } from '../components/ui';
import {
  ContractFormModal, boDoiTacKhoiCache, taiLaiDoiTac, useContractConfig, useContractPartners,
} from '../components/ContractFormModal';
import { useAppData } from '../store/AppDataContext';
import {
  capNhatContractSettings, luuContractToken, danhDauTaskDaLamHopDong, idDoiTac, xoaContractPartner, nhapDoiTacTuSheet,
} from '../lib/actions';
import type { ContractPartner, ContractSettingsDoc } from '../types';
import type { ContractForm } from '../lib/contracts/compute';
import { danhSachTuRows, type SheetRow } from '../lib/contracts/sheetSync';
import { gopDoiTacTuSheet } from '../lib/contracts/importSheet';
import type { QuickParseForm } from '../lib/contracts/quickParse';
import { dongTuKhoanChi, laKhoanChiHopDong } from '../lib/contracts/fromTask';
import { danhSachDoiTac, formChoHopDongMoi, lanCuoiMs } from '../lib/contracts/repeatPartner';

// Hợp đồng giờ làm hoàn toàn trong app: KHÔNG còn đọc sheet "Danh sách làm HĐ". Nguồn dữ liệu:
//  1. Danh sách đối tác đã lưu (contractPartners) — ghi tự động mỗi lần sinh file. Chọn một
//     người là form có sẵn danh tính + STK, chỉ còn điền số tiền và nội dung công việc.
//  2. Khoản chi tiền kỳ có tick "làm HĐ" mà chưa sinh file (fromTask.ts) — việc còn tồn.
// Webhook + token vẫn cần cho bước "Copy lên Drive" (Apps Script), không dùng để đọc sheet nữa.

type ContractsTab = 'doi-tac' | 'cai-dat';
const TAB_LABEL: Record<ContractsTab, string> = { 'doi-tac': 'Đối tác', 'cai-dat': 'Cài đặt' };

const CA_NHAN: { key: keyof ContractForm; label: string }[] = [
  { key: 'cccd', label: 'CCCD' },
  { key: 'dia_chi', label: 'Địa chỉ' },
  { key: 'so_tk', label: 'Số TK' },
  { key: 'ngan_hang', label: 'Ngân hàng' },
];

/** Thông tin còn thiếu của hồ sơ đối tác — thiếu mấy ô này thì hợp đồng có chỗ bỏ trống. */
function thieuCuaDoiTac(p: ContractPartner): string[] {
  const ra: string[] = [];
  if (!p.cccd) ra.push('CCCD');
  if (!p.diaChi) ra.push('Địa chỉ');
  if (!p.soTk) ra.push('Số TK');
  if (!p.nganHang) ra.push('Ngân hàng');
  return ra;
}

function ngayLanCuoi(p: ContractPartner): string {
  const ms = lanCuoiMs(p);
  return ms ? new Date(ms).toLocaleDateString('vi-VN') : '—';
}

/** Khoản chi của dự án đã tick "làm HĐ" nhưng chưa sinh file. */
function BangKhoanChi({ rows, onOpen }: { rows: SheetRow[]; onOpen: (r: SheetRow) => void }) {
  return (
    <div className="bg-surface border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-muted border-b border-line">
            <th className="px-3 py-2 font-semibold min-w-[140px]">Dự án</th>
            <th className="px-3 py-2 font-semibold min-w-[150px]">Đối tác</th>
            <th className="px-3 py-2 font-semibold min-w-[180px]">Nội dung công việc</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Số tiền</th>
            <th className="px-3 py-2 font-semibold min-w-[200px]">Hồ sơ đối tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const thieu = CA_NHAN.filter((c) => !String(r.form[c.key] ?? '').trim());
            return (
              <tr
                key={r.taskId}
                onClick={() => onOpen(r)}
                className="border-b border-line/60 last:border-0 hover:bg-accent/10 align-top cursor-pointer"
              >
                <td className="px-3 py-2 text-accent">{r.projectTitle || '—'}</td>
                <td className="px-3 py-2 font-medium">{r.ho_ten || <span className="text-dim">(chưa có tên)</span>}</td>
                <td className="px-3 py-2">{r.noi_dung || <span className="text-dim">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.tien || <span className="text-dim">—</span>}</td>
                <td className="px-3 py-2 text-xs">
                  {thieu.length === 0
                    ? <span className="text-emerald-400">Đủ thông tin</span>
                    : <span className="text-amber-400">Thiếu: {thieu.map((c) => c.label).join(', ')}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BangDoiTacDaLuu({
  ds, onLamHd, onXoa,
}: {
  ds: ContractPartner[];
  onLamHd: (p: ContractPartner) => void;
  onXoa: (p: ContractPartner) => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-muted border-b border-line">
            <th className="px-3 py-2 font-semibold min-w-[160px]">Họ tên</th>
            <th className="px-3 py-2 font-semibold min-w-[140px]">Liên hệ</th>
            <th className="px-3 py-2 font-semibold min-w-[200px]">Thanh toán</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">CCCD / MST</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Số HĐ</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Lần cuối</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ds.map((p) => {
            const thieu = thieuCuaDoiTac(p);
            return (
              <tr
                key={p.id}
                onClick={() => onLamHd(p)}
                title="Bấm để làm hợp đồng mới với đối tác này"
                className="border-b border-line/60 last:border-0 hover:bg-accent/10 align-top cursor-pointer"
              >
                <td className="px-3 py-2">
                  <div className="font-medium">{p.xungHo ? `${p.xungHo} ` : ''}{p.hoTen}</div>
                  {thieu.length > 0 && (
                    <div className="text-[11px] text-amber-400 mt-0.5">Thiếu: {thieu.join(', ')}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {p.sdt && <div>{p.sdt}</div>}
                  {p.email && <div className="break-all">{p.email}</div>}
                  {!p.sdt && !p.email && <span className="text-dim">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {p.soTk || p.nganHang ? (
                    <>
                      <div>{[p.soTk, p.nganHang].filter(Boolean).join(' · ')}</div>
                      {p.tenTk && <div className="text-dim">{p.tenTk}</div>}
                    </>
                  ) : <span className="text-dim">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                  {p.cccd && <div>{p.cccd}</div>}
                  {p.mst && <div className="text-dim">MST {p.mst}</div>}
                  {!p.cccd && !p.mst && <span className="text-dim">—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.soLan || 0}</td>
                <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{ngayLanCuoi(p)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button className="!px-2.5 !py-1 !text-xs" onClick={(e) => { e.stopPropagation(); onLamHd(p); }}>
                      <FileSignature size={14} /> Làm HĐ
                    </Button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onXoa(p); }}
                      className="p-1.5 rounded-lg text-dim hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                      title="Xoá khỏi danh sách"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Thứ đang mở trong modal. `form` là GIÁ TRỊ MỞ ĐẦU — object mới mỗi lần mở = modal nạp lại. */
interface DangMo {
  tieuDe: string;
  form: ContractForm;
  hienODan: boolean;
  khoanChi?: { projectId: string; taskId: string };
}

export function Contracts() {
  const toast = useToast();
  const { settings, webhookUrl, token, setToken } = useContractConfig();
  const { projects, allTasks } = useAppData();
  const { partners, dangTai } = useContractPartners();

  const [tab, setTab] = useState<ContractsTab>('doi-tac');
  const [tuKhoa, setTuKhoa] = useState('');
  const [dangMo, setDangMo] = useState<DangMo | null>(null);
  const [xoa, setXoa] = useState<ContractPartner | null>(null);
  const [lamMoi, setLamMoi] = useState(false);

  const dsDoiTac = useMemo(() => danhSachDoiTac(partners, tuKhoa), [partners, tuKhoa]);
  const tongDoiTac = Object.keys(partners).length;

  /** Khoản chi đã tick "làm HĐ" mà chưa sinh file. Hồ sơ cá nhân tra theo tên đối tác. */
  const khoanChiCho = useMemo(() => {
    const theoId = new Map(projects.map((p) => [p.id, p]));
    return allTasks
      .filter((t) => laKhoanChiHopDong(t) && !t.hopDongDaLam)
      .map((t) => {
        const p = partners[idDoiTac(t.hopDongHoTen || '')];
        return dongTuKhoanChi(t, theoId.get(t.projectId), p ? (formChoHopDongMoi(p) as QuickParseForm) : undefined);
      });
  }, [allTasks, projects, partners]);

  const moTaoMoi = () => setDangMo({ tieuDe: 'Tạo hợp đồng — đối tác mới', form: {}, hienODan: true });

  const moChoDoiTac = (p: ContractPartner) => setDangMo({
    tieuDe: `Hợp đồng mới — ${p.hoTen}`,
    form: formChoHopDongMoi(p),
    hienODan: false,
  });

  const moKhoanChi = (r: SheetRow) => setDangMo({
    tieuDe: `Hợp đồng — ${r.projectTitle || 'khoản chi'}`,
    form: { ...r.form },
    // Đối tác chưa có hồ sơ thì cần ô dán khối "THÔNG TIN THANH TOÁN".
    hienODan: !partners[idDoiTac(r.ho_ten || '')],
    khoanChi: r.projectId && r.taskId ? { projectId: r.projectId, taskId: r.taskId } : undefined,
  });

  /** Nhập một lần những người trong sheet "Danh sách làm HĐ" vào danh sách đối tác, để sau
   *  này không phải nhập lại. Không đè dữ liệu đã lưu trên web (xem importSheet.ts). */
  const [dangNhap, setDangNhap] = useState(false);
  const nhapTuSheet = async () => {
    if (!webhookUrl || !token) {
      toast('Chưa cấu hình Webhook / Token ở tab Cài đặt', 'error');
      return;
    }
    setDangNhap(true);
    try {
      const res = await fetch(`${webhookUrl}?action=contract-list&token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi không rõ');
      const ds = gopDoiTacTuSheet(danhSachTuRows(data.rows, data.links), partners, idDoiTac);
      if (ds.length === 0) {
        toast('Sheet không có ai mới — danh sách đã đủ');
        return;
      }
      await nhapDoiTacTuSheet(ds);
      await taiLaiDoiTac();
      const moi = ds.filter((d) => d.moi).length;
      toast(`Đã nhập từ Sheet: ${moi} đối tác mới, bổ sung thông tin cho ${ds.length - moi} người`);
    } catch (e) {
      toast(`Lỗi nhập từ Sheet: ${(e as Error).message}`, 'error');
    } finally {
      setDangNhap(false);
    }
  };

  const taiLai = async () => {
    setLamMoi(true);
    try {
      await taiLaiDoiTac();
    } catch (e) {
      toast(`Lỗi tải danh sách đối tác: ${(e as Error).message}`, 'error');
    } finally {
      setLamMoi(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-extrabold mr-auto">Hợp đồng KOL/KOC</h1>
        <div className="flex bg-surface border border-line rounded-xl p-1">
          {(['doi-tac', 'cai-dat'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                tab === t ? 'bg-accent text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        {tab === 'doi-tac' && (
          <Button onClick={moTaoMoi}>
            <Plus size={16} /> HĐ đối tác mới
          </Button>
        )}
      </div>

      {tab === 'doi-tac' && (!webhookUrl || !token) && (
        <div className="flex items-start gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-lg p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Chưa cấu hình Webhook / Token — vẫn tạo và tải file HĐ được, chỉ bước «Copy lên Drive»
            cần cấu hình (tab Cài đặt + hàm thietLapCauHinhHopDong() bên Apps Script).
          </span>
        </div>
      )}

      {tab === 'doi-tac' && (
        <>
          {khoanChiCho.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-muted">
                Khoản chi dự án chờ làm HĐ ({khoanChiCho.length})
              </h2>
              <BangKhoanChi rows={khoanChiCho} onOpen={moKhoanChi} />
            </section>
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-muted mr-auto">
                Đối tác đã lưu ({tongDoiTac})
              </h2>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
                <input
                  value={tuKhoa}
                  onChange={(e) => setTuKhoa(e.target.value)}
                  placeholder="Tìm tên, SĐT, CCCD, STK…"
                  className="w-60 bg-bg border border-line rounded-lg pl-8 pr-3 py-1.5 text-sm text-ink focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <Button variant="outline" className="!px-3 !py-1.5" onClick={taiLai} disabled={lamMoi}>
                {lamMoi ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Tải lại
              </Button>
              <Button
                variant="outline" className="!px-3 !py-1.5" onClick={nhapTuSheet} disabled={dangNhap}
                title="Lưu những người trong sheet Danh sách làm HĐ vào danh sách này (không đè dữ liệu đã có)"
              >
                {dangNhap ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Nhập từ Sheet
              </Button>
            </div>

            {dangTai ? (
              <div className="flex items-center gap-2 text-sm text-muted p-4">
                <Loader2 size={16} className="animate-spin" /> Đang tải danh sách đối tác…
              </div>
            ) : tongDoiTac === 0 ? (
              <EmptyState
                icon={<Users size={28} />}
                text='Chưa có đối tác nào. Bấm "HĐ đối tác mới" — làm xong hợp đồng đầu tiên, thông tin đối tác tự lưu vào đây.'
              />
            ) : dsDoiTac.length === 0 ? (
              <div className="bg-surface border border-line rounded-xl p-4 text-sm text-muted">
                Không có đối tác nào khớp «{tuKhoa}».
              </div>
            ) : (
              <BangDoiTacDaLuu ds={dsDoiTac} onLamHd={moChoDoiTac} onXoa={setXoa} />
            )}
            <p className="text-xs text-dim">
              Bấm vào một đối tác để làm hợp đồng mới: thông tin cá nhân + tài khoản điền sẵn, chỉ
              cần nhập số tiền và nội dung công việc. Thông tin đối tác tự cập nhật mỗi lần tạo file.
            </p>
          </section>
        </>
      )}

      <ContractFormModal
        open={!!dangMo}
        onClose={() => setDangMo(null)}
        tieuDe={dangMo?.tieuDe ?? ''}
        settings={settings}
        webhookUrl={webhookUrl}
        token={token}
        formBanDau={dangMo?.form ?? {}}
        hienODan={dangMo?.hienODan}
        onTaoXong={async (hoTen) => {
          // Khoản chi của dự án: ghi ngược lại task để rời khỏi danh sách chờ.
          const kc = dangMo?.khoanChi;
          if (kc) await danhDauTaskDaLamHopDong(kc.projectId, kc.taskId, hoTen);
        }}
      />

      <ConfirmDialog
        open={!!xoa}
        onClose={() => setXoa(null)}
        title="Xoá đối tác?"
        message={`Xoá "${xoa?.hoTen}" khỏi danh sách đối tác đã lưu? File hợp đồng đã tạo không bị ảnh hưởng, nhưng lần sau làm HĐ với người này phải nhập lại thông tin.`}
        onConfirm={async () => {
          if (!xoa) return;
          try {
            await xoaContractPartner(xoa.id);
            boDoiTacKhoiCache(xoa.id);
            toast('Đã xoá đối tác');
          } catch (e) {
            toast(`Lỗi xoá: ${(e as Error).message}`, 'error');
          }
          setXoa(null);
        }}
      />

      {tab === 'cai-dat' && (
        <ContractSettingsPanel
          settings={settings}
          token={token}
          onToken={setToken}
          onSaved={() => toast('Đã lưu cài đặt')}
        />
      )}
    </div>
  );
}

function ContractSettingsPanel({
  settings, token, onToken, onSaved,
}: {
  settings: ContractSettingsDoc; token: string; onToken: (t: string) => void; onSaved: () => void;
}) {
  const [local, setLocal] = useState(settings);
  const [localToken, setLocalToken] = useState(token);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => setLocal(settings), [settings]);
  useEffect(() => setLocalToken(token), [token]);

  const save = async () => {
    setBusy(true);
    try {
      await capNhatContractSettings(local);
      if (localToken.trim() !== token) {
        await luuContractToken(localToken);
        onToken(localToken.trim());
      }
      onSaved();
    } catch (e) {
      toast(`Lỗi lưu cài đặt: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof ContractSettingsDoc, label: string, type: 'text' | 'number' = 'text') => (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <input
        type={type}
        step={type === 'number' ? 'any' : undefined}
        className="mt-1 w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors"
        value={String(local[key])}
        onChange={(e) =>
          setLocal((s) => ({ ...s, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))
        }
      />
    </label>
  );

  return (
    <div className="bg-surface border border-line rounded-xl p-4 space-y-3">
      <h2 className="font-bold">Cài đặt</h2>
      <label className="block text-sm">
        <span className="text-muted">Token webhook hợp đồng (khớp CONTRACT_TOKEN bên Apps Script)</span>
        <input
          type="password" autoComplete="off"
          className="mt-1 w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors"
          value={localToken}
          onChange={(e) => setLocalToken(e.target.value)}
        />
      </label>
      <p className="text-xs text-dim">
        Sheet ID, tên tab và thư mục Drive gốc đặt ở Apps Script bằng cách chạy hàm
        thietLapCauHinhHopDong() (CONTRACT_SHEET_ID / CONTRACT_SHEET_TAB /
        CONTRACT_ROOT_FOLDER_ID lưu ở User Properties), không đặt ở đây nữa — webhook chạy dưới
        quyền chủ script nên client không được chỉ định đích đến. Nếu webhook báo “Chưa cấu
        hình”, nghĩa là bên Apps Script chưa chạy hàm đó (không phải sai token).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {field('doSauDoFolder', 'Độ sâu dò folder', 'number')}
        {field('luiNgayKy', 'Ngày ký lùi so với hôm nay', 'number')}
        {field('thueTNCN', 'Thuế TNCN (0.1 = 10%)', 'number')}
        {field('thoiHanThanhToan', 'Thời hạn thanh toán (ngày)', 'number')}
        {field('baoTruocChamDut', 'Báo trước khi chấm dứt HĐ (ngày)', 'number')}
        {field('ngayThanhLy', 'Số ngày tới khi thanh lý', 'number')}
        {field('hangMucBbnt', 'Hạng mục BBNT')}
        {field('anhRongInch', 'Chiều rộng ảnh (inch)', 'number')}
      </div>
      <Button onClick={save} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Lưu cài đặt</Button>
    </div>
  );
}
