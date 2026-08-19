import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FolderInput, Loader2, RefreshCw } from 'lucide-react';
import { getDoc } from 'firebase/firestore';
import { useAppData } from '../store/AppDataContext';
import { useToast } from '../hooks/useToast';
import { Button, Modal, EmptyState } from '../components/ui';
import { luuContractPartner, capNhatContractSettings, ref as dbRef } from '../lib/actions';
import { chuanHoa } from '../lib/contracts/naming';
import type { ContractPartner, ContractSettingsDoc } from '../types';
import { chuanBi, LoiNguoiDung, xemTruoc, type ContractForm } from '../lib/contracts/compute';
import { taoHaiFile, taiXuong } from '../lib/contracts/docxFill';
import { catAnh, type CropRegion } from '../lib/contracts/imageCrop';
import { danhSachTuRows, type SheetRow } from '../lib/contracts/sheetSync';

const MAC_DINH: ContractSettingsDoc = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30, baoTruocChamDut: 5, ngayThanhLy: 30,
  hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3,
  sheetId: '', sheetTab: 'Thanh Toán', thuMucGocDriveId: '', doSauDoFolder: 2,
};

const TEMPLATE_URL = new URL('../assets/contracts/HDDV_BBNT_Mau_moi.docx', import.meta.url).href;

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

async function callWebhook<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
  return res.json();
}

export function Contracts() {
  const { team } = useAppData();
  const toast = useToast();
  const settings: ContractSettingsDoc = team?.contractSettings || MAC_DINH;
  const webhookUrl = team?.sheetsWebhookUrl || '';

  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState<SheetRow | null>(null);
  const [form, setForm] = useState<ContractForm>({});
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [cropRegion] = useState<CropRegion | null>(null); // vùng chọn tay — UI kéo-thả để hoàn thiện sau
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ hd: Blob; bbnt: Blob; hdName: string; bbntName: string } | null>(null);

  const templateBytesRef = useRef<ArrayBuffer | null>(null);
  const getTemplateBytes = async (): Promise<ArrayBuffer> => {
    if (!templateBytesRef.current) {
      const res = await fetch(TEMPLATE_URL);
      templateBytesRef.current = await res.arrayBuffer();
    }
    return templateBytesRef.current;
  };

  const taiLaiDanhSach = async () => {
    if (!webhookUrl || !settings.sheetId) {
      toast('Chưa cấu hình Webhook / Sheet ID ở phần cài đặt bên dưới', 'error');
      return;
    }
    setLoadingList(true);
    try {
      const url = `${webhookUrl}?action=contract-list&sheetId=${encodeURIComponent(settings.sheetId)}&sheetTab=${encodeURIComponent(settings.sheetTab)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi không rõ');
      setRows(danhSachTuRows(data.rows));
    } catch (e) {
      toast(`Lỗi tải danh sách: ${(e as Error).message}`, 'error');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (webhookUrl && settings.sheetId) taiLaiDanhSach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl, settings.sheetId, settings.sheetTab]);

  const preview = useMemo(() => xemTruoc(form, settings), [form, settings]);

  // Autofill từ dòng sheet, ĐÈ THÊM (chỉ điền chỗ trống) bằng lịch sử Firestore nếu tên đối
  // tác trùng lần trước — khớp hành vi "gõ tên đối tác đã làm lần trước tự điền lại" của bản
  // Python (store.tim + gõ trùng tên). Lỗi tra lịch sử không chặn việc mở form (chỉ là tiện ích).
  const openRow = async (row: SheetRow) => {
    setSelected(row);
    setGenerated(null);
    setCropFile(null);
    const next: ContractForm = { ...row.form };
    try {
      const snap = await getDoc(dbRef.contractPartner(chuanHoa(row.ho_ten || '')));
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
        const c = await catAnh(cropFile, cropRegion);
        anh = { bytes: c.bytes, widthPx: c.widthPx, heightPx: c.heightPx };
      }
      const templateBytes = await getTemplateBytes();
      const { hdBlob, bbntBlob, hdFilename, bbntFilename } = await taoHaiFile(d, settings, templateBytes, anh);
      taiXuong(hdBlob, hdFilename);
      taiXuong(bbntBlob, bbntFilename);
      await luuContractPartner(form);
      setGenerated({ hd: hdBlob, bbnt: bbntBlob, hdName: hdFilename, bbntName: bbntFilename });
      toast('Đã tạo và tải 2 file HĐ + BBNT');
    } catch (e) {
      const msg = e instanceof LoiNguoiDung ? e.message : (e as Error).message;
      toast(`Lỗi: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyLenDrive = async () => {
    if (!generated || !selected) return;
    if (!webhookUrl) return toast('Chưa cấu hình Webhook', 'error');
    if (!settings.thuMucGocDriveId) return toast('Chưa cấu hình Thư mục gốc Drive ở Cài đặt', 'error');
    setBusy(true);
    try {
      const match = await callWebhook<{ ok: boolean; ket_qua: { id: string; name: string }[]; error?: string }>(
        webhookUrl,
        { action: 'contract-drive-match', ten: selected.ho_ten, rootFolderId: settings.thuMucGocDriveId, depth: settings.doSauDoFolder },
      );
      if (!match.ok) throw new Error(match.error || 'Lỗi tìm folder');
      const folderId = match.ket_qua[0]?.id;

      for (const [blob, name] of [
        [generated.hd, generated.hdName],
        [generated.bbnt, generated.bbntName],
      ] as [Blob, string][]) {
        const base64 = await blobToBase64(blob);
        const res = await callWebhook<{ ok: boolean; error?: string }>(webhookUrl, {
          action: 'contract-drive-copy', filename: name, base64,
          folderId, rootFolderId: settings.thuMucGocDriveId, ten: selected.ho_ten,
        });
        if (!res.ok) throw new Error(res.error || 'Lỗi copy file');
      }
      toast('Đã copy 2 file lên Drive');
    } catch (e) {
      toast(`Lỗi copy lên Drive: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Hợp đồng KOL/KOC</h1>
        <Button onClick={taiLaiDanhSach} disabled={loadingList}>
          {loadingList ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Tải lại từ Sheet
        </Button>
      </div>

      {!settings.sheetId && (
        <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-lg p-3">
          <AlertTriangle size={16} /> Chưa cấu hình Sheet ID / Webhook / Thư mục Drive gốc — vào phần Cài đặt bên dưới trước.
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
            </label>
          ))}

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
              <Button variant="outline" onClick={copyLenDrive} disabled={busy}>
                <FolderInput size={16} /> Copy lên Drive
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <ContractSettingsPanel settings={settings} onSaved={() => toast('Đã lưu cài đặt')} />
    </div>
  );
}

function ContractSettingsPanel({ settings, onSaved }: { settings: ContractSettingsDoc; onSaved: () => void }) {
  const [local, setLocal] = useState(settings);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => setLocal(settings), [settings]);

  const save = async () => {
    setBusy(true);
    try {
      await capNhatContractSettings(local);
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {field('sheetId', 'Sheet ID')}
        {field('sheetTab', 'Tên tab')}
        {field('thuMucGocDriveId', 'Thư mục gốc Drive (folder ID)')}
        {field('doSauDoFolder', 'Độ sâu dò folder', 'number')}
        {field('luiNgayKy', 'Ngày ký lùi so với hôm nay', 'number')}
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
