// Tách thông tin đối tác từ khối text (cột "Thông tin" của sheet "Danh sách làm HĐ").
// Port từ D:\App\core\quick_parse.py, BỎ bước _tach_o (unwrap TSV nhiều ô dán từ clipboard)
// vì input ở v2 luôn là text của MỘT cell đọc qua Sheets API — không có lớp bọc TSV.
// Cố ý KHÔNG đoán mò: nhãn nào không nhận ra thì báo lại ở `khongRo`.

import { chuanTenNganHang } from './banks';
import { fmtSo } from './money';
import { boDau, chuanHoa } from './naming';

export interface QuickParseForm {
  ho_ten?: string;
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
  noi_dung?: string;
  net?: string;
}

export interface QuickParseResult {
  form: QuickParseForm;
  nhanRa: string[];
  boQua: string[];
  khongRo: string[];
  goc: Partial<Record<keyof QuickParseForm, string>>;
}

// Nhãn (đã chuẩn hoá: bỏ dấu, viết thường) -> tên trường trong form.
const NHAN: Record<string, keyof QuickParseForm> = {
  'ho ten': 'ho_ten', 'ten': 'ho_ten', 'ho va ten': 'ho_ten',
  'dai dien': 'ho_ten', 'nguoi dai dien': 'ho_ten',
  'ong': 'ho_ten', 'ba': 'ho_ten', 'ong/ba': 'ho_ten', 'ong ba': 'ho_ten',
  'so cmnd/cccd': 'cccd', 'so cmnd cccd': 'cccd', 'cmnd/cccd': 'cccd',
  'cccd': 'cccd', 'cmnd': 'cccd', 'so cccd': 'cccd', 'so cmnd': 'cccd',
  'can cuoc': 'cccd', 'so can cuoc': 'cccd',
  'ngay cap': 'ngay_cap',
  'dia chi thuong tru': 'dia_chi', 'dia chi': 'dia_chi', 'noi o': 'dia_chi',
  'dc': 'dia_chi', 'dia chi lien he': 'dia_chi',
  'so dien thoai': 'sdt', 'dien thoai': 'sdt', 'sdt': 'sdt', 'phone': 'sdt',
  'ma so thue ca nhan': 'mst', 'ma so thue': 'mst', 'mst': 'mst',
  'email': 'email', 'gmail': 'email', 'mail': 'email',
  'stk': 'so_tk', 'so tk': 'so_tk', 'so tai khoan': 'so_tk',
  'ngan hang': 'ngan_hang', 'bank': 'ngan_hang', 'ten ngan hang': 'ngan_hang',
  'tai ngan hang': 'ngan_hang', 'nh': 'ngan_hang',
  'ctk': 'ten_tk', 'chu tai khoan': 'ten_tk', 'ten tai khoan': 'ten_tk',
  'ten tk': 'ten_tk', 'chu the': 'ten_tk',
  'noi dung cong viec': 'noi_dung', 'noi dung': 'noi_dung', 'cong viec': 'noi_dung',
  'tien': 'net', 'so tien': 'net', 'net': 'net', 'thu lao': 'net', 'gia': 'net',
};

// Nhãn gộp hai trường trong một dòng, giá trị ngăn bởi dấu gạch ngang.
const NHAN_GOP: Record<string, [keyof QuickParseForm, keyof QuickParseForm]> = {
  'stk - ngan hang': ['so_tk', 'ngan_hang'],
  'so tai khoan - ngan hang': ['so_tk', 'ngan_hang'],
  'ngan hang - stk': ['ngan_hang', 'so_tk'],
};

// Nhãn hiểu được nhưng app không dùng — nhận ra để KHÔNG nhầm sang trường khác.
const BO_QUA = new Set([
  'ngay sinh', 'nam sinh', 'stt', 'ghi chu', 'link sp', 'link san pham',
  'link', 'ngay tao', 'trang thai', 'noi cap', 'gioi tinh khac',
  'link hd', 'link bbnt', 'link luu hd', 'done',
]);

const NHAN_HIEN: Record<keyof QuickParseForm, string> = {
  ho_ten: 'Họ tên', xung_ho: 'Xưng hô', cccd: 'CCCD', ngay_cap: 'Ngày cấp',
  mst: 'MST', dia_chi: 'Địa chỉ', sdt: 'Số điện thoại', email: 'Email',
  ten_tk: 'Tên tài khoản', so_tk: 'Số tài khoản', ngan_hang: 'Ngân hàng',
  noi_dung: 'Nội dung công việc', net: 'Tiền (NET)',
};

const TRUONG_SO = new Set(['cccd', 'sdt', 'so_tk', 'mst']);

// Ký tự rác hay dính vào đầu/cuối dòng khi copy.
const RAC = ' \t"\'“”«»*•-–—';

function goRac(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && RAC.includes(s[a])) a++;
  while (b > a && RAC.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

function chuanNgay(giaTri: string): string {
  const m = giaTri.trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})$/);
  if (!m) return giaTri.trim();
  const d = Number(m[1]);
  const t = Number(m[2]);
  let n = m[3];
  if (n.length === 2) n = '20' + n;
  return `${String(d).padStart(2, '0')}/${String(t).padStart(2, '0')}/${n}`;
}

