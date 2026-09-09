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
  'so cmnd/cccd': 'cccd', 'so cmnd cccd': 'cccd', 'cmnd/cccd': 'cccd', 'cccd/cmnd': 'cccd',
  'cccd': 'cccd', 'cmnd': 'cccd', 'so cccd': 'cccd', 'so cmnd': 'cccd',
  'can cuoc': 'cccd', 'so can cuoc': 'cccd',
  'ngay cap': 'ngay_cap',
  'dia chi thuong tru': 'dia_chi', 'dia chi': 'dia_chi', 'noi o': 'dia_chi',
  'dc': 'dia_chi', 'dia chi lien he': 'dia_chi',
  'so dien thoai': 'sdt', 'dien thoai': 'sdt', 'sdt': 'sdt', 'phone': 'sdt',
  'ma so thue ca nhan': 'mst', 'ma so thue': 'mst', 'mst': 'mst',
  'email': 'email', 'gmail': 'email', 'mail': 'email',
  'stk': 'so_tk', 'so tk': 'so_tk', 'so tai khoan': 'so_tk',
  // "Số tài khoản ngân hàng" là MỘT nhãn cho số tài khoản, khác nhãn gộp "STK - Ngân hàng".
  'so tai khoan ngan hang': 'so_tk', 'so tk ngan hang': 'so_tk',
  'stk ngan hang': 'so_tk', 'tai khoan ngan hang': 'so_tk',
  'ngan hang': 'ngan_hang', 'bank': 'ngan_hang', 'ten ngan hang': 'ngan_hang',
  'tai ngan hang': 'ngan_hang', 'nh': 'ngan_hang',
  'ctk': 'ten_tk', 'chu tai khoan': 'ten_tk', 'ten tai khoan': 'ten_tk',
  'ten tk': 'ten_tk', 'chu the': 'ten_tk', 'ten chu tk': 'ten_tk',
  'chu tk': 'ten_tk', 'ten chu tai khoan': 'ten_tk',
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

// Dòng tiêu đề của khối text người dùng dán (không có dấu hai chấm). Không liệt kê ra thì
// chúng rơi vào `ungVienNoiDung` và dòng đầu tiên bị lấy làm "Nội dung công việc".
const TIEU_DE = new Set([
  'thong tin thanh toan', 'thong tin ca nhan', 'thong tin chuyen khoan',
  'thong tin', 'thong tin doi tac', 'thong tin nhan tien', 'thong tin tai khoan',
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

/** `khoa in NHAN` đi cả prototype chain — nhãn "constructor:" / "toString:" sẽ khớp bậy và
 *  ném giá trị vào trường rác. Luôn tra bằng hasOwnProperty. */
function coKhoa(obj: Record<string, unknown>, khoa: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, khoa);
}

/** Chuẩn hoá nhãn + BỎ phần trong ngoặc: "Mã số thuế (MST)" và "Số điện thoại (Zalo)" là
 *  cùng một nhãn với bản không ngoặc, không việc gì phải liệt kê từng biến thể. */
function chuanHoaNhan(nhan: string): string {
  return chuanHoa(nhan.replace(/\([^)]*\)/g, ' '));
}

/** Dòng dán tay hay nhét hai nhãn vào một dòng, ngăn bởi dấu phẩy:
 *  "CCCD/CMND: 025202006683, ngày cấp : 9/5/2021". Chỉ tách khi mảnh sau dấu phẩy có dạng
 *  "<nhãn đã biết> : <giá trị>" — nhãn lạ thì để nguyên cả cụm, không đoán mò (dấu phẩy
 *  trong địa chỉ / nội dung công việc là chuyện bình thường). */
function tachNhanPhu(giaTri: string): { chinh: string; phu: [keyof QuickParseForm, string][] } {
  const manh = giaTri.split(',');
  const phu: [keyof QuickParseForm, string][] = [];
  let i = manh.length;
  while (i > 1) {
    const m = manh[i - 1].match(/^([^:]+):(.*)$/s);
    if (!m) break;
    const khoa = chuanHoaNhan(goRac(m[1]));
    if (coKhoa(NHAN, khoa)) phu.unshift([NHAN[khoa], goRac(m[2])]);
    else if (!BO_QUA.has(khoa)) break;
    i--;
  }
  return { chinh: manh.slice(0, i).join(','), phu };
}

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
    // Dòng dán tay đôi khi nhét thêm nhãn khác cùng dòng, ngăn bởi dấu phẩy
    // (vd "CCCD/CMND: 025202006683, ngày cấp : 9/5/2021") — chỉ lấy phần số đầu.
    const m = giaTri.match(/^[\d.\s]+/);
    giaTri = (m ? m[0] : giaTri).replace(/[\s.]/g, '');
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
    const khoa = chuanHoaNhan(goRac(nhan));

    if (dau && coKhoa(NHAN_GOP, khoa)) {
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

    if (dau && coKhoa(NHAN, khoa)) {
      const truong = NHAN[khoa];
      const { chinh, phu } = tachNhanPhu(goRac(giaTriRaw));
      if (dat(form, truong, chinh)) nhanRa.push(NHAN_HIEN[truong]);
      // Dòng riêng có nhãn hẳn hoi đáng tin hơn nhãn nhét thêm sau dấu phẩy.
      for (const [truongPhu, gtPhu] of phu) {
        if (!form[truongPhu] && dat(form, truongPhu, gtPhu)) nhanRa.push(NHAN_HIEN[truongPhu]);
      }
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

    if (TIEU_DE.has(chuanHoa(dong))) {
      boQua.push(dong);
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

  // Khối dán hiếm khi ghi tên chủ tài khoản vì luôn trùng họ tên ở đầu khối.
  if (!form.ten_tk && form.ho_ten && dat(form, 'ten_tk', form.ho_ten)) {
    nhanRa.push(NHAN_HIEN.ten_tk);
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
