// Ráp dữ liệu form + validate. Port 1:1 từ D:\App\core\compute.py.

import { fmtSo, soThanhChu, tinhGross } from './money';
import { taoSoHopDong, tenFileBbnt, tenFileHd } from './naming';

export class LoiNguoiDung extends Error {
  ma: string;
  constructor(thongDiep: string, ma = 'loi') {
    super(thongDiep);
    this.ma = ma;
  }
}

export interface ContractSettings {
  luiNgayKy: number;
  thueTNCN: number;
  thoiHanThanhToan: number;
  baoTruocChamDut: number;
  ngayThanhLy: number;
  hangMucBbnt: string;
  anhRongInch: number;
}

export interface ContractForm {
  ho_ten?: string;
  net?: string | number;
  noi_dung?: string;
  xung_ho?: string;
  cccd?: string;
  ngay_cap?: string;
  mst?: string;
  dia_chi?: string;
  sdt?: string;
  email?: string;
  ten_tk?: string;
  so_tk?: string;
  ngan_hang?: string;
}

const BAT_BUOC = ['ho_ten', 'net', 'noi_dung'] as const;
const NHAN: Record<string, string> = {
  ho_ten: 'Họ tên', net: 'Số tiền NET', noi_dung: 'Nội dung công việc',
  cccd: 'CCCD', ngay_cap: 'Ngày cấp CCCD', mst: 'MST', dia_chi: 'Địa chỉ',
  sdt: 'Số điện thoại', email: 'Email', ten_tk: 'Tên tài khoản',
  so_tk: 'Số tài khoản', ngan_hang: 'Ngân hàng',
};
const TUY_CHON = ['cccd', 'ngay_cap', 'dia_chi', 'sdt', 'email', 'ten_tk', 'so_tk', 'ngan_hang'] as const;

function s(v: unknown): string {
  return String(v ?? '').trim();
}

export function docTien(giaTri: unknown): number {
  let n: number;
  if (typeof giaTri === 'number') {
    n = Math.trunc(giaTri);
  } else {
    let sach = s(giaTri);
    sach = sach.replace(/\s*(đ|vnđ|vnd|₫)\s*$/i, '');
    sach = sach.replace(/[.\s,]/g, '');
    if (!/^\d+$/.test(sach)) throw new LoiNguoiDung('Số tiền NET phải là số.', 'net_sai');
    n = Number(sach);
  }
  if (n <= 0) throw new LoiNguoiDung('Số tiền NET phải lớn hơn 0.', 'net_sai');
  return n;
}

function thieu(form: ContractForm): string[] {
  return BAT_BUOC.filter((k) => !s((form as Record<string, unknown>)[k])).map((k) => NHAN[k]);
}

export interface PreparedData {
  ho_ten: string;
  xung_ho: string;
  cccd: string;
  ngay_cap: string;
  mst: string;
  dia_chi: string;
  sdt: string;
  email: string;
  ten_tk: string;
  so_tk: string;
  ngan_hang: string;
  noi_dung: string;
  net: number;
  ngay_bbnt: Date;
  ngay_hd: Date;
  so_hd: string;
}

/** Ráp dữ liệu form thành dữ liệu sẵn sàng điền vào docx. Ném LoiNguoiDung nếu thiếu trường bắt buộc. */
export function chuanBi(form: ContractForm, cfg: ContractSettings, homNay: Date = new Date()): PreparedData {
  const cacTruongThieu = thieu(form);
  if (cacTruongThieu.length) {
    throw new LoiNguoiDung('Còn thiếu: ' + cacTruongThieu.join(', '), 'thieu_truong');
  }
  const strKeys = ['ho_ten', 'noi_dung', 'cccd', 'ngay_cap', 'mst', 'dia_chi', 'sdt', 'email', 'ten_tk', 'so_tk', 'ngan_hang'] as const;
  const d: Record<string, string> = {};
  for (const k of strKeys) d[k] = s((form as Record<string, unknown>)[k]);

  const net = docTien(form.net);
  const xungHo = s(form.xung_ho) || 'Bà';
  const mst = d.mst || d.cccd;
  const ngayBbnt = homNay;
  const ngayHd = new Date(homNay);
  ngayHd.setDate(ngayHd.getDate() - cfg.luiNgayKy);
  const soHd = taoSoHopDong(d.ho_ten, ngayHd);

  return {
    ho_ten: d.ho_ten, xung_ho: xungHo, cccd: d.cccd, ngay_cap: d.ngay_cap, mst,
    dia_chi: d.dia_chi, sdt: d.sdt, email: d.email, ten_tk: d.ten_tk, so_tk: d.so_tk,
    ngan_hang: d.ngan_hang, noi_dung: d.noi_dung, net,
    ngay_bbnt: ngayBbnt, ngay_hd: ngayHd, so_hd: soHd,
  };
}

export interface PreviewResult {
  sanSang: boolean;
  soHd: string;
  ngayHd: string;
  ngayBbnt: string;
  net: string;
  netChu: string;
  gross: string;
  grossChu: string;
  tenFileHd: string;
  tenFileBbnt: string;
  canhBao: string[];
}

function fmtDMY(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Không bao giờ ném lỗi — chạy mỗi lần người dùng gõ. */
export function xemTruoc(form: ContractForm, cfg: ContractSettings, homNay: Date = new Date()): PreviewResult {
  const cacTruongThieu = thieu(form);
  const canhBao = cacTruongThieu.map((t) => 'Chưa điền ' + t);
  const ngayHd = new Date(homNay);
  ngayHd.setDate(ngayHd.getDate() - cfg.luiNgayKy);
  const hoTen = s(form.ho_ten);
  const noiDung = s(form.noi_dung);

  let net = 0;
  try {
    net = docTien(form.net);
  } catch (e) {
    if (e instanceof LoiNguoiDung && !canhBao.join(' ').includes(NHAN.net)) {
      canhBao.push(e.message);
    }
  }
  const gross = net ? tinhGross(net, cfg.thueTNCN) : 0;

  for (const k of TUY_CHON) {
    if (!s((form as Record<string, unknown>)[k])) {
      canhBao.push(`Thiếu ${NHAN[k]} — chỗ này sẽ để trống trong văn bản`);
    }
  }
  if (!s(form.mst)) canhBao.push('Thiếu MST — sẽ tự lấy bằng CCCD');

  return {
    sanSang: cacTruongThieu.length === 0 && net > 0,
    soHd: hoTen ? taoSoHopDong(hoTen, ngayHd) : '',
    ngayHd: fmtDMY(ngayHd),
    ngayBbnt: fmtDMY(homNay),
    net: net ? fmtSo(net) : '',
    netChu: net ? soThanhChu(net) : '',
    gross: gross ? fmtSo(gross) : '',
    grossChu: gross ? soThanhChu(gross) : '',
    tenFileHd: hoTen && noiDung ? tenFileHd(hoTen, noiDung) : '',
    tenFileBbnt: hoTen && noiDung ? tenFileBbnt(hoTen, noiDung) : '',
    canhBao,
  };
}