export function chuanTien(giaTri: string): string {
  const so = giaTri.replace(/\D/g, '');
  return so ? fmtSo(Number(so)) : '';
}

function laTien(s: string): boolean {
  if (!/^[\d.,\s]+(?:đ|d|vnd|vnđ)?$/i.test(s.trim())) return false;
  return s.replace(/\D/g, '').length >= 4;
}

function laUrl(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('www.');
}

function laStt(s: string): boolean {
  return /^\d{1,3}$/.test(s.trim());
}

function dat(form: QuickParseForm, truong: keyof QuickParseForm, giaTriIn: string): boolean {
  let giaTri = giaTriIn.trim();
  if (!giaTri) return false;
  if (truong === 'ngay_cap') {
    giaTri = chuanNgay(giaTri);
  } else if (truong === 'net') {
    giaTri = chuanTien(giaTri);
    if (!giaTri) return false;
  } else if (truong === 'ten_tk') {
    giaTri = boDau(giaTri).toUpperCase();
  } else if (TRUONG_SO.has(truong)) {
    giaTri = giaTri.replace(/[\s.]/g, '');
  }
  form[truong] = giaTri;
  return true;
}

export function phanTichNhanh(text: string): QuickParseResult {
  const form: QuickParseForm = {};
  const nhanRa: string[] = [];
  const boQua: string[] = [];
  const khongRo: string[] = [];
  const ungVienNoiDung: string[] = [];

  for (const dongGoc of (text || '').split(/\r\n|\r|\n/)) {
    const dong = goRac(dongGoc);
    if (!dong || laUrl(dong) || laStt(dong)) continue;

    const iHai = dong.indexOf(':');
    const dau = iHai >= 0;
    const nhan = dau ? dong.slice(0, iHai) : dong;
    const giaTriRaw = dau ? dong.slice(iHai + 1) : '';
    const khoa = chuanHoa(goRac(nhan));

    if (dau && khoa in NHAN_GOP) {
      const rawTrimmed = goRac(giaTriRaw);
      const mManh = rawTrimmed.match(/^(.*?)\s+[-–]\s+(.*)$/s);
      const manh = mManh ? [mManh[1].trim(), mManh[2].trim()] : [rawTrimmed.trim()];
      const [t1, t2] = NHAN_GOP[khoa];
      const cap: [keyof QuickParseForm, string | undefined][] = [
        [t1, manh[0]],
        [t2, manh[1]],
      ];
      for (const [truong, gt] of cap) {
        if (gt !== undefined && dat(form, truong, gt)) nhanRa.push(NHAN_HIEN[truong]);
      }
      continue;
    }

    if (dau && khoa in NHAN) {
      const truong = NHAN[khoa];
      if (dat(form, truong, goRac(giaTriRaw))) nhanRa.push(NHAN_HIEN[truong]);
      // 'Ông:' / 'Bà:' vừa là nhãn tên vừa cho biết xưng hô; 'Ông/Bà:' là nhãn in sẵn
      // nên không suy ra được gì.
      if ((khoa === 'ong' || khoa === 'ba') && !form.xung_ho) {
        form.xung_ho = khoa === 'ong' ? 'Ông' : 'Bà';
        nhanRa.push(NHAN_HIEN.xung_ho);
      }
      continue;
    }

    if (dau && BO_QUA.has(khoa)) {
      boQua.push(dong);
      continue;
    }
    if (dau && khoa) {
      khongRo.push(dong);
      continue;
    }

    if (laTien(dong)) {
      if (dat(form, 'net', dong)) nhanRa.push(NHAN_HIEN.net);
      continue;
    }

    ungVienNoiDung.push(dong);
  }

  // Dòng không nhãn: bỏ những dòng chỉ lặp lại tên người / tên ngân hàng, phần còn lại
  // lấy dòng đầu tiên làm nội dung công việc.
  if (!form.noi_dung) {
    const daBiet = new Set(
      (['ho_ten', 'ten_tk', 'ngan_hang'] as const)
        .map((k) => chuanHoa(form[k] || ''))
        .filter((v) => v !== ''),
    );
    const conLai = ungVienNoiDung.filter((c) => !daBiet.has(chuanHoa(c)));
    if (conLai.length) {
      dat(form, 'noi_dung', conLai[0]);
      nhanRa.push(NHAN_HIEN.noi_dung);
      khongRo.push(...conLai.slice(1));
    }
  } else {
    khongRo.push(...ungVienNoiDung);
  }

  // Chuẩn hoá tên ngân hàng, GIỮ LẠI bản gốc để giao diện hiện ra đối chiếu.
  const goc: Partial<Record<keyof QuickParseForm, string>> = {};
  if (form.ngan_hang) {
    const [ten, daDoi] = chuanTenNganHang(form.ngan_hang);
    if (daDoi) {
      goc.ngan_hang = form.ngan_hang;
      form.ngan_hang = ten;
    }
  }

  return { form, nhanRa, boQua, khongRo, goc };
}
