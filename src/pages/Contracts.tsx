import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FolderInput, Loader2, RefreshCw } from 'lucide-react';
import { getDoc } from 'firebase/firestore';
import { useAppData } from '../store/AppDataContext';
import { useToast } from '../hooks/useToast';
import { Button, Modal, EmptyState } from '../components/ui';
import {
  luuContractPartner, capNhatContractSettings, docContractToken, luuContractToken,
  idDoiTac, ref as dbRef,
} from '../lib/actions';
import type { ContractPartner, ContractSettingsDoc } from '../types';
import { chuanBi, LoiNguoiDung, xemTruoc, type ContractForm } from '../lib/contracts/compute';
import { demPlaceholderSot, taoHaiFile, taiXuong } from '../lib/contracts/docxFill';
import { catAnh, type CropRegion } from '../lib/contracts/imageCrop';
import { danhSachTuRows, type SheetRow } from '../lib/contracts/sheetSync';

// Sheet ID / tên tab / thư mục Drive gốc KHÔNG còn nằm ở đây — chúng là User Properties của
// Apps Script (CONTRACT_SHEET_ID / CONTRACT_SHEET_TAB / CONTRACT_ROOT_FOLDER_ID), đặt bằng
// hàm thietLapCauHinhHopDong(). Xem khối chú thích đầu apps-script/sync.gs.
const MAC_DINH: ContractSettingsDoc = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30, baoTruocChamDut: 5, ngayThanhLy: 30,
  hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3, doSauDoFolder: 2,
};

const TEMPLATE_URL = new URL('../assets/contracts/HDDV_BBNT_Mau_moi.docx', import.meta.url).href;

