// Modal điền thông tin + sinh file HĐ/BBNT + copy lên Drive.
//
// Tách khỏi Contracts.tsx vì có HAI nơi mở nó: tab Hợp đồng (từ dòng sheet hoặc nút "Tạo HĐ
// mới") và trang Dự án (tick "có làm HĐ" khi thêm chi phí). Trước khi tách, luồng dự án phải
// nhảy view sang tab Hợp đồng — mất ngữ cảnh dự án đang xem.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, FolderInput, Loader2 } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { useAppData } from '../store/AppDataContext';
import { Button, Modal } from './ui';
import { docContractToken, luuContractPartner } from '../lib/actions';
import type { ContractSettingsDoc } from '../types';
import { chuanBi, LoiNguoiDung, xemTruoc, type ContractForm } from '../lib/contracts/compute';
import { demPlaceholderSot, taoHaiFile, taiXuong } from '../lib/contracts/docxFill';
import { catAnh, type CropRegion } from '../lib/contracts/imageCrop';
import { phanTichNhanh, type QuickParseResult } from '../lib/contracts/quickParse';

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

// Sheet ID / tên tab / thư mục Drive gốc KHÔNG nằm ở đây — chúng là User Properties của Apps
// Script (CONTRACT_SHEET_ID / CONTRACT_SHEET_TAB / CONTRACT_ROOT_FOLDER_ID), đặt bằng hàm
// thietLapCauHinhHopDong(). Xem khối chú thích đầu apps-script/sync.gs.
const MAC_DINH: ContractSettingsDoc = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30, baoTruocChamDut: 5, ngayThanhLy: 30,
  hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3, doSauDoFolder: 2,
};

/** Token giữ ở biến module: mọi trang mở modal đều cần, đọc lại Firestore mỗi lần mount thì
 *  banner "chưa cấu hình" nháy lên rồi tắt. Bộ nhớ chứ không localStorage — đây là bí mật. */
const nhoToken = { token: '' };

/** Cấu hình dùng chung cho mọi nơi mở ContractFormModal (tab Hợp đồng, trang Dự án). */
export function useContractConfig() {
  const { team } = useAppData();
  // Trải MAC_DINH TRƯỚC: doc cài đặt ghi thiếu field sẽ cho undefined → chuanBi ra Invalid Date
  // → số hợp đồng "NaNNaNNaN/HĐ/ALC-…".
  const settings: ContractSettingsDoc = useMemo(
    () => ({ ...MAC_DINH, ...team?.contractSettings }), [team?.contractSettings],
  );
  const [token, datToken] = useState(nhoToken.token);
  useEffect(() => {
    if (nhoToken.token) return;
    docContractToken().then((t) => { nhoToken.token = t; datToken(t); }).catch(() => {
      // Không đọc được token (rules chưa publish) — người dùng vẫn nhập tay ở Cài đặt.
    });
  }, []);
  const setToken = (t: string) => { nhoToken.token = t; datToken(t); };
  return { settings, webhookUrl: team?.sheetsWebhookUrl || '', token, setToken };
}

const O_FORM: [keyof ContractForm, string][] = [
  ['ho_ten', 'Họ tên'], ['xung_ho', 'Xưng hô (Ông/Bà)'], ['net', 'Tiền NET'],
  ['noi_dung', 'Nội dung công việc'], ['cccd', 'CCCD'], ['ngay_cap', 'Ngày cấp'],
  ['mst', 'MST'], ['dia_chi', 'Địa chỉ'], ['sdt', 'SĐT'], ['email', 'Email'],
  ['ten_tk', 'Tên tài khoản'], ['so_tk', 'Số tài khoản'], ['ngan_hang', 'Ngân hàng'],
];

