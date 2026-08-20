import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Loader2, Plus, RefreshCw } from 'lucide-react';
import { getDoc } from 'firebase/firestore';
import { useToast } from '../hooks/useToast';
import { Button, EmptyState } from '../components/ui';
import { ContractFormModal, useContractConfig } from '../components/ContractFormModal';
import { useAppData } from '../store/AppDataContext';
import {
  capNhatContractSettings, luuContractToken, danhDauTaskDaLamHopDong,
  docContractPartners, idDoiTac, ref as dbRef,
} from '../lib/actions';
import type { ContractPartner, ContractSettingsDoc } from '../types';
import type { ContractForm } from '../lib/contracts/compute';
import type { QuickParseForm } from '../lib/contracts/quickParse';
import { danhSachTuRows, type SheetRow } from '../lib/contracts/sheetSync';
import { dongTuKhoanChi, laKhoanChiHopDong } from '../lib/contracts/fromTask';


/** Ô link có thể chỉ chứa chữ ("đã gửi", tên file…) khi sheet không gắn URL — chỉ dựng thẻ <a>
 *  khi thật sự là URL, còn lại hiện nguyên chữ để người dùng biết ô đang có gì. */
function laUrl(s?: string): boolean {
  return /^https?:\/\//i.test((s || '').trim());
}

/** Ô link trong bảng: URL → nút mở tab mới (URL dài, đổ cả chuỗi vào ô là vỡ bảng);
 *  chỉ có chữ → hiện nguyên chữ để không giấu mất dữ liệu người dùng đã ghi trong sheet. */
function OLink({ giaTri }: { giaTri: string }) {
  if (!laUrl(giaTri)) return <span className="text-dim" title={giaTri}>{giaTri || '—'}</span>;
  return (
    <a
      href={giaTri} target="_blank" rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-accent hover:underline"
      title={giaTri}
    >
      <ExternalLink size={13} /> Mở
    </a>
  );
}

/** Lịch sử đối tác (Firestore) -> các ô của form. Dùng ở cả autofill khi mở dòng sheet lẫn
 *  khi dựng dòng từ khoản chi, nên để một chỗ. */
const MAP_PARTNER: [keyof ContractPartner, keyof QuickParseForm][] = [
  ['xungHo', 'xung_ho'], ['cccd', 'cccd'], ['ngayCap', 'ngay_cap'], ['mst', 'mst'],
  ['diaChi', 'dia_chi'], ['sdt', 'sdt'], ['email', 'email'], ['tenTk', 'ten_tk'],
  ['soTk', 'so_tk'], ['nganHang', 'ngan_hang'],
];

function formTuPartner(h: ContractPartner): QuickParseForm {
  const f: QuickParseForm = {};
  for (const [src, dst] of MAP_PARTNER) {
    if (h[src]) (f as Record<string, unknown>)[dst] = h[src];
  }
  return f;
}

/** Danh sách sheet giữ lại giữa các lần rời/mở lại tab Hợp đồng (App.tsx unmount view cũ nên
 *  state trong component mất sạch). Để ở BỘ NHỚ, không localStorage: dữ liệu này có CCCD và
 *  số tài khoản, không nên nằm lại trên đĩa sau khi đóng trình duyệt. Hệ quả: F5 vẫn tải lại. */
const nhoDanhSach: {
  rows: SheetRow[];
  luc: number;
  partners: Record<string, ContractPartner>;
} = { rows: [], luc: 0, partners: {} };

type ContractsTab = 'doi-tac' | 'cai-dat';
const TAB_LABEL: Record<ContractsTab, string> = { 'doi-tac': 'Đối tác', 'cai-dat': 'Cài đặt' };

// Bảng chỉ giữ các cột dùng để CHỌN dòng cần làm; toàn bộ thông tin cá nhân gom vào một ô
// (xem CA_NHAN) — mở modal ra mới sửa từng trường, nên trải 13 cột ngang chỉ tốn màn hình.
const CA_NHAN: { key: keyof ContractForm; label: string }[] = [
  { key: 'xung_ho', label: 'Xưng hô' },
  { key: 'cccd', label: 'CCCD' },
  { key: 'ngay_cap', label: 'Ngày cấp' },
  { key: 'mst', label: 'MST' },
  { key: 'dia_chi', label: 'Địa chỉ' },
  { key: 'sdt', label: 'SĐT' },
  { key: 'email', label: 'Email' },
  { key: 'ten_tk', label: 'Tên TK' },
  { key: 'so_tk', label: 'Số TK' },
  { key: 'ngan_hang', label: 'Ngân hàng' },
];

