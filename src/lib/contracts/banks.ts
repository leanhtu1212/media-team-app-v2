// Chuẩn hoá tên ngân hàng về đúng tên thương hiệu. Port 1:1 từ D:\App\core\banks.py.
// CHỈ dùng ở bước dán/nhập dữ liệu (quickParse), không bao giờ dùng lúc tạo file — thứ người
// dùng nhìn thấy trong ô phải đúng bằng thứ đi vào hợp đồng.
// Nguyên tắc: thà không đổi còn hơn đổi sai. Không khớp chắc chắn thì giữ nguyên.

import { boDau } from './naming';

const DANH_SACH: Record<string, string[]> = {
  'Vietcombank': ['vietcombank', 'vietcom', 'vcb', 'ngoaithuong', 'nganhangngoaithuong'],
  'VietinBank': ['vietinbank', 'vietin', 'viettin', 'viettinbank', 'congthuong', 'nganhangcongthuong', 'ctg', 'icb'],
  'BIDV': ['bidv', 'dautuvaphattrien', 'nganhangdautuvaphattrien'],
  'Agribank': ['agribank', 'agri', 'nongnghiep', 'nongnghiepvaphattriennongthon'],
  'Techcombank': ['techcombank', 'techcom', 'tcb', 'kythuong'],
  'MB Bank': ['mbbank', 'mb', 'quandoi', 'nganhangquandoi', 'mbb'],
  'ACB': ['acb', 'achau', 'nganhangachau'],
  'VPBank': ['vpbank', 'vp', 'vpb', 'vietnamthinhvuong'],
  'Sacombank': ['sacombank', 'sacom', 'stb', 'saigonthuongtin'],
  'TPBank': ['tpbank', 'tp', 'tpb', 'tienphong', 'nganhangtienphong'],
  'VIB': ['vib', 'quocte', 'nganhangquocte'],
  'SHB': ['shb', 'saigonhanoi'],
  'HDBank': ['hdbank', 'hdb', 'phattrientphcm'],
  'MSB': ['msb', 'hanghai', 'maritimebank', 'maritime'],
  'SeABank': ['seabank', 'sea', 'dongnama'],
  'OCB': ['ocb', 'phuongdong', 'nganhangphuongdong'],
  'Eximbank': ['eximbank', 'exim', 'eib', 'xuatnhapkhau'],
  'LPBank': ['lpbank', 'lpb', 'lienvietpostbank', 'lienvietpost', 'lienviet', 'buudienlienviet'],
  'Nam A Bank': ['namabank', 'nama', 'nab'],
  'ABBANK': ['abbank', 'anbinh', 'abb'],
  'Bac A Bank': ['bacabank', 'baca', 'bab'],
  'PVcomBank': ['pvcombank', 'pvcom', 'pvb'],
  'SCB': ['scb', 'saigon', 'nganhangsaigon'],
  'VietABank': ['vietabank', 'vieta', 'vab'],
  'VietBank': ['vietbank', 'vietnamthuongtin', 'vbb'],
  'BaoViet Bank': ['baovietbank', 'baoviet', 'bvb'],
  'KienlongBank': ['kienlongbank', 'kienlong', 'klb'],
  'NCB': ['ncb', 'quocdan', 'nganhangquocdan'],
  'SaigonBank': ['saigonbank', 'sgb'],
  'BVBank': ['bvbank', 'banviet', 'vietcapitalbank', 'vietcapital'],
  'Cake by VPBank': ['cake', 'cakebyvpbank'],
  'Timo': ['timo'],
  'Woori Bank': ['wooribank', 'woori'],
  'Shinhan Bank': ['shinhanbank', 'shinhan'],
  'HSBC': ['hsbc'],
  'Standard Chartered': ['standardchartered', 'scbvn', 'stanchart'],
  'UOB': ['uob'],
  'Public Bank': ['publicbank', 'publicbankvietnam'],
  'Indovina Bank': ['indovinabank', 'indovina', 'ivb'],
  'CIMB': ['cimb', 'cimbbank'],
  'Hong Leong Bank': ['hongleongbank', 'hongleong', 'hlbvn'],
  'GPBank': ['gpbank', 'gpb', 'daudukhitoancau'],
  'OceanBank': ['oceanbank', 'ocean', 'daiduong'],
  'DongA Bank': ['dongabank', 'donga', 'dab'],
  'VRB': ['vrb', 'vietnganga', 'vietnamnga'],
};

// Bỏ mấy tiền tố chung để "Ngân hàng TMCP Techcombank" cũng khớp.
const TIEN_TO = ['nganhangtmcp', 'nganhangthuongmaicophan', 'nganhang', 'nhtmcp', 'nh'];

const TRA_CUU: Record<string, string> = {};
for (const [ten, ds] of Object.entries(DANH_SACH)) {
  for (const b of ds) TRA_CUU[b] = ten;
}

function nen(s: string): string {
  return boDau(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Trả về [tenChuan, daDoi]. Không chắc thì giữ nguyên văn bản gốc. */
export function chuanTenNganHang(nhap: string): [string, boolean] {
  const goc = (nhap || '').trim();
  if (!goc) return ['', false];

  let khoa = nen(goc);
  for (const tt of TIEN_TO) {
    if (khoa.startsWith(tt) && khoa.length > tt.length) {
      khoa = khoa.slice(tt.length);
      break;
    }
  }
  if (khoa.endsWith('bank') && !(khoa in TRA_CUU) && khoa.slice(0, -4) in TRA_CUU) {
    khoa = khoa.slice(0, -4);
  }

  if (khoa in TRA_CUU) {
    const ten = TRA_CUU[khoa];
    return [ten, ten !== goc];
  }

  // Khớp một phần: chỉ chấp nhận khi ra đúng MỘT ngân hàng. Mơ hồ thì bỏ.
  if (khoa.length >= 4) {
    const ungVien = new Set<string>();
    for (const [b, ten] of Object.entries(TRA_CUU)) {
      if (b.length >= 4 && (b.startsWith(khoa) || khoa.startsWith(b))) ungVien.add(ten);
    }
    if (ungVien.size === 1) {
      const ten = [...ungVien][0];
      return [ten, ten !== goc];
    }
  }

  return [goc, false];
}