/** Base64 theo lô ~8KB. Nối từng byte một (String.fromCharCode trong vòng lặp + `+=`) làm
 *  đơ trình duyệt vài giây với ảnh vài MB — ảnh đã thu nhỏ ở catAnh nhưng file .docx vẫn có
 *  thể lớn. Lô phải đủ nhỏ để không vượt giới hạn số tham số của Function.apply. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const LO = 8192;
  const phan: string[] = [];
  for (let i = 0; i < buf.length; i += LO) {
    phan.push(String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + LO))));
  }
  return btoa(phan.join(''));
}

async function callWebhook<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}

interface DriveFolder { id: string; name: string }

export function Contracts() {
  const { team } = useAppData();
  const toast = useToast();
  // Trải MAC_DINH TRƯỚC: doc cài đặt ghi thiếu field sẽ cho undefined → chuanBi ra Invalid Date
  // → số hợp đồng "NaNNaNNaN/HĐ/ALC-…".
  const settings: ContractSettingsDoc = useMemo(
    () => ({ ...MAC_DINH, ...team?.contractSettings }), [team?.contractSettings],
  );
  const webhookUrl = team?.sheetsWebhookUrl || '';

  const [token, setToken] = useState('');
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState<SheetRow | null>(null);
  const [form, setForm] = useState<ContractForm>({});
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [cropRegion] = useState<CropRegion | null>(null); // vùng chọn tay — UI kéo-thả để hoàn thiện sau
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ hd: Blob; bbnt: Blob; hdName: string; bbntName: string } | null>(null);
  // Bước xác nhận thư mục Drive: null = chưa tìm; mảng = đã tìm xong, đang chờ người dùng chọn.
  const [driveMatch, setDriveMatch] = useState<DriveFolder[] | null>(null);
  const [driveChoice, setDriveChoice] = useState(''); // '' = tạo folder mới theo tên đối tác

  useEffect(() => {
    docContractToken().then(setToken).catch(() => {
      // Không đọc được token (rules chưa publish) — người dùng vẫn nhập tay ở Cài đặt.
    });
  }, []);

  const templateBytesRef = useRef<ArrayBuffer | null>(null);
  const getTemplateBytes = async (): Promise<ArrayBuffer> => {
    if (!templateBytesRef.current) {
      const res = await fetch(TEMPLATE_URL);
      templateBytesRef.current = await res.arrayBuffer();
    }
    return templateBytesRef.current;
  };

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
      setRows(danhSachTuRows(data.rows));
    } catch (e) {
      toast(`Lỗi tải danh sách: ${(e as Error).message}`, 'error');
    } finally {
      setLoadingList(false);
    }
  }, [webhookUrl, token, toast]);

  useEffect(() => {
    if (webhookUrl && token) taiLaiDanhSach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl, token]);

  const preview = useMemo(() => xemTruoc(form, settings), [form, settings]);

  // Autofill từ dòng sheet, ĐÈ THÊM (chỉ điền chỗ trống) bằng lịch sử Firestore nếu tên đối
  // tác trùng lần trước — khớp hành vi "gõ tên đối tác đã làm lần trước tự điền lại" của bản
  // Python (store.tim + gõ trùng tên). Lỗi tra lịch sử không chặn việc mở form (chỉ là tiện ích).
  const openRow = async (row: SheetRow) => {
    setSelected(row);
    setGenerated(null);
    setCropFile(null);
    setDriveMatch(null);
    const next: ContractForm = { ...row.form };
    try {
      const snap = await getDoc(dbRef.contractPartner(idDoiTac(row.ho_ten || '')));
      if (snap.exists()) {
        const h = snap.data() as ContractPartner;
        const map: [keyof ContractPartner, keyof ContractForm][] = [
          ['xungHo', 'xung_ho'], ['cccd', 'cccd'], ['ngayCap', 'ngay_cap'], ['mst', 'mst'],
          ['diaChi', 'dia_chi'], ['sdt', 'sdt'], ['email', 'email'], ['tenTk', 'ten_tk'],
          ['soTk', 'so_tk'], ['nganHang', 'ngan_hang'],
        ];
        for (const [src, dst] of map) {
          if (!next[dst] && h[src]) (next as Record<string, unknown>)[dst] = h[src];
        }
      }
    } catch {
      // im lặng — tra lịch sử lỗi không nên chặn người dùng mở form sửa tay.
    }
    setForm(next);
  };

  const taoFile = async () => {
    setBusy(true);
    try {
      const d = chuanBi(form, settings);
      let anh: { bytes: Uint8Array; widthPx: number; heightPx: number } | undefined;
      if (cropFile) {
        // Cạnh dài ≈ chiều rộng in (inch) × 300 DPI — Word không dùng tới độ nét hơn thế.
        const c = await catAnh(cropFile, cropRegion, Math.round(settings.anhRongInch * 300));
        anh = { bytes: c.bytes, widthPx: c.widthPx, heightPx: c.heightPx };
      }
      const templateBytes = await getTemplateBytes();
      const { hdBlob, bbntBlob, hdFilename, bbntFilename } = await taoHaiFile(d, settings, templateBytes, anh);
      taiXuong(hdBlob, hdFilename);
      taiXuong(bbntBlob, bbntFilename);
      // Đặt generated NGAY sau khi tải xong: file đã ra tay người dùng rồi, đừng để một lỗi
      // ghi Firestore (vd rules chưa publish) làm mất nút "Copy lên Drive".
      setGenerated({ hd: hdBlob, bbnt: bbntBlob, hdName: hdFilename, bbntName: bbntFilename });
      toast('Đã tạo và tải 2 file HĐ + BBNT');

      // Kiểm placeholder còn sót: mẫu bị sửa/đổi là hợp đồng ra ngoài với dấu "…" chưa điền.
      const [sotHd, sotBb] = await Promise.all([demPlaceholderSot(hdBlob), demPlaceholderSot(bbntBlob)]);
      if (sotHd + sotBb > 0) {
        toast(`⚠ Còn ${sotHd + sotBb} chỗ "…" chưa điền (HĐ: ${sotHd}, BBNT: ${sotBb}) — mở file kiểm lại trước khi gửi.`, 'error');
      }

      // Lưu lịch sử đối tác chỉ là tiện ích autofill lần sau, không phải sản phẩm giao.
      try {
        await luuContractPartner(form);
      } catch (e) {
        console.warn('Không lưu được lịch sử đối tác:', e);
      }
    } catch (e) {
      const msg = e instanceof LoiNguoiDung ? e.message : (e as Error).message;
      toast(`Lỗi: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Bước 1: hỏi server folder nào khớp tên đối tác. KHÔNG upload ngay — server khớp cả kiểu
   *  "chứa chuỗi con" nên "Anh" trúng "Anh Tuấn"; đẩy CCCD/STK nhầm folder là không lấy lại được. */
  const timFolderDrive = async () => {
    if (!generated || !selected) return;
    if (!webhookUrl) return toast('Chưa cấu hình Webhook', 'error');
    if (!token) return toast('Chưa cấu hình Token ở Cài đặt', 'error');
    setBusy(true);
    try {
      const match = await callWebhook<{ ok: boolean; ket_qua?: DriveFolder[]; error?: string }>(
        webhookUrl,
        { action: 'contract-drive-match', token, ten: selected.ho_ten, depth: settings.doSauDoFolder },
      );
      if (!match.ok) throw new Error(match.error || 'Lỗi tìm folder');
      const ds = match.ket_qua || [];
      setDriveMatch(ds);
      // Chỉ chọn sẵn khi khớp DUY NHẤT 1 folder; nhiều/không có thì bắt người dùng tự quyết.
      setDriveChoice(ds.length === 1 ? ds[0].id : '');
    } catch (e) {
      toast(`Lỗi tìm folder Drive: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Bước 2: người dùng đã xác nhận đích đến → upload. driveChoice='' = để server tạo folder mới. */
  const xacNhanCopy = async () => {
    if (!generated || !selected) return;
    setBusy(true);
    try {
      for (const [blob, name] of [
        [generated.hd, generated.hdName],
        [generated.bbnt, generated.bbntName],
      ] as [Blob, string][]) {
        const base64 = await blobToBase64(blob);
        const res = await callWebhook<{ ok: boolean; error?: string }>(webhookUrl, {
          action: 'contract-drive-copy', token, filename: name, base64,
          folderId: driveChoice || undefined, ten: selected.ho_ten,
        });
        if (!res.ok) throw new Error(res.error || 'Lỗi copy file');
      }
      toast('Đã copy 2 file lên Drive');
      setDriveMatch(null);
    } catch (e) {
      toast(`Lỗi copy lên Drive: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const tenFolderDaChon = driveMatch?.find((f) => f.id === driveChoice)?.name;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Hợp đồng KOL/KOC</h1>
        <Button onClick={taiLaiDanhSach} disabled={loadingList}>
          {loadingList ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Tải lại từ Sheet
        </Button>
      </div>

      {(!webhookUrl || !token) && (
        <div className="flex items-start gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-lg p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Chưa cấu hình Webhook / Token — vào phần Cài đặt bên dưới trước. Sheet ID, tên tab và
            thư mục Drive gốc đặt ở phía Apps Script: mở Apps Script, sửa 4 giá trị trong hàm
            thietLapCauHinhHopDong() (CONTRACT_SHEET_ID / CONTRACT_SHEET_TAB /
            CONTRACT_ROOT_FOLDER_ID / CONTRACT_TOKEN) rồi bấm Run một lần.
          </span>
        </div>
      )}

      <div className="grid gap-2">
        {rows.map((r) => (
          <button
            key={r.dong}
            onClick={() => openRow(r)}
            className="text-left bg-surface border border-line rounded-xl p-3 hover:border-accent transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">{r.ho_ten || '(chưa có tên)'}</span>
              {r.nguoi_moi && <span className="text-[11px] font-bold text-accent">NGƯỜI MỚI</span>}
            </div>
            <div className="text-sm text-muted">{r.noi_dung} · {r.tien}</div>
          </button>
        ))}
        {!loadingList && rows.length === 0 && (
          <EmptyState icon={<RefreshCw size={28} />} text='Chưa có dữ liệu — bấm "Tải lại từ Sheet".' />
        )}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Sửa thông tin — ${selected?.ho_ten || '(chưa có tên)'}`}
      >
        <div className="space-y-3">
          {(
            [
              ['ho_ten', 'Họ tên'], ['xung_ho', 'Xưng hô (Ông/Bà)'], ['net', 'Tiền NET'],
              ['noi_dung', 'Nội dung công việc'], ['cccd', 'CCCD'], ['ngay_cap', 'Ngày cấp'],
              ['mst', 'MST'], ['dia_chi', 'Địa chỉ'], ['sdt', 'SĐT'], ['email', 'Email'],
              ['ten_tk', 'Tên tài khoản'], ['so_tk', 'Số tài khoản'], ['ngan_hang', 'Ngân hàng'],
            ] as [keyof ContractForm, string][]
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-muted">{label}</span>
              <input
                className="mt-1 w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors"
                value={String(form[key] ?? '')}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
              {/* Ô nào app đã tự sửa thì phải NÓI RA: thứ người dùng nhìn thấy trong ô phải
                  đúng bằng thứ đi vào hợp đồng (xem đầu banks.ts). */}
              {key === 'ngan_hang' && selected?.goc.ngan_hang && (
                <span className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-400">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>
                    Sheets ghi «{selected.goc.ngan_hang}» → app đổi thành «{selected.form.ngan_hang}».
                    Sai thì sửa lại ô trên.
                  </span>
                </span>
              )}
            </label>
          ))}

          {!!selected?.khongRo.length && (
            <div className="text-xs bg-amber-500/10 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {selected.khongRo.length} dòng trong cột "Thông tin" app không hiểu
              </p>
              <ul className="list-disc pl-4 text-muted break-words">
                {selected.khongRo.map((d, i) => <li key={`${i}-${d}`}>{d}</li>)}
              </ul>
              <p className="text-dim">Nếu có thông tin cần dùng, tự điền tay vào ô tương ứng ở trên.</p>
            </div>
          )}

          <label className="block text-sm">
            <span className="text-muted">Ảnh chứng minh (BBNT)</span>
            <input
              type="file" accept="image/png,image/jpeg"
              className="mt-1 w-full text-sm"
              onChange={(e) => setCropFile(e.target.files?.[0] || null)}
            />
          </label>

          {!preview.sanSang && (
            <ul className="text-xs text-amber-400 list-disc pl-4">
              {preview.canhBao.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
          {preview.sanSang && (
            <p className="text-xs text-muted">Số HĐ dự kiến: {preview.soHd} · Gross: {preview.gross}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={taoFile} disabled={busy || !preview.sanSang}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Tạo &amp; Tải file
            </Button>
            {generated && (
              <Button variant="outline" onClick={timFolderDrive} disabled={busy}>
                <FolderInput size={16} /> Copy lên Drive
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={driveMatch !== null}
        onClose={() => setDriveMatch(null)}
        title="Xác nhận thư mục Drive"
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Tìm theo tên «{selected?.ho_ten}» — {driveMatch?.length
              ? `thấy ${driveMatch.length} thư mục`
              : 'KHÔNG thấy thư mục nào khớp'}.
          </p>
          {driveMatch && driveMatch.length > 1 && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 rounded-lg p-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                Nhiều kết quả vì server khớp cả tên chứa chuỗi con. Chọn nhầm là gửi CCCD / số tài
                khoản vào thư mục của người khác — kiểm kỹ tên trước khi bấm.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            {driveMatch?.map((f) => (
              <label key={f.id} className="flex items-center gap-2 bg-bg border border-line rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="radio" name="drive-folder" value={f.id}
                  checked={driveChoice === f.id}
                  onChange={() => setDriveChoice(f.id)}
                />
                <span className="font-medium break-all">{f.name}</span>
              </label>
            ))}
            <label className="flex items-center gap-2 bg-bg border border-line rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="radio" name="drive-folder" value=""
                checked={driveChoice === ''}
                onChange={() => setDriveChoice('')}
              />
              <span className="font-medium">Tạo thư mục mới «{selected?.ho_ten}» (trong folder tháng)</span>
            </label>
          </div>

          <p className="text-xs text-dim">
            Sẽ tải lên: {generated?.hdName} · {generated?.bbntName}
            {' → '}
            {tenFolderDaChon ? `thư mục «${tenFolderDaChon}»` : 'thư mục mới'}
          </p>

          <div className="flex gap-2 pt-1">
            <Button onClick={xacNhanCopy} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <FolderInput size={16} />}
              Xác nhận tải lên
            </Button>
            <Button variant="ghost" onClick={() => setDriveMatch(null)} disabled={busy}>Huỷ</Button>
          </div>
        </div>
      </Modal>

      <ContractSettingsPanel
        settings={settings}
        token={token}
        onToken={setToken}
        onSaved={() => toast('Đã lưu cài đặt')}
      />
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