function BangDoiTac({
  rows, daLamRoi, onOpen,
}: {
  rows: SheetRow[]; daLamRoi: (r: SheetRow) => boolean; onOpen: (r: SheetRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-surface border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-muted border-b border-line">
            <th className="px-3 py-2 font-semibold whitespace-nowrap">STT</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Trạng thái</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap min-w-[140px]">Dự án</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap min-w-[150px]">Họ tên</th>
            <th className="px-3 py-2 font-semibold min-w-[180px]">Nội dung công việc</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Số tiền</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Link SP</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Folder HĐ</th>
            <th className="px-3 py-2 font-semibold min-w-[280px]">Thông tin cá nhân</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const daLam = daLamRoi(r);
            const coCa = CA_NHAN.filter((c) => String(r.form[c.key] ?? '').trim());
            const thieu = CA_NHAN.filter((c) => !String(r.form[c.key] ?? '').trim());
            return (
              <tr
                key={r.taskId || `sheet-${r.dong}`}
                onClick={() => onOpen(r)}
                className="border-b border-line/60 last:border-0 hover:bg-accent/10 cursor-pointer align-top"
              >
                {/* STT của sheet; dòng chưa đánh số thì lấy số dòng để vẫn đối chiếu được. */}
                <td className="px-3 py-2 text-dim whitespace-nowrap">{r.stt || r.dong || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`text-[11px] font-bold ${daLam ? 'text-emerald-400' : 'text-accent'}`}>
                    {daLam ? 'ĐÃ LÀM' : 'NGƯỜI MỚI'}
                  </span>
                  {r.done && <span className="ml-1.5 text-[11px] font-bold text-dim">ĐÃ TT</span>}
                </td>
                {/* Chỉ dòng dựng từ khoản chi mới biết dự án — dòng của sheet để trống. */}
                <td className="px-3 py-2">
                  {r.projectTitle
                    ? <span className="text-accent">{r.projectTitle}</span>
                    : <span className="text-dim">—</span>}
                </td>
                <td className="px-3 py-2 font-medium">{r.ho_ten || <span className="text-dim">—</span>}</td>
                <td className="px-3 py-2">{r.noi_dung || <span className="text-dim">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.tien || <span className="text-dim">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap"><OLink giaTri={r.link_sp} /></td>
                <td className="px-3 py-2 whitespace-nowrap"><OLink giaTri={r.link_luu} /></td>
                {/* Gộp 10 trường cá nhân vào một ô, mỗi trường một dòng: ở bảng chỉ cần soát
                    "đủ chưa", sửa từng ô thì mở modal. Trường thiếu liệt kê riêng vì đó là
                    thứ quyết định hợp đồng có chỗ bị bỏ trống hay không. */}
                <td className="px-3 py-2 text-xs">
                  {coCa.length > 0 && (
                    <dl className="space-y-0.5">
                      {coCa.map((c) => (
                        <div key={c.key} className="flex gap-1.5">
                          <dt className="text-dim shrink-0 w-[68px]">{c.label}</dt>
                          <dd className="text-muted break-all">{String(r.form[c.key]).trim()}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {thieu.length > 0 && (
                    <p className="text-amber-400 mt-1.5">
                      Thiếu: {thieu.map((c) => c.label).join(', ')}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Contracts() {
  const toast = useToast();
  const { settings, webhookUrl, token, setToken } = useContractConfig();
  const { projects, allTasks } = useAppData();

  const [tab, setTab] = useState<ContractsTab>('doi-tac');
  const [rows, setRows] = useState<SheetRow[]>(nhoDanhSach.rows);
  const [taiLuc, setTaiLuc] = useState(nhoDanhSach.luc);
  // Lịch sử đối tác đã làm HĐ qua app, key = idDoiTac(hoTen). Xem `daLamRoi`.
  const [partners, setPartners] = useState<Record<string, ContractPartner>>(nhoDanhSach.partners);
  const [loadingList, setLoadingList] = useState(false);
  const [hienDaLam, setHienDaLam] = useState(false);
  const [selected, setSelected] = useState<SheetRow | null>(null);
  // `form` chỉ là GIÁ TRỊ MỞ ĐẦU đưa cho ContractFormModal; modal tự giữ state khi người
  // dùng gõ. Đổi tham chiếu object = modal nạp lại (xem effect trong ContractFormModal).
  const [form, setForm] = useState<ContractForm>({});
  // Tạo HĐ cho người KHÔNG có trong sheet: cùng modal, thêm ô dán khối "THÔNG TIN THANH TOÁN".
  const [taoMoi, setTaoMoi] = useState(false);

  const taiLaiDoiTac = useCallback(() => {
    docContractPartners().then((p) => { nhoDanhSach.partners = p; setPartners(p); }).catch(() => {
      // Không đọc được lịch sử (rules chưa publish) — chỉ mất nhãn "đã làm", không chặn gì.
    });
  }, []);
  useEffect(() => {
    if (Object.keys(nhoDanhSach.partners).length === 0) taiLaiDoiTac();
  }, [taiLaiDoiTac]);

  /** Đã từng làm HĐ cho người này chưa. Sheet chỉ biết qua cột Link HĐ / Link BBNT — hai cột
   *  đó do người dùng tự dán vào nên vừa tạo file xong sheet vẫn trống; lịch sử Firestore
   *  (ghi ngay lúc tạo file) là nguồn thứ hai để không gắn nhãn "NGƯỜI MỚI" nhầm. */
  const daLamRoi = useCallback(
    (r: SheetRow) => r.da_co_hd || r.da_co_bbnt || !!partners[idDoiTac(r.ho_ten || '')],
    [partners],
  );

  const taiLaiDanhSach = useCallback(async () => {
    if (!webhookUrl || !token) {
      toast('Chưa cấu hình Webhook / Token ở phần Cài đặt bên dưới', 'error');
      return;
    }
    setLoadingList(true);
    try {
      const url = `${webhookUrl}?action=contract-list&token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi không rõ');
      const ds = danhSachTuRows(data.rows, data.links);
      const luc = Date.now();
      setRows(ds);
      setTaiLuc(luc);
      nhoDanhSach.rows = ds;
      nhoDanhSach.luc = luc;
    } catch (e) {
      toast(`Lỗi tải danh sách: ${(e as Error).message}`, 'error');
    } finally {
      setLoadingList(false);
    }
  }, [webhookUrl, token, toast]);

  // Chỉ tự tải khi CHƯA có gì trong bộ nhớ. Trước đây effect này chạy mỗi lần mở tab Hợp đồng
  // nên đổi view qua lại là gọi lại webhook (chậm, và Apps Script có hạn mức).
  useEffect(() => {
    if (webhookUrl && token && nhoDanhSach.rows.length === 0) taiLaiDanhSach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl, token]);

  /** Hợp đồng phát sinh từ chi phí của dự án — nguồn thứ hai của bảng, xếp TRƯỚC dòng sheet
   *  vì đây là việc vừa được tạo trong app. Thông tin cá nhân tra từ lịch sử đối tác theo tên. */
  const dongDuAn = useMemo(() => {
    const theoId = new Map(projects.map((p) => [p.id, p]));
    return allTasks
      .filter(laKhoanChiHopDong)
      .map((t) => {
        const p = partners[idDoiTac(t.hopDongHoTen || '')];
        return dongTuKhoanChi(t, theoId.get(t.projectId), p ? formTuPartner(p) : undefined);
      });
  }, [allTasks, projects, partners]);

  const tatCaDong = useMemo(() => [...dongDuAn, ...rows], [dongDuAn, rows]);

  // Tách 2 nhóm: còn phải làm (mặc định hiện) và đã làm (thu gọn). Giữ nguyên thứ tự nguồn.
  const chuaLam = useMemo(() => tatCaDong.filter((r) => !daLamRoi(r)), [tatCaDong, daLamRoi]);
  const daLamList = useMemo(() => tatCaDong.filter((r) => daLamRoi(r)), [tatCaDong, daLamRoi]);

  // Autofill từ dòng sheet, ĐÈ THÊM (chỉ điền chỗ trống) bằng lịch sử Firestore nếu tên đối
  // tác trùng lần trước — khớp hành vi "gõ tên đối tác đã làm lần trước tự điền lại" của bản
  // Python (store.tim + gõ trùng tên). Lỗi tra lịch sử không chặn việc mở form (chỉ là tiện ích).
  const openRow = async (row: SheetRow) => {
    setSelected(row);
    setTaoMoi(false);
    setForm({ ...row.form });
    const next: ContractForm = { ...row.form };
    try {
      const snap = await getDoc(dbRef.contractPartner(idDoiTac(row.ho_ten || '')));
      if (snap.exists()) {
        const h = formTuPartner(snap.data() as ContractPartner);
        for (const k of Object.keys(h) as (keyof ContractForm)[]) {
          if (!next[k]) (next as Record<string, unknown>)[k] = h[k];
        }
      }
    } catch {
      // im lặng — tra lịch sử lỗi không nên chặn người dùng mở form sửa tay.
    }
    setForm(next);
  };

  /** Mở form trắng + ô dán. Người ngoài sheet vẫn phải làm HĐ được (đối tác phát sinh). */
  const moTaoMoi = () => {
    setSelected(null);
    setTaoMoi(true);
    setForm({});
  };

  const dongModal = () => { setSelected(null); setTaoMoi(false); };
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
          <Button variant="outline" onClick={moTaoMoi}>
            <Plus size={16} /> Tạo HĐ mới
          </Button>
        )}
        {tab === 'doi-tac' && (
          <Button onClick={taiLaiDanhSach} disabled={loadingList}>
            {loadingList ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Tải lại từ Sheet
          </Button>
        )}
      </div>

      {tab === 'doi-tac' && (!webhookUrl || !token) && (
        <div className="flex items-start gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-lg p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Chưa cấu hình Webhook / Token — sang tab Cài đặt trước. Sheet ID, tên tab và
            thư mục Drive gốc đặt ở phía Apps Script: mở Apps Script, sửa 4 giá trị trong hàm
            thietLapCauHinhHopDong() (CONTRACT_SHEET_ID / CONTRACT_SHEET_TAB /
            CONTRACT_ROOT_FOLDER_ID / CONTRACT_TOKEN) rồi bấm Run một lần.
          </span>
        </div>
      )}

      {tab === 'doi-tac' && (
        <>
          <BangDoiTac rows={chuaLam} daLamRoi={daLamRoi} onOpen={openRow} />
          {/* Hết người chưa làm thì phải nói ra — để trống trơn nhìn như tải hỏng. */}
          {!loadingList && rows.length > 0 && chuaLam.length === 0 && (
            <div className="bg-surface border border-line rounded-xl p-4 text-sm text-muted">
              Không còn đối tác nào chưa làm hợp đồng. Xem lại người đã làm ở mục bên dưới.
            </div>
          )}
          {!loadingList && rows.length === 0 && (
            <EmptyState icon={<RefreshCw size={28} />} text='Chưa có dữ liệu — bấm "Tải lại từ Sheet".' />
          )}

          {/* Người đã làm rồi vẫn phải xem lại được (làm lại, đổi thông tin) nhưng để lẫn vào
              danh sách thì mỗi lần vào phải lướt qua hàng chục dòng không còn việc gì. */}
          {daLamList.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setHienDaLam((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink cursor-pointer"
              >
                {hienDaLam ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                Đã làm ({daLamList.length})
              </button>
              {hienDaLam && <BangDoiTac rows={daLamList} daLamRoi={daLamRoi} onOpen={openRow} />}
            </div>
          )}

          {rows.length > 0 && (
            <p className="text-xs text-dim">
              {rows.length} đối tác{taiLuc ? ` · dữ liệu lúc ${new Date(taiLuc).toLocaleTimeString('vi-VN')}` : ''}
              {' · '}bấm vào một dòng để soát lại thông tin và tạo file.
              «ĐÃ LÀM» = sheet đã có link HĐ/BBNT, hoặc app đã từng tạo file cho tên này.
            </p>
          )}
        </>
      )}

      <ContractFormModal
        open={!!selected || taoMoi}
        onClose={dongModal}
        tieuDe={taoMoi ? 'Tạo hợp đồng mới' : `Sửa thông tin — ${selected?.ho_ten || '(chưa có tên)'}`}
        settings={settings}
        webhookUrl={webhookUrl}
        token={token}
        formBanDau={form}
        // Dòng từ khoản chi thường chưa có thông tin cá nhân — cần ô dán như khi tạo mới.
        hienODan={taoMoi || !!selected?.taskId}
        linkSp={selected?.link_sp}
        khongRoBanDau={selected?.khongRo}
        gocNganHangBanDau={selected?.goc.ngan_hang}
        onTaoXong={async (hoTen) => {
          // Dòng dựng từ khoản chi: ghi ngược lại task để lần sau hiện "ĐÃ LÀM".
          if (selected?.taskId && selected.projectId) {
            await danhDauTaskDaLamHopDong(selected.projectId, selected.taskId, hoTen);
          }
          taiLaiDoiTac();
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