export interface ContractFormModalProps {
  open: boolean;
  onClose: () => void;
  tieuDe: string;
  settings: ContractSettingsDoc;
  webhookUrl: string;
  token: string;
  /** Giá trị mở đầu của form. Đổi tham chiếu = nạp lại form (mỗi lần mở truyền object mới). */
  formBanDau: ContractForm;
  /** Hiện ô dán khối "THÔNG TIN THANH TOÁN" (tạo mới / mở từ dự án). */
  hienODan?: boolean;
  /** Link sản phẩm của dòng sheet, để lấy ảnh cho BBNT. */
  linkSp?: string;
  /** Cảnh báo sẵn có khi mở từ dòng sheet: dòng parser không hiểu + giá trị app đã tự sửa. */
  khongRoBanDau?: string[];
  gocNganHangBanDau?: string;
  /** Gọi sau khi tạo file thành công — nơi lưu liên kết dự án / đánh dấu khoản chi đã làm HĐ. */
  onTaoXong?: (hoTen: string) => void | Promise<void>;
}

export function ContractFormModal({
  open, onClose, tieuDe, settings, webhookUrl, token, formBanDau,
  hienODan, linkSp, khongRoBanDau, gocNganHangBanDau, onTaoXong,
}: ContractFormModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<ContractForm>(formBanDau);
  const [danText, setDanText] = useState('');
  const [phanTich, setPhanTich] = useState<QuickParseResult | null>(null);
  const [cropFile, setCropFile] = useState<Blob | null>(null);
  const [cropRegion] = useState<CropRegion | null>(null); // vùng chọn tay — UI kéo-thả để hoàn thiện sau
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ hd: Blob; bbnt: Blob; hdName: string; bbntName: string } | null>(null);
  // Bước xác nhận thư mục Drive: null = chưa tìm; mảng = đã tìm xong, đang chờ người dùng chọn.
  const [driveMatch, setDriveMatch] = useState<DriveFolder[] | null>(null);
  const [driveChoice, setDriveChoice] = useState(''); // '' = tạo folder mới theo tên đối tác
  // Thư mục đã upload xong. Giữ lại (không chỉ báo bằng toast) để còn bấm vào kiểm tra —
  // nhất là khi server tự tạo thư mục mới thì đây là cách duy nhất biết file nằm ở đâu.
  const [daUpload, setDaUpload] = useState<{ url: string; name: string } | null>(null);

  // Mở modal cho một đối tác khác = reset sạch, không để sót file/ảnh của người trước.
  useEffect(() => {
    setForm(formBanDau);
    setDanText('');
    setPhanTich(null);
    setCropFile(null);
    setGenerated(null);
    setDriveMatch(null);
    setDaUpload(null);
  }, [formBanDau]);

  const templateBytesRef = useRef<ArrayBuffer | null>(null);
  const getTemplateBytes = async (): Promise<ArrayBuffer> => {
    if (!templateBytesRef.current) {
      const res = await fetch(TEMPLATE_URL);
      templateBytesRef.current = await res.arrayBuffer();
    }
    return templateBytesRef.current;
  };

  const preview = useMemo(() => xemTruoc(form, settings), [form, settings]);

  /** Dán khối text -> tự chia vào các ô. Ghi ĐÈ toàn bộ form (không merge): người dùng vừa
   *  dán một khối mới nghĩa là muốn dùng khối đó, giữ lại mảnh cũ chỉ tạo dữ liệu lai.
   *  Riêng số tiền / nội dung công việc đã điền sẵn (từ khoản chi) thì giữ, vì khối thanh
   *  toán của đối tác không bao giờ chứa hai thứ đó. */
  const doiTextDan = (text: string) => {
    setDanText(text);
    if (!text.trim()) {
      setPhanTich(null);
      return;
    }
    const r = phanTichNhanh(text);
    setPhanTich(r);
    setForm((f) => ({
      ...r.form,
      net: r.form.net || f.net,
      noi_dung: r.form.noi_dung || f.noi_dung,
    }));
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

      // Lưu lịch sử đối tác / đánh dấu khoản chi chỉ là ghi chú kèm theo, không phải sản phẩm
      // giao — hỏng thì cảnh báo, không được làm mất nút "Copy lên Drive".
      try {
        await luuContractPartner(form);
        await onTaoXong?.(String(form.ho_ten || '').trim());
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

  const tenDoiTac = String(form.ho_ten || '').trim();

  /** Bước 1: hỏi server folder nào khớp tên đối tác. KHÔNG upload ngay — server khớp cả kiểu
   *  "chứa chuỗi con" nên "Anh" trúng "Anh Tuấn"; đẩy CCCD/STK nhầm folder là không lấy lại được. */
  const timFolderDrive = async () => {
    if (!generated || !tenDoiTac) return;
    if (!webhookUrl) return toast('Chưa cấu hình Webhook', 'error');
    if (!token) return toast('Chưa cấu hình Token ở Cài đặt', 'error');
    setBusy(true);
    try {
      const match = await callWebhook<{ ok: boolean; ket_qua?: DriveFolder[]; error?: string }>(
        webhookUrl,
        { action: 'contract-drive-match', token, ten: tenDoiTac, depth: settings.doSauDoFolder },
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

  const tenFolderDaChon = driveMatch?.find((f) => f.id === driveChoice)?.name;

  /** Bước 2: người dùng đã xác nhận đích đến → upload. driveChoice='' = để server tạo folder mới. */
  const xacNhanCopy = async () => {
    if (!generated || !tenDoiTac) return;
    setBusy(true);
    try {
      let dichId = '';
      let dichUrl = '';
      let dichTen = '';
      for (const [blob, name] of [
        [generated.hd, generated.hdName],
        [generated.bbnt, generated.bbntName],
      ] as [Blob, string][]) {
        const base64 = await blobToBase64(blob);
        const res = await callWebhook<{
          ok: boolean; error?: string; folderId?: string; folderUrl?: string; folderName?: string;
        }>(
          webhookUrl,
          {
            action: 'contract-drive-copy', token, filename: name, base64,
            folderId: driveChoice || undefined, ten: tenDoiTac,
          },
        );
        if (!res.ok) throw new Error(res.error || 'Lỗi copy file');
        // Server trả về thư mục THẬT SỰ đã ghi vào — khác driveChoice khi nó tự tạo mới.
        dichId = res.folderId || dichId;
        dichUrl = res.folderUrl || dichUrl;
        dichTen = res.folderName || dichTen;
      }
      toast('Đã copy 2 file lên Drive');
      setDaUpload({
        // folderUrl chỉ có ở bản Apps Script mới; bản cũ thì dựng URL từ id.
        url: dichUrl || (dichId ? `https://drive.google.com/drive/folders/${dichId}` : ''),
        name: dichTen || tenFolderDaChon || tenDoiTac,
      });
      setDriveMatch(null);
    } catch (e) {
      toast(`Lỗi copy lên Drive: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Cảnh báo hiện tại: của khối text vừa dán nếu có, không thì của dòng sheet đã mở.
  const khongRo = phanTich ? phanTich.khongRo : (khongRoBanDau ?? []);
  const gocNganHang = phanTich ? phanTich.goc.ngan_hang : gocNganHangBanDau;
  const nganHangDaDoi = phanTich ? phanTich.form.ngan_hang : form.ngan_hang;

  return (
    <>
      <Modal open={open} onClose={onClose} title={tieuDe}>
        <div className="space-y-3">
          {hienODan && (
            <label className="block text-sm">
              <span className="text-muted">Dán khối thông tin (Họ và Tên / CCCD / STK / …)</span>
              <textarea
                rows={6}
                autoFocus
                placeholder={['THÔNG TIN THANH TOÁN', 'Họ và Tên: …', 'CCCD: …', 'STK: …', 'Ngân Hàng: …'].join('\n')}
                className="mt-1 w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors font-mono"
                value={danText}
                onChange={(e) => doiTextDan(e.target.value)}
              />
              {phanTich && (
                <span className="mt-1 block text-[11px] text-emerald-400">
                  Nhận ra {phanTich.nhanRa.length} trường: {phanTich.nhanRa.join(', ') || '(không có)'}
                </span>
              )}
            </label>
          )}

          {O_FORM.map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-muted">{label}</span>
              {key === 'xung_ho' ? (
                <select
                  className="mt-1 w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors"
                  value={String(form.xung_ho ?? '')}
                  onChange={(e) => setForm((f) => ({ ...f, xung_ho: e.target.value }))}
                >
                  <option value="">(mặc định: Bà)</option>
                  <option value="Ông">Ông</option>
                  <option value="Bà">Bà</option>
                  {/* Nguồn dữ liệu có thể ghi cách xưng hô khác (Anh/Chị…). Giữ nguyên làm một
                      lựa chọn thay vì để select hiện trống — im lặng đổi dữ liệu người dùng đã
                      nhập là đúng thứ banks.ts cấm. */}
                  {!!form.xung_ho && !['Ông', 'Bà'].includes(String(form.xung_ho)) && (
                    <option value={String(form.xung_ho)}>{String(form.xung_ho)}</option>
                  )}
                </select>
              ) : (
                <input
                  className="mt-1 w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors"
                  value={String(form[key] ?? '')}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              )}
              {/* Ô nào app đã tự sửa thì phải NÓI RA: thứ người dùng nhìn thấy trong ô phải
                  đúng bằng thứ đi vào hợp đồng (xem đầu banks.ts). */}
              {key === 'ngan_hang' && gocNganHang && (
                <span className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-400">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>
                    Dữ liệu gốc ghi «{gocNganHang}» → app đổi thành «{nganHangDaDoi}».
                    Sai thì sửa lại ô trên.
                  </span>
                </span>
              )}
            </label>
          ))}

          {khongRo.length > 0 && (
            <div className="text-xs bg-amber-500/10 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {khongRo.length} dòng app không hiểu
              </p>
              <ul className="list-disc pl-4 text-muted break-words">
                {khongRo.map((d, i) => <li key={`${i}-${d}`}>{d}</li>)}
              </ul>
              <p className="text-dim">Nếu có thông tin cần dùng, tự điền tay vào ô tương ứng ở trên.</p>
            </div>
          )}

          {!!linkSp && /^https?:\/\//i.test(linkSp) && (
            <a
              href={linkSp} target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline break-all"
            >
              <ExternalLink size={14} className="shrink-0" /> Link sản phẩm (lấy ảnh cho BBNT)
            </a>
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

          {daUpload && (
            <div className="flex items-start gap-2 text-sm bg-emerald-500/10 rounded-lg p-3">
              <FolderInput size={15} className="shrink-0 mt-0.5 text-emerald-400" />
              <span className="text-emerald-400">
                Đã tải lên thư mục «{daUpload.name}».{' '}
                {daUpload.url ? (
                  <a
                    href={daUpload.url} target="_blank" rel="noreferrer noopener"
                    className="underline font-semibold inline-flex items-center gap-1"
                  >
                    Mở thư mục trên Drive <ExternalLink size={13} />
                  </a>
                ) : (
                  // Bản Apps Script cũ không trả folderId — nói thẳng thay vì đưa link hỏng.
                  <span className="text-muted">
                    (Apps Script bản cũ không trả về id thư mục nên chưa có link — deploy version mới để có.)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={driveMatch !== null}
        onClose={() => setDriveMatch(null)}
        title="Xác nhận thư mục Drive"
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Tìm theo tên «{tenDoiTac}» — {driveMatch?.length
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
              <span className="font-medium">Tạo thư mục mới «{tenDoiTac}» (trong folder tháng)</span>
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
    </>
  );
}
