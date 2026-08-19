# Tab "Hợp đồng KOL/KOC" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tab "Hợp đồng" vào `media-team-app-v2` (admin-only), cho phép đọc danh sách đối tác KOL/KOC từ Google Sheet, tạo file Hợp đồng dịch vụ (HĐ) + Biên bản nghiệm thu (BBNT) `.docx`, tải về, và copy lên Google Drive — chạy được cho cả team qua web đã deploy, thay cho app Python local `D:\App`.

**Architecture:** Toàn bộ logic sinh file `.docx` (điền placeholder, tách HĐ/BBNT, chèn ảnh) chạy **client-side** bằng TypeScript + JSZip + DOMParser/XMLSerializer (thao tác trực tiếp XML của file zip .docx). Chỉ hai việc cần "ai đó ngoài trình duyệt": đọc Google Sheet và ghi vào Google Drive — cả hai qua **Google Apps Script** (mở rộng `apps-script/sync.gs` đã có sẵn trong repo). Lịch sử đối tác + cài đặt lưu ở Firestore (project Firebase hiện có), admin-only.

**Tech Stack:** React 19 + TypeScript + Vite (đã có), thêm `jszip` (runtime) và `vitest` + `jsdom` (dev, test runner — repo hiện chưa có test runner nào).

**Spec:** [docs/superpowers/specs/2026-08-19-contract-hd-bbnt-tab-design.md](../specs/2026-08-19-contract-hd-bbnt-tab-design.md)

## Global Constraints

- Field/type convention của repo: file `src/types/index.ts` là nguồn sự thật cho mọi interface Firestore; tên field/enum phải khớp giữa TS và Firestore docs.
- Mọi ghi Firestore đi qua `src/lib/actions.ts` (object `col`/`ref`), theo đúng pattern `col.xxx()`/`ref.xxx(id)` đã có trong file.
- Admin xác định qua `useAppData()` → `isAdmin` (từ `AppDataContext`), **không** tự viết lại logic kiểm tra email admin.
- Gọi Apps Script webhook theo đúng pattern đã có ở `src/lib/sheets.ts` (`postToWebhook`): `fetch(url, {method, body: JSON.stringify(...)})` **không set header** (tránh CORS preflight vì Apps Script không xử lý OPTIONS).
- Toàn bộ code mới port từ `D:\App\core\*.py` phải giữ đúng thuật toán 1:1 (đã đọc kỹ từng file Python trong buổi brainstorm) — không "cải tiến" logic khi port, chỉ đổi ngôn ngữ.
- Không chạy `npm run build` + commit `dist/` cho tới khi cả tính năng xong và được duyệt thủ công trên trình duyệt (theo quy trình deploy ghi trong `CLAUDE.md`) — các task dưới đây **không** yêu cầu build/deploy, chỉ code + test.
- Tên file test đặt cạnh file nguồn: `xxx.ts` → `xxx.test.ts` (Vitest convention chuẩn, quy ước mới cho repo vì chưa có test nào).

---

## Task 1: Test tooling + `money.ts`

**Files:**
- Modify: `package.json` (thêm devDependencies `vitest`, `jsdom`; thêm script `test`)
- Create: `vitest.config.ts`
- Create: `src/lib/contracts/money.ts`
- Test: `src/lib/contracts/money.test.ts`

**Interfaces:**
- Produces: `soThanhChu(n: number): string`, `fmtSo(n: number): string`, `fmtMoney(n: number): string`, `tinhGross(net: number, thue?: number): number`, `soNgayChu(n: number): string` — dùng bởi mọi task sau (compute.ts, docxFill.ts).

- [ ] **Step 1: Cài dependencies**

```bash
npm install -D vitest jsdom
npm install jszip
```

(`jszip` cài luôn ở bước này để không phải cài lại nhiều lần — dùng ở Task 8+.)

- [ ] **Step 2: Thêm script test vào `package.json`**

Mở `package.json`, trong `"scripts"` thêm dòng `"test": "vitest run"` (giữ nguyên các script khác).

- [ ] **Step 3: Tạo `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

(`jsdom` cần cho các task sau dùng `DOMParser`/`XMLSerializer`; không ảnh hưởng task này.)

- [ ] **Step 4: Viết test trước (TDD) — `src/lib/contracts/money.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { fmtMoney, fmtSo, soNgayChu, soThanhChu, tinhGross } from './money';

describe('soThanhChu', () => {
  it('đọc số 0', () => expect(soThanhChu(0)).toBe('Không'));
  it('đọc số 1 chữ số', () => expect(soThanhChu(1)).toBe('Một'));
  it('đọc số có "mười lăm"', () => expect(soThanhChu(15)).toBe('Mười lăm'));
  it('đọc số tròn trăm', () => expect(soThanhChu(100)).toBe('Một trăm'));
  it('đọc số tròn nghìn', () => expect(soThanhChu(1000)).toBe('Một nghìn'));
  it('đọc số có "mốt"', () => expect(soThanhChu(21)).toBe('Hai mươi mốt'));
  it('đọc số có "linh"', () => expect(soThanhChu(1005)).toBe('Một nghìn không trăm linh năm'));
  it('đọc số triệu đầy đủ', () => expect(soThanhChu(15000000)).toBe('Mười lăm triệu'));
});

describe('fmtSo', () => {
  it('phân cách nghìn bằng dấu chấm', () => expect(fmtSo(1000000)).toBe('1.000.000'));
  it('số nhỏ không có dấu chấm', () => expect(fmtSo(500)).toBe('500'));
});

describe('fmtMoney', () => {
  it('thêm hậu tố VNĐ', () => expect(fmtMoney(1000000)).toBe('1.000.000 VNĐ'));
});

describe('tinhGross', () => {
  it('suy gross từ net với thuế 10%', () => expect(tinhGross(900000, 0.1)).toBe(1000000));
  it('mặc định thuế 10% khi không truyền', () => expect(tinhGross(900000)).toBe(1000000));
});

describe('soNgayChu', () => {
  it('5 ngày', () => expect(soNgayChu(5)).toBe('5 (năm)'));
  it('30 ngày', () => expect(soNgayChu(30)).toBe('30 (ba mươi)'));
});
```

- [ ] **Step 5: Chạy test, xác nhận FAIL**

Run: `npm test -- money`
Expected: FAIL — `Cannot find module './money'`.

- [ ] **Step 6: Viết `src/lib/contracts/money.ts`**

Port 1:1 từ `D:\App\core\money.py`.

```ts
// Tiền và đọc số thành chữ tiếng Việt. Port 1:1 từ D:\App\core\money.py — giữ nguyên thuật toán.

const DIGIT = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const DON_VI = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function doc3ChuSo(n: number, dayDu: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const dv = n % 10;
  const tu: string[] = [];
  if (tram > 0 || dayDu) {
    tu.push(DIGIT[tram], 'trăm');
  }
  if (chuc === 0) {
    if (dv > 0) {
      if (tram > 0 || dayDu) tu.push('linh');
      tu.push(dv === 5 ? 'năm' : DIGIT[dv]);
    }
  } else if (chuc === 1) {
    tu.push('mười');
    if (dv > 0) tu.push(dv === 5 ? 'lăm' : dv === 1 ? 'một' : DIGIT[dv]);
  } else {
    tu.push(DIGIT[chuc], 'mươi');
    if (dv === 1) tu.push('mốt');
    else if (dv === 5) tu.push('lăm');
    else if (dv > 0) tu.push(DIGIT[dv]);
  }
  return tu.join(' ');
}

/** Đọc số thành chữ, KHÔNG kèm chữ "đồng" (template đã có sẵn). */
export function soThanhChu(n: number): string {
  if (n === 0) return 'Không';
  const nhom: number[] = [];
  let x = n;
  while (x > 0) {
    nhom.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  const phan: string[] = [];
  for (let i = nhom.length - 1; i >= 0; i--) {
    if (nhom[i] === 0) continue;
    phan.push(doc3ChuSo(nhom[i], i !== nhom.length - 1));
    if (DON_VI[i]) phan.push(DON_VI[i]);
  }
  const text = phan.join(' ');
  return text[0].toUpperCase() + text.slice(1);
}

export function fmtSo(n: number): string {
  return Math.round(n)
    .toLocaleString('en-US')
    .replace(/,/g, '.');
}

export function fmtMoney(n: number): string {
  return `${fmtSo(n)} VNĐ`;
}

/** Giá trị hợp đồng trước thuế, suy từ số tiền thực nhận. */
export function tinhGross(net: number, thue = 0.1): number {
  return Math.round(net / (1 - thue));
}

/** "5 (năm)" — đúng văn phong sẵn có của Điều 2 trong template. */
export function soNgayChu(n: number): string {
  return `${n} (${soThanhChu(n).toLowerCase()})`;
}
```

- [ ] **Step 7: Chạy test, xác nhận PASS**

Run: `npm test -- money`
Expected: PASS, tất cả test xanh.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/contracts/money.ts src/lib/contracts/money.test.ts
git commit -m "feat: thêm test tooling + port money.py sang money.ts"
```

---

## Task 2: `naming.ts`

**Files:**
- Create: `src/lib/contracts/naming.ts`
- Test: `src/lib/contracts/naming.test.ts`

**Interfaces:**
- Consumes: không phụ thuộc file nào trước đó.
- Produces: `boDau(s: string): string`, `chuanHoa(s: string): string`, `vietTat(hoTen: string): string`, `taoSoHopDong(hoTen: string, ngayKy: Date): string`, `lamSachTenFile(s: string): string`, `tenFileHd(hoTen: string, noiDung: string): string`, `tenFileBbnt(hoTen: string, noiDung: string): string` — dùng bởi banks.ts, quickParse.ts, compute.ts, docxFill.ts, actions.ts (Task 10).

- [ ] **Step 1: Viết test trước — `src/lib/contracts/naming.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { boDau, chuanHoa, lamSachTenFile, taoSoHopDong, tenFileBbnt, tenFileHd, vietTat } from './naming';

describe('boDau', () => {
  it('bỏ dấu tiếng Việt, giữ đ/Đ dạng d/D', () => {
    expect(boDau('Mã Thị Thanh Bình')).toBe('Ma Thi Thanh Binh');
    expect(boDau('Đông Đô')).toBe('Dong Do');
  });
});

describe('chuanHoa', () => {
  it('bỏ dấu, thường hoá, gộp khoảng trắng', () => {
    expect(chuanHoa('  Mã   Thị  Bình  ')).toBe('ma thi binh');
  });
});

describe('vietTat', () => {
  it('lấy chữ cái đầu mỗi từ, viết hoa', () => {
    expect(vietTat('Mã Thị Thanh Bình')).toBe('MTTB');
  });
});

describe('taoSoHopDong', () => {
  it('format ddmmyy/HĐ/ALC-<viết tắt>', () => {
    expect(taoSoHopDong('Mã Thị Thanh Bình', new Date(2026, 7, 14))).toBe('140826/HĐ/ALC-MTTB');
  });
});

describe('lamSachTenFile', () => {
  it('thay ký tự cấm bằng khoảng trắng, gộp khoảng trắng, bỏ dấu chấm/space cuối', () => {
    expect(lamSachTenFile('Video: A/B "test"...')).toBe('Video A B test');
  });
});

describe('tenFileHd / tenFileBbnt', () => {
  it('ghép đúng tiền tố', () => {
    expect(tenFileHd('Mã Thị Bình', 'Sản xuất Reels')).toBe('Hop dong - Ma Thi Binh - San xuat Reels.docx');
    expect(tenFileBbnt('Mã Thị Bình', 'Sản xuất Reels')).toBe('BBNT - Ma Thi Binh - San xuat Reels.docx');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- naming`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/contracts/naming.ts`**

Port 1:1 từ `D:\App\core\naming.py`.

```ts
// Tên đối tác, số hợp đồng, tên file. Port 1:1 từ D:\App\core\naming.py.

const CAM = /[/:*?"<>|]/g;
const MAX_TEN_FILE = 150;

export function boDau(s: string): string {
  return s
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function chuanHoa(s: string): string {
  return boDau(s)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function vietTat(hoTen: string): string {
  return boDau(hoTen)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function taoSoHopDong(hoTen: string, ngayKy: Date): string {
  const dd = String(ngayKy.getDate()).padStart(2, '0');
  const mm = String(ngayKy.getMonth() + 1).padStart(2, '0');
  const yy = String(ngayKy.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}/HĐ/ALC-${vietTat(hoTen)}`;
}

export function lamSachTenFile(s: string): string {
  const thay = s.replace(CAM, ' ').replace(/\s+/g, ' ').trim();
  return thay.replace(/[.\s]+$/, '');
}

function ghep(tienTo: string, hoTen: string, noiDung: string): string {
  let than = `${tienTo} - ${lamSachTenFile(hoTen)} - ${lamSachTenFile(noiDung)}`;
  if (than.length + 5 > MAX_TEN_FILE) {
    than = than.slice(0, MAX_TEN_FILE - 5).replace(/[.\s]+$/, '');
  }
  return `${than}.docx`;
}

export function tenFileHd(hoTen: string, noiDung: string): string {
  return ghep('Hop dong', hoTen, noiDung);
}

export function tenFileBbnt(hoTen: string, noiDung: string): string {
  return ghep('BBNT', hoTen, noiDung);
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- naming`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/naming.ts src/lib/contracts/naming.test.ts
git commit -m "feat: port naming.py sang naming.ts"
```

---

## Task 3: `banks.ts`

**Files:**
- Create: `src/lib/contracts/banks.ts`
- Test: `src/lib/contracts/banks.test.ts`

**Interfaces:**
- Consumes: `boDau` từ `./naming` (Task 2).
- Produces: `chuanTenNganHang(nhap: string): [ten: string, daDoi: boolean]` — dùng bởi quickParse.ts (Task 4).

- [ ] **Step 1: Viết test trước — `src/lib/contracts/banks.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { chuanTenNganHang } from './banks';

describe('chuanTenNganHang', () => {
  it('chuẩn hoá bí danh viết tắt', () => {
    expect(chuanTenNganHang('viettin')).toEqual(['VietinBank', true]);
    expect(chuanTenNganHang('vcb')).toEqual(['Vietcombank', true]);
    expect(chuanTenNganHang('quân đội')).toEqual(['MB Bank', true]);
  });

  it('giữ nguyên tên đã chuẩn, báo daDoi=false', () => {
    expect(chuanTenNganHang('Vietcombank')).toEqual(['Vietcombank', false]);
  });

  it('bỏ tiền tố "Ngân hàng TMCP"', () => {
    expect(chuanTenNganHang('Ngân hàng TMCP Techcombank')).toEqual(['Techcombank', true]);
  });

  it('mơ hồ (khớp nhiều ngân hàng) thì giữ nguyên văn bản gốc', () => {
    expect(chuanTenNganHang('viet')).toEqual(['viet', false]);
  });

  it('chuỗi rỗng trả về rỗng, không đổi', () => {
    expect(chuanTenNganHang('')).toEqual(['', false]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- banks`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/contracts/banks.ts`**

Port 1:1 từ `D:\App\core\banks.py` (copy nguyên bảng tra cứu `DANH_SACH`).

```ts
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
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- banks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/banks.ts src/lib/contracts/banks.test.ts
git commit -m "feat: port banks.py sang banks.ts"
```

---

## Task 4: `quickParse.ts`

**Files:**
- Create: `src/lib/contracts/quickParse.ts`
- Test: `src/lib/contracts/quickParse.test.ts`

**Interfaces:**
- Consumes: `chuanTenNganHang` từ `./banks` (Task 3), `fmtSo` từ `./money` (Task 1), `boDau`/`chuanHoa` từ `./naming` (Task 2).
- Produces: `type QuickParseForm`, `interface QuickParseResult`, `phanTichNhanh(text: string): QuickParseResult`, `chuanTien(giaTri: string): string` — dùng bởi sheetSync.ts (Task 5).

**Lưu ý phạm vi (khác bản Python):** bản gốc `quick_parse.py` có bước `_tach_o` để bóc lớp bọc TSV khi người dùng dán nhiều ô từ clipboard (tab Dán nhanh/Dán hàng loạt — đã bỏ khỏi phạm vi v2). Ở v2, `phanTichNhanh` chỉ nhận **text của một cell** đọc thẳng qua Sheets API (không có lớp bọc TSV/CSV), nên bỏ hẳn bước đó — chỉ cần tách theo dòng (`splitlines`).

- [ ] **Step 1: Viết test trước — `src/lib/contracts/quickParse.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { chuanTien, phanTichNhanh } from './quickParse';

describe('chuanTien', () => {
  it('bỏ ký tự không phải số, format lại', () => {
    expect(chuanTien('1.500.000 đ')).toBe('1.500.000');
    expect(chuanTien('abc')).toBe('');
  });
});

describe('phanTichNhanh', () => {
  it('tách khối nhãn cơ bản', () => {
    const text = [
      'Ông/Bà: Mã Thị Thanh Bình',
      'Số CMND/CCCD: 040303013569',
      'Ngày cấp: 28/9/2021',
      'STK: 101871610416',
      'Ngân hàng: viettin',
      'Nội dung công việc: Sản xuất Reels tháng 8',
      'Tiền: 1.500.000 đ',
    ].join('\n');
    const r = phanTichNhanh(text);
    expect(r.form.ho_ten).toBe('Mã Thị Thanh Bình');
    expect(r.form.cccd).toBe('040303013569');
    expect(r.form.ngay_cap).toBe('28/09/2021');
    expect(r.form.so_tk).toBe('101871610416');
    expect(r.form.ngan_hang).toBe('VietinBank');
    expect(r.goc.ngan_hang).toBe('viettin');
    expect(r.form.noi_dung).toBe('Sản xuất Reels tháng 8');
    expect(r.form.net).toBe('1.500.000');
    expect(r.khongRo).toEqual([]);
  });

  it('"Ông:"/"Bà:" vừa là tên vừa suy ra xưng hô, "Ông/Bà:" thì không', () => {
    expect(phanTichNhanh('Ông: Nguyễn Văn A').form.xung_ho).toBe('Ông');
    expect(phanTichNhanh('Bà: Nguyễn Thị B').form.xung_ho).toBe('Bà');
    expect(phanTichNhanh('Ông/Bà: Nguyễn Văn A').form.xung_ho).toBeUndefined();
  });

  it('nhãn hiểu nhưng không dùng thì vào boQua, không phải khongRo', () => {
    const r = phanTichNhanh('Ngày sinh: 01/01/1990');
    expect(r.boQua).toEqual(['Ngày sinh: 01/01/1990']);
    expect(r.khongRo).toEqual([]);
  });

  it('nhãn không nhận ra thì vào khongRo', () => {
    const r = phanTichNhanh('Sở thích: bơi lội');
    expect(r.khongRo).toEqual(['Sở thích: bơi lội']);
  });

  it('dòng không nhãn, không phải tiền/URL/STT thì thành nội dung công việc', () => {
    const r = phanTichNhanh('Quay 3 video Reels');
    expect(r.form.noi_dung).toBe('Quay 3 video Reels');
  });

  it('bỏ qua dòng URL và số thứ tự', () => {
    const r = phanTichNhanh('https://example.com\n5\nQuay video');
    expect(r.form.noi_dung).toBe('Quay video');
  });

  it('tên tài khoản viết hoa không dấu', () => {
    const r = phanTichNhanh('CTK: Mã Thị Thanh Bình');
    expect(r.form.ten_tk).toBe('MA THI THANH BINH');
  });

  it('nhãn gộp "STK - Ngân hàng"', () => {
    const r = phanTichNhanh('STK - Ngân hàng: 101871610416 - viettin');
    expect(r.form.so_tk).toBe('101871610416');
    expect(r.form.ngan_hang).toBe('VietinBank');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- quickParse`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/contracts/quickParse.ts`**

```ts
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
      const manh = goRac(giaTriRaw)
        .split(/\s+[-–]\s+/)
        .map((x) => x.trim());
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
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- quickParse`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/quickParse.ts src/lib/contracts/quickParse.test.ts
git commit -m "feat: port quick_parse.py sang quickParse.ts (bỏ unwrap TSV, không cần cho v2)"
```

---

## Task 5: `sheetSync.ts`

**Files:**
- Create: `src/lib/contracts/sheetSync.ts`
- Test: `src/lib/contracts/sheetSync.test.ts`

**Interfaces:**
- Consumes: `phanTichNhanh`, `chuanTien`, `type QuickParseForm` từ `./quickParse` (Task 4).
- Produces: `interface SheetRow`, `phanTichHang(hang: string[], soDong: number): SheetRow`, `danhSachTuRows(rows: string[][]): SheetRow[]` — dùng bởi `Contracts.tsx` (Task 12), nhận `rows` thô từ Apps Script (Task 11).

- [ ] **Step 1: Viết test trước — `src/lib/contracts/sheetSync.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { danhSachTuRows, phanTichHang } from './sheetSync';

// Cột: STT | Nội dung | Họ Tên | Link HĐ | Link BBNT | Link SP | Tiền | Thông tin | Link Lưu | DONE
const HANG_MAU = [
  '1', 'Sản xuất Reels tháng 8', 'Mã Thị Thanh Bình', '', '', '',
  '1.500.000', 'STK: 101871610416\nNgân hàng: viettin', '', '',
];

describe('phanTichHang', () => {
  it('cột riêng (B,C,G) thắng khối Thông tin', () => {
    const r = phanTichHang(HANG_MAU, 2);
    expect(r.ho_ten).toBe('Mã Thị Thanh Bình');
    expect(r.noi_dung).toBe('Sản xuất Reels tháng 8');
    expect(r.tien).toBe('1.500.000');
    expect(r.form.so_tk).toBe('101871610416');
    expect(r.form.ngan_hang).toBe('VietinBank');
    expect(r.nguoi_moi).toBe(true);
    expect(r.done).toBe(false);
  });

  it('đã có Link HĐ/BBNT thì không phải người mới', () => {
    const hang = [...HANG_MAU];
    hang[3] = 'https://drive.google.com/x';
    expect(phanTichHang(hang, 2).nguoi_moi).toBe(false);
  });

  it('cột DONE nhận nhiều dạng true', () => {
    const hang = [...HANG_MAU];
    hang[9] = 'x';
    expect(phanTichHang(hang, 2).done).toBe(true);
  });
});

describe('danhSachTuRows', () => {
  it('bỏ dòng tiêu đề và dòng rỗng, giữ dòng có dữ liệu', () => {
    const rows = [
      ['STT', 'Nội dung', 'Họ Tên'],
      ['', '', '', '', '', '', '', '', '', ''],
      HANG_MAU,
    ];
    const ra = danhSachTuRows(rows);
    expect(ra).toHaveLength(1);
    expect(ra[0].ho_ten).toBe('Mã Thị Thanh Bình');
    expect(ra[0].dong).toBe(3);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- sheetSync`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/contracts/sheetSync.ts`**

```ts
// Biến từng hàng của sheet "Danh sách làm HĐ" thành dữ liệu điền form. Port từ
// D:\App\core\sheet_sync.py. Apps Script (Task 11) chỉ trả về RAW rows — việc hiểu cột nào
// là gì nằm ở đây (client), theo nguyên tắc "logic ở client, server chỉ đọc/ghi hộ Google".

import { chuanTien, phanTichNhanh, type QuickParseForm } from './quickParse';

// Cột (tab mặc định "Thanh Toán"):
// A STT | B Nội dung công việc | C Họ Tên | D Link HĐ | E Link BBNT
// F Link SP | G Tiền | H Thông tin | I Link Lưu HĐ | J DONE
const COT = {
  stt: 0, noi_dung: 1, ho_ten: 2, link_hd: 3, link_bbnt: 4,
  link_sp: 5, tien: 6, thong_tin: 7, link_luu: 8, done: 9,
} as const;

function o(hang: string[], ten: keyof typeof COT): string {
  return (hang[COT[ten]] ?? '').trim();
}

function laTrue(s: string): boolean {
  return ['TRUE', 'X', '1', 'V', '✓', 'DONE', 'CÓ'].includes(s.trim().toUpperCase());
}

export interface SheetRow {
  dong: number;
  stt: string;
  ho_ten: string;
  noi_dung: string;
  tien: string;
  link_luu: string;
  da_co_hd: boolean;
  da_co_bbnt: boolean;
  nguoi_moi: boolean;
  done: boolean;
  form: QuickParseForm;
  goc: Partial<Record<keyof QuickParseForm, string>>;
  khongRo: string[];
}

export function phanTichHang(hang: string[], soDong: number): SheetRow {
  const hoTen = o(hang, 'ho_ten');
  const noiDung = o(hang, 'noi_dung');
  const tien = o(hang, 'tien');

  const r = phanTichNhanh(o(hang, 'thong_tin'));
  const form: QuickParseForm = { ...r.form };
  // Cột riêng thắng khối text: chúng là nơi người dùng chủ động nhập.
  if (hoTen) form.ho_ten = hoTen;
  if (noiDung) form.noi_dung = noiDung;
  if (tien) form.net = chuanTien(tien) || tien;

  const daCoHd = !!o(hang, 'link_hd');
  const daCoBbnt = !!o(hang, 'link_bbnt');
  return {
    dong: soDong,
    stt: o(hang, 'stt'),
    ho_ten: form.ho_ten || '',
    noi_dung: form.noi_dung || '',
    tien: form.net || '',
    link_luu: o(hang, 'link_luu'),
    da_co_hd: daCoHd,
    da_co_bbnt: daCoBbnt,
    nguoi_moi: !daCoHd && !daCoBbnt,
    done: laTrue(o(hang, 'done')),
    form,
    goc: r.goc,
    khongRo: r.khongRo,
  };
}

/** `rows` = giá trị thô trả về từ Apps Script (mảng 2 chiều, DÒNG 1 LÀ TIÊU ĐỀ). */
export function danhSachTuRows(rows: string[][]): SheetRow[] {
  const ra: SheetRow[] = [];
  rows.forEach((h, idx) => {
    const soDong = idx + 1;
    if (soDong === 1) return; // dòng tiêu đề
    if (!h.some((c) => (c || '').trim())) return; // dòng rỗng
    const muc = phanTichHang(h, soDong);
    if (!muc.ho_ten && !muc.noi_dung) return;
    ra.push(muc);
  });
  return ra;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- sheetSync`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/sheetSync.ts src/lib/contracts/sheetSync.test.ts
git commit -m "feat: port sheet_sync.py sang sheetSync.ts (đọc raw rows, không tự gọi Sheets API)"
```

---

## Task 6: `compute.ts`

**Files:**
- Create: `src/lib/contracts/compute.ts`
- Test: `src/lib/contracts/compute.test.ts`

**Interfaces:**
- Consumes: `fmtSo`, `soThanhChu`, `tinhGross` từ `./money` (Task 1); `taoSoHopDong`, `tenFileBbnt`, `tenFileHd` từ `./naming` (Task 2).
- Produces: `class LoiNguoiDung extends Error { ma: string }`, `interface ContractSettings`, `interface ContractForm`, `interface PreparedData`, `interface PreviewResult`, `docTien(giaTri: unknown): number`, `chuanBi(form, cfg, homNay?): PreparedData` (ném `LoiNguoiDung` nếu thiếu trường bắt buộc), `xemTruoc(form, cfg, homNay?): PreviewResult` (không bao giờ ném lỗi) — `ContractSettings`/`ContractForm`/`PreparedData` dùng bởi docxFill.ts (Task 7-8), `ContractSettings` cũng dùng bởi Firestore types (Task 10) và UI (Task 12).

- [ ] **Step 1: Viết test trước — `src/lib/contracts/compute.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { chuanBi, docTien, LoiNguoiDung, xemTruoc, type ContractSettings } from './compute';

const CFG: ContractSettings = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30,
  baoTruocChamDut: 5, ngayThanhLy: 30, hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3,
};

describe('docTien', () => {
  it('chấp nhận số nguyên', () => expect(docTien(1500000)).toBe(1500000));
  it('chấp nhận chuỗi có dấu chấm/đơn vị', () => {
    expect(docTien('15.000.000 đ')).toBe(15000000);
    expect(docTien('2205000 VND')).toBe(2205000);
  });
  it('ném lỗi khi không phải số', () => {
    expect(() => docTien('abc')).toThrow(LoiNguoiDung);
  });
  it('ném lỗi khi <= 0', () => {
    expect(() => docTien(0)).toThrow(LoiNguoiDung);
    expect(() => docTien(-5)).toThrow(LoiNguoiDung);
  });
});

describe('chuanBi', () => {
  it('ném lỗi khi thiếu trường bắt buộc', () => {
    expect(() => chuanBi({}, CFG)).toThrow(LoiNguoiDung);
    expect(() => chuanBi({ ho_ten: 'A' }, CFG)).toThrow(LoiNguoiDung);
  });

  it('ráp đủ dữ liệu, số HĐ đúng ngày đã lùi', () => {
    const homNay = new Date(2026, 7, 19); // 19/08/2026
    const d = chuanBi({ ho_ten: 'Mã Thị Bình', net: '1.500.000', noi_dung: 'Reels' }, CFG, homNay);
    expect(d.net).toBe(1500000);
    expect(d.xung_ho).toBe('Bà'); // mặc định khi không truyền
    expect(d.mst).toBe(''); // không có cccd thì mst cũng rỗng
    expect(d.ngay_hd.getDate()).toBe(14); // 19 - 5 ngày
    expect(d.so_hd).toContain('/HĐ/ALC-MB');
  });

  it('mst rỗng thì tự lấy bằng cccd', () => {
    const d = chuanBi({ ho_ten: 'A', net: 1000, noi_dung: 'x', cccd: '012345678901' }, CFG);
    expect(d.mst).toBe('012345678901');
  });
});

describe('xemTruoc', () => {
  it('không bao giờ ném lỗi kể cả form rỗng', () => {
    expect(() => xemTruoc({}, CFG)).not.toThrow();
  });

  it('sanSang=false khi thiếu trường, liệt kê cảnh báo', () => {
    const r = xemTruoc({ ho_ten: 'A' }, CFG);
    expect(r.sanSang).toBe(false);
    expect(r.canhBao.some((c) => c.includes('Nội dung công việc'))).toBe(true);
  });

  it('sanSang=true khi đủ trường bắt buộc + net hợp lệ', () => {
    const r = xemTruoc({ ho_ten: 'Mã Thị Bình', net: '1000000', noi_dung: 'Reels' }, CFG);
    expect(r.sanSang).toBe(true);
    expect(r.gross).toBe('1.111.111');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- compute`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/contracts/compute.ts`**

Port 1:1 từ `D:\App\core\compute.py`.

```ts
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
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- compute`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/compute.ts src/lib/contracts/compute.test.ts
git commit -m "feat: port compute.py sang compute.ts"
```

---

## Task 7: `docxXml.ts` — thao tác cấp thấp trên XML docx

**Files:**
- Create: `src/lib/contracts/docxXml.ts`
- Test: `src/lib/contracts/docxXml.test.ts`

**Interfaces:**
- Consumes: không phụ thuộc file nào trước đó (chỉ dùng `DOMParser`/`XMLSerializer` toàn cục, có sẵn nhờ `environment: 'jsdom'` trong test và trình duyệt thật khi chạy production).
- Produces: `W_NS`, `BA_CHAM`, `nfc(s)`, `ptext(p)`, `tatCaParagraph(doc)`, `runsOf(p)`, `replacePh(p, values)`, `replaceAcrossRuns(p, cu, moi)`, `timParagraph(list, tienTo)`, `vaXml(doc, dd, mm, yy)`, `rowsOfTable(tbl)`, `cellsOfRow(tr)`, `paragraphsOf(el)` — dùng bởi docxFill.ts (Task 8) và docxImage.ts (Task 9).

**Ghi chú quan trọng:** `runsOf(p)` chỉ lấy `<w:r>` là **con trực tiếp** của `<w:p>` (khớp hành vi `Paragraph.runs` của python-docx) — placeholder nằm trong content-control (`<w:sdt>`) lồng bên trong sẽ KHÔNG được `replacePh`/`replaceAcrossRuns` sửa, phải vá riêng bằng `vaXml` (giống bản Python cần `_va_xml`). `ptext(p)` thì đọc MỌI `<w:t>` kể cả trong content-control (dùng để tìm đúng đoạn văn bằng `timParagraph`).

- [ ] **Step 1: Viết test trước — `src/lib/contracts/docxXml.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  BA_CHAM, nfc, ptext, replaceAcrossRuns, replacePh, tatCaParagraph, timParagraph, vaXml, W_NS,
} from './docxXml';

function docTuXml(bodyInnerXml: string): Document {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"><w:body>${bodyInnerXml}</w:body></w:document>`;
  return new DOMParser().parseFromString(xml, 'application/xml');
}

describe('nfc', () => {
  it('chuẩn hoá NFD về NFC', () => {
    const nfd = 'Bi\u0300nh'; // "Bình" viết dạng tổ hợp
    expect(nfc(nfd)).toBe('Bình');
  });
});

describe('ptext + tatCaParagraph', () => {
  it('gộp text mọi w:t trong 1 paragraph', () => {
    const doc = docTuXml('<w:p><w:r><w:t>Xin ch</w:t></w:r><w:r><w:t>ào</w:t></w:r></w:p>');
    const [p] = tatCaParagraph(doc);
    expect(ptext(p)).toBe('Xin chào');
  });
});

describe('replacePh', () => {
  it('thay lần lượt từng placeholder …', () => {
    const doc = docTuXml(`<w:p><w:r><w:t>Số: ${BA_CHAM}, ngày ${BA_CHAM}</w:t></w:r></w:p>`);
    const [p] = tatCaParagraph(doc);
    replacePh(p, ['123/HĐ', '19/08/2026']);
    expect(ptext(p)).toBe('Số: 123/HĐ, ngày 19/08/2026');
  });

  it('giá trị null giữ nguyên placeholder', () => {
    const doc = docTuXml(`<w:p><w:r><w:t>A: ${BA_CHAM}, B: ${BA_CHAM}</w:t></w:r></w:p>`);
    const [p] = tatCaParagraph(doc);
    replacePh(p, [null, 'X']);
    expect(ptext(p)).toBe(`A: ${BA_CHAM}, B: X`);
  });

  it('nhận cả "..." ba chấm ASCII', () => {
    const doc = docTuXml('<w:p><w:r><w:t>Tên: ...</w:t></w:r></w:p>');
    const [p] = tatCaParagraph(doc);
    replacePh(p, ['Nguyễn Văn A']);
    expect(ptext(p)).toBe('Tên: Nguyễn Văn A');
  });
});

describe('replaceAcrossRuns', () => {
  it('thay chuỗi bị Word cắt qua nhiều run', () => {
    const doc = docTuXml(
      '<w:p><w:r><w:t>BÀ TRẦN TRANG</w:t></w:r><w:r><w:t> ANH</w:t></w:r></w:p>',
    );
    const [p] = tatCaParagraph(doc);
    const ok = replaceAcrossRuns(p, 'BÀ TRẦN TRANG ANH', 'BÀ NGUYỄN THỊ B');
    expect(ok).toBe(true);
    expect(ptext(p)).toBe('BÀ NGUYỄN THỊ B');
  });

  it('trả về false khi không khớp', () => {
    const doc = docTuXml('<w:p><w:r><w:t>không liên quan</w:t></w:r></w:p>');
    const [p] = tatCaParagraph(doc);
    expect(replaceAcrossRuns(p, 'XYZ', 'ABC')).toBe(false);
  });
});

describe('timParagraph', () => {
  it('ưu tiên khớp startswith trước contains', () => {
    const doc = docTuXml(
      '<w:p><w:r><w:t>chứa Số: X ở giữa</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Số: 123</w:t></w:r></w:p>',
    );
    const P = tatCaParagraph(doc);
    const p = timParagraph(P, 'Số:');
    expect(ptext(p!)).toBe('Số: 123');
  });

  it('trả về null khi không tìm thấy', () => {
    const doc = docTuXml('<w:p><w:r><w:t>abc</w:t></w:r></w:p>');
    expect(timParagraph(tatCaParagraph(doc), 'không có')).toBeNull();
  });
});

describe('vaXml', () => {
  it('vá "Hôm nay …" nằm trong content-control (w:t không phải con trực tiếp của w:r cấp paragraph)', () => {
    const doc = docTuXml(
      `<w:sdt><w:sdtContent><w:p><w:r><w:t>Hôm nay, ngày ${BA_CHAM} tháng ${BA_CHAM} năm ${BA_CHAM}</w:t></w:r></w:p></w:sdtContent></w:sdt>`,
    );
    vaXml(doc, '19', '08', '2026');
    const [p] = tatCaParagraph(doc);
    expect(ptext(p)).toBe('Hôm nay, ngày 19 tháng 08 năm 2026');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- docxXml`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/contracts/docxXml.ts`**

Port 1:1 từ `D:\App\core\docx_util.py`, nhưng thao tác trực tiếp trên DOM Element (`w:p`/`w:r`/`w:t`) thay vì object model của python-docx.

```ts
// Thao tác cấp thấp trên XML của document.xml (docx). Port từ D:\App\core\docx_util.py,
// nhưng làm việc trực tiếp trên DOM Element (thay vì object model python-docx).

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const BA_CHAM = '…';

export function nfc(s: string | null | undefined): string {
  return (s || '').normalize('NFC');
}

function isW(el: Element, local: string): boolean {
  return el.namespaceURI === W_NS && el.localName === local;
}

function directChildren(el: Element, local: string): Element[] {
  return Array.from(el.children).filter((c) => isW(c, local));
}

/** Text đầy đủ của 1 <w:p>, gộp cả w:t nằm trong content-control (đệ quy toàn bộ subtree). */
export function ptext(p: Element): string {
  const ts = p.getElementsByTagNameNS(W_NS, 't');
  let out = '';
  for (let i = 0; i < ts.length; i++) out += ts[i].textContent || '';
  return nfc(out);
}

export function tatCaParagraph(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
}

/** <w:r> CON TRỰC TIẾP của <w:p> — khớp hành vi Paragraph.runs của python-docx, KHÔNG đi
 *  vào content-control lồng bên trong. */
export function runsOf(p: Element): Element[] {
  return directChildren(p, 'r');
}

function tOf(r: Element): Element | undefined {
  return directChildren(r, 't')[0];
}

function runText(r: Element): string {
  const t = tOf(r);
  return t ? t.textContent || '' : '';
}

function setRunText(r: Element, text: string): void {
  let t = tOf(r);
  if (!t) {
    t = r.ownerDocument!.createElementNS(W_NS, 'w:t');
    r.appendChild(t);
  }
  t.textContent = text;
  if (/^\s|\s$/.test(text)) t.setAttribute('xml:space', 'preserve');
}

/** Thay lần lượt từng placeholder '…' hoặc '...' bằng values[i]. null giữ nguyên placeholder.
 *  Ghi thẳng vào run chứa placeholder nên format gốc (bold/italic…) được giữ nguyên. */
export function replacePh(p: Element | null, values: (string | null)[]): void {
  if (!p) return;
  let chiSo = 0;
  const lay = (): string | null => (chiSo < values.length ? values[chiSo++] : null);

  for (const r of runsOf(p)) {
    const t = runText(r);
    if (!t.includes(BA_CHAM) && !t.includes('...')) continue;
    let ra = '';
    let i = 0;
    while (i < t.length) {
      if (t[i] === BA_CHAM) {
        const v = lay();
        ra += v ?? BA_CHAM;
        i += 1;
      } else if (t.startsWith('...', i)) {
        const v = lay();
        ra += v ?? '...';
        i += 3;
      } else {
        ra += t[i];
        i += 1;
      }
    }
    setRunText(r, ra);
  }
}

/** Thay chuỗi kể cả khi Word cắt nó qua nhiều run. Phần thay thế ghi vào run chứa ký tự đầu
 *  tiên của chuỗi cũ (thừa hưởng format run đó); các run còn lại chỉ bị xoá phần chồng lấn. */
export function replaceAcrossRuns(p: Element | null, cu: string, moi: string): boolean {
  if (!p) return false;
  const runs = runsOf(p);
  let texts = runs.map(runText);
  let gop = texts.join('');
  let dau = gop.indexOf(cu);
  if (dau < 0) {
    // Đoạn có thể đang ở dạng NFD — chuẩn hoá rồi ghi lại vào run để chỉ số ký tự khớp.
    const chuan = texts.map(nfc);
    dau = chuan.join('').indexOf(cu);
    if (dau < 0) return false;
    runs.forEach((r, i) => setRunText(r, chuan[i]));
    texts = chuan;
  }
  const cuoi = dau + cu.length;
  let viTri = 0;
  runs.forEach((r, i) => {
    const t = texts[i];
    const batDau = viTri;
    const ketThuc = viTri + t.length;
    viTri = ketThuc;
    if (ketThuc <= dau || batDau >= cuoi) return;
    const trai = t.slice(0, Math.max(dau, batDau) - batDau);
    const phai = t.slice(Math.min(cuoi, ketThuc) - batDau);
    setRunText(r, batDau <= dau && dau < ketThuc ? trai + moi + phai : trai + phai);
  });
  return true;
}

/** Khớp startswith trước (chính xác hơn), không có thì khớp contains. */
export function timParagraph(danhSach: Element[], tienTo: string): Element | null {
  for (const p of danhSach) {
    if (ptext(p).trim().startsWith(tienTo)) return p;
  }
  for (const p of danhSach) {
    if (ptext(p).includes(tienTo)) return p;
  }
  return null;
}

/** Vá dòng "Hôm nay …" còn sót trong content-control (w:t không phải con trực tiếp của
 *  w:r cấp paragraph nên replacePh không sửa được) — quét MỌI w:t trong toàn document. */
export function vaXml(doc: Document, dd: string, mm: string, yy: string): void {
  const ts = doc.getElementsByTagNameNS(W_NS, 't');
  const giaTri = [dd, mm, yy];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const text = t.textContent || '';
    if (text.startsWith('Hôm nay') && text.includes(BA_CHAM)) {
      let k = 0;
      let ra = '';
      for (const ch of text) {
        if (ch === BA_CHAM && k < 3) {
          ra += giaTri[k];
          k += 1;
        } else {
          ra += ch;
        }
      }
      t.textContent = ra;
    }
  }
}

export function rowsOfTable(tbl: Element): Element[] {
  return directChildren(tbl, 'tr');
}

export function cellsOfRow(tr: Element): Element[] {
  return directChildren(tr, 'tc');
}

export function paragraphsOf(el: Element): Element[] {
  return directChildren(el, 'p');
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- docxXml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/docxXml.ts src/lib/contracts/docxXml.test.ts
git commit -m "feat: port docx_util.py sang docxXml.ts (thao tác DOM thay object model python-docx)"
```

---

## Task 8: `docxFill.ts` — điền HĐ/BBNT + tách file (chưa có ảnh)

**Files:**
- Create: `src/assets/contracts/HDDV_BBNT_Mau_moi.docx` (copy nguyên file từ `D:\App\assets\HDDV_BBNT_Mau_moi.docx`)
- Create: `src/lib/contracts/docxFill.ts`
- Test: `src/lib/contracts/docxFill.test.ts`

**Interfaces:**
- Consumes: `PreparedData`, `ContractSettings` từ `./compute` (Task 6); `fmtSo`, `soThanhChu`, `tinhGross`, `soNgayChu` từ `./money` (Task 1); `tenFileHd`, `tenFileBbnt` từ `./naming` (Task 2); `W_NS`, `BA_CHAM`, `nfc`, `ptext`, `tatCaParagraph`, `replacePh`, `replaceAcrossRuns`, `timParagraph`, `vaXml`, `rowsOfTable`, `cellsOfRow`, `paragraphsOf`, `runsOf` từ `./docxXml` (Task 7).
- Produces: `interface GeneratedFiles { hdBlob: Blob; bbntBlob: Blob; hdFilename: string; bbntFilename: string }`, `taoHaiFile(d: PreparedData, cfg: ContractSettings, templateBytes: ArrayBuffer): Promise<GeneratedFiles>`, `demPlaceholderSot(blob: Blob): Promise<number>`, `taiXuong(blob: Blob, filename: string): void` — dùng bởi docxImage.ts (Task 9, mở rộng thêm bước chèn ảnh) và `Contracts.tsx` (Task 12).

**Bước 0 — copy file mẫu:** Dùng lệnh sau để copy template thật (không tự tạo file mẫu mới):

```bash
cp "D:\App\assets\HDDV_BBNT_Mau_moi.docx" "src/assets/contracts/HDDV_BBNT_Mau_moi.docx"
```

(Nếu chạy trên máy khác không có `D:\App`, xin file `HDDV_BBNT_Mau_moi.docx` từ người yêu cầu tính năng.)

- [ ] **Step 1: Viết test trước — `src/lib/contracts/docxFill.test.ts`**

Test dùng đúng file mẫu thật (đọc từ đĩa qua `fs`, chỉ chạy được trong Node/vitest — không import file docx như module ES).

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { chuanBi, type ContractSettings } from './compute';
import { demPlaceholderSot, taoHaiFile } from './docxFill';

const CFG: ContractSettings = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30,
  baoTruocChamDut: 5, ngayThanhLy: 30, hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3,
};

function templateBytes(): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../assets/contracts/HDDV_BBNT_Mau_moi.docx'));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function docxText(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('text');
  return xml;
}

describe('taoHaiFile', () => {
  it('sinh 2 file, không còn placeholder sót', async () => {
    const d = chuanBi(
      {
        ho_ten: 'Mã Thị Thanh Bình', net: '1.500.000', noi_dung: 'Sản xuất Reels tháng 8',
        cccd: '040303013569', ngay_cap: '28/09/2021', dia_chi: 'Hà Nội', sdt: '0912345678',
        email: 'a@b.com', ten_tk: 'MA THI THANH BINH', so_tk: '101871610416', ngan_hang: 'VietinBank',
      },
      CFG,
      new Date(2026, 7, 19),
    );
    const { hdBlob, bbntBlob, hdFilename, bbntFilename } = await taoHaiFile(d, CFG, templateBytes());

    expect(hdFilename).toBe('Hop dong - Ma Thi Thanh Binh - San xuat Reels thang 8.docx');
    expect(bbntFilename).toBe('BBNT - Ma Thi Thanh Binh - San xuat Reels thang 8.docx');
    expect(await demPlaceholderSot(hdBlob)).toBe(0);
    expect(await demPlaceholderSot(bbntBlob)).toBe(0);
  });

  it('nội dung HĐ chứa tên, số HĐ, tiền bằng chữ', async () => {
    const d = chuanBi({ ho_ten: 'Nguyễn Văn A', net: 1000000, noi_dung: 'Quay video' }, CFG, new Date(2026, 7, 19));
    const { hdBlob } = await taoHaiFile(d, CFG, templateBytes());
    const xml = await docxText(hdBlob);
    expect(xml).toContain('NGUYỄN VĂN A');
    expect(xml).toContain(d.so_hd);
  });

  it('HĐ không còn chứa đoạn "BBNT" (đã bị tách bỏ)', async () => {
    const d = chuanBi({ ho_ten: 'Nguyễn Văn A', net: 1000000, noi_dung: 'Quay video' }, CFG, new Date(2026, 7, 19));
    const { hdBlob, bbntBlob } = await taoHaiFile(d, CFG, templateBytes());
    const hdXml = await docxText(hdBlob);
    const bbXml = await docxText(bbntBlob);
    // Nhãn "HDDV"/"BBNT" tự thân (paragraph đánh dấu) không còn trong file tương ứng.
    expect(hdXml).not.toContain('>BBNT<');
    expect(bbXml).not.toContain('>HDDV<');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- docxFill`
Expected: FAIL — module chưa tồn tại (file mẫu đã copy ở Step 0 nên không fail vì thiếu asset).

- [ ] **Step 3: Viết `src/lib/contracts/docxFill.ts`**

Port từ `D:\App\core\docx_fill.py` (trừ phần chèn ảnh — làm ở Task 9).

```ts
// Điền MẪU MỚI và tách thành hai file HĐ + BBNT. Port từ D:\App\core\docx_fill.py.
// Chạy hoàn toàn trong trình duyệt: JSZip đọc/ghi file .docx (zip), DOMParser/XMLSerializer
// sửa word/document.xml trực tiếp — không cần server.

import JSZip from 'jszip';
import type { ContractSettings, PreparedData } from './compute';
import { fmtSo, soNgayChu, soThanhChu, tinhGross } from './money';
import { tenFileBbnt, tenFileHd } from './naming';
import {
  BA_CHAM, cellsOfRow, nfc, paragraphsOf, ptext, replaceAcrossRuns, replacePh, rowsOfTable,
  runsOf, tatCaParagraph, timParagraph, vaXml, W_NS,
} from './docxXml';

const TEN_MAU = 'TRẦN TRANG ANH';

function txtCua(el: Element): string {
  if (el.namespaceURI === W_NS && el.localName === 'p') return ptext(el);
  return '__tbl__';
}

function dmy(d: Date): [string, string, string] {
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getFullYear()),
  ];
}

function dienBang(doc: Document, d: PreparedData, cfg: ContractSettings, ten: string): void {
  const tbls = Array.from(doc.getElementsByTagNameNS(W_NS, 'tbl'));
  for (const tb of tbls) {
    const rows = rowsOfTable(tb);
    if (!rows.length) continue;
    const oDau = cellsOfRow(rows[0]).map((c) => nfc(c.textContent || '').trim());
    const gop = oDau.join(' ');

    // Bảng chữ ký
    if (gop.includes('BÊN A') && gop.includes('BÊN B')) {
      for (const row of rows) {
        for (const c of cellsOfRow(row)) {
          for (const p of paragraphsOf(c)) {
            for (const r of runsOf(p)) {
              const t = Array.from(r.children).find((x) => x.namespaceURI === W_NS && x.localName === 't');
              if (t && (t.textContent || '').trim() === BA_CHAM) {
                t.textContent = (t.textContent || '').replace(BA_CHAM, ten);
              }
            }
          }
        }
      }
    }

    // Bảng nội dung BBNT: cột 3 (ảnh) để trống — chèn ở Task 9.
    if (oDau.includes('Hạng mục')) {
      if (rows.length < 2) continue;
      const o = cellsOfRow(rows[1]);
      const dat = (cell: Element, txt: string) => {
        const p = paragraphsOf(cell)[0];
        if (!p) return;
        for (const r of runsOf(p)) p.removeChild(r);
        const r = doc.createElementNS(W_NS, 'w:r');
        const t = doc.createElementNS(W_NS, 'w:t');
        t.textContent = txt;
        if (/^\s|\s$/.test(txt)) t.setAttribute('xml:space', 'preserve');
        r.appendChild(t);
        p.appendChild(r);
      };
      if (o[0]) dat(o[0], cfg.hangMucBbnt);
      if (o[1]) dat(o[1], d.noi_dung.trim());
    }
  }
}

function dien(doc: Document, d: PreparedData, cfg: ContractSettings): void {
  const net = d.net;
  const gross = tinhGross(net, cfg.thueTNCN);
  const ten = d.ho_ten.toUpperCase();
  const xungHo = (d.xung_ho || 'Bà').toUpperCase();

  const [dd, mm, yy] = dmy(d.ngay_hd);
  const ngayHieuLuc = `${dd}/${mm}/${yy}`;
  const [dbb, mbb, ybb] = dmy(d.ngay_bbnt);
  const ngayHoanThanh = `${dbb}/${mbb}/${ybb}`;

  const P = tatCaParagraph(doc);

  // (c) phải chạy TRƯỚC phép thay tên toàn cục, vì nó khớp cụm dài hơn.
  for (const p of P) replaceAcrossRuns(p, `BÀ ${TEN_MAU}`, `${xungHo} ${ten}`);
  // (b) đồng bộ thời hạn thanh toán ghi cứng trong BBNT.
  const moiHan = soNgayChu(cfg.thoiHanThanhToan);
  for (const p of P) replaceAcrossRuns(p, '14 (mười bốn)', moiHan);
  // Thay tên mẫu còn lại (chữ ký HĐ, chữ ký BBNT).
  for (const p of P) replaceAcrossRuns(p, TEN_MAU, ten);

  replacePh(timParagraph(P, 'Số:'), [d.so_hd]);

  // "Hôm nay, ngày … tháng … năm …" của HĐ nằm trước nhãn BBNT. Bản của BBNT nằm trong
  // content-control (replacePh không sửa được) — vá sau bằng vaXml().
  let trongBbnt = false;
  for (const p of P) {
    const sTxt = ptext(p).trim();
    if (sTxt === 'BBNT') trongBbnt = true;
    if (sTxt.startsWith('Hôm nay, ngày') && !trongBbnt) replacePh(p, [dd, mm, yy]);
  }

  replacePh(timParagraph(P, 'BÊN CUNG CẤP DỊCH VỤ: …'), [ten]);

  for (const p of P) {
    const sTxt = ptext(p).trim();
    if (sTxt.startsWith('CCCD số:')) replacePh(p, [d.cccd, d.ngay_cap]);
    else if (sTxt.startsWith('MST:')) replacePh(p, [d.mst]);
    else if (sTxt.startsWith('Địa chỉ:')) replacePh(p, [d.dia_chi]);
    else if (sTxt.startsWith('SĐT:')) replacePh(p, [d.sdt, d.email]);
  }

  const noiDung = d.noi_dung.trim().replace(/;+$/, '');
  replacePh(timParagraph(P, 'Bên A có trách nhiệm thực hiện các công việc'), [noiDung]);
  replacePh(timParagraph(P, 'Hợp đồng này có hiệu lực'), [ngayHieuLuc]);
  replacePh(timParagraph(P, 'Thời gian dự kiến hoàn thành công việc'), [ngayHoanThanh]);
  replacePh(
    timParagraph(P, '1.  Phí dịch vụ') || timParagraph(P, 'Phí dịch vụ thực hiện'),
    [fmtSo(gross), soThanhChu(gross).toLowerCase() + ' '],
  );
  replacePh(timParagraph(P, 'Tên tài khoản:'), [d.ten_tk]);
  replacePh(timParagraph(P, 'Số tài khoản:'), [d.so_tk]);
  replacePh(timParagraph(P, 'Ngân hàng:'), [d.ngan_hang]);
  replacePh(timParagraph(P, '- Thanh toán: Trong vòng'), [String(cfg.thoiHanThanhToan), fmtSo(net), soThanhChu(net)]);

  // Hai chỗ script gốc bỏ sót.
  replacePh(timParagraph(P, 'Khi muốn chấm dứt hợp đồng trước thời hạn'), [soNgayChu(cfg.baoTruocChamDut)]);
  replacePh(timParagraph(P, 'kể từ ngày Bên B hoàn thành nghĩa vụ thanh toán'), [soNgayChu(cfg.ngayThanhLy)]);

  // BBNT
  replacePh(timParagraph(P, 'Căn cứ vào Hợp đồng số'), [d.so_hd, dd, mm, yy]);
  replacePh(timParagraph(P, 'Bên A đã hoàn thành toàn bộ công việc'), [d.so_hd, dd, mm, yy]);
  replacePh(timParagraph(P, '- Tổng phí dịch vụ là:'), [
    fmtSo(gross), soThanhChu(gross).toLowerCase(), fmtSo(net), soThanhChu(net).toLowerCase(),
  ]);

  dienBang(doc, d, cfg, ten);
  vaXml(doc, dd, mm, yy);
}

async function docxToDoc(zip: JSZip): Promise<Document> {
  const xml = await zip.file('word/document.xml')!.async('text');
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function docToZipXml(zip: JSZip, doc: Document): void {
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
}

/** giu='hd' giữ phần trước nhãn BBNT; giu='bb' giữ phần sau. Mỗi lần gọi mở LẠI template gốc
 *  (giống bản Python: mỗi nửa fill độc lập trên bản sao riêng của template). */
async function luuMotNua(
  templateBytes: ArrayBuffer, d: PreparedData, cfg: ContractSettings, giu: 'hd' | 'bb',
): Promise<{ zip: JSZip; doc: Document }> {
  const zip = await JSZip.loadAsync(templateBytes);
  const doc = await docxToDoc(zip);
  dien(doc, d, cfg);

  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const con = Array.from(body.children);
  const iBb = con.findIndex((el) => txtCua(el) === 'BBNT');
  if (iBb < 0) throw new Error('Không tìm thấy nhãn BBNT trong file mẫu — mẫu có thể đã bị đổi.');

  if (giu === 'hd') {
    for (const el of con.slice(iBb)) body.removeChild(el);
    for (const el of Array.from(body.children)) {
      if (txtCua(el) === 'HDDV') {
        body.removeChild(el);
        break;
      }
    }
  } else {
    for (const el of con.slice(0, iBb + 1)) body.removeChild(el);
  }

  return { zip, doc };
}

export interface GeneratedFiles {
  hdBlob: Blob;
  bbntBlob: Blob;
  hdFilename: string;
  bbntFilename: string;
}

/** Sinh 2 file HĐ + BBNT từ template. `templateBytes` = nội dung file mẫu (bundle sẵn, xem
 *  Contracts.tsx ở Task 12 — fetch 1 lần lúc mở trang). */
export async function taoHaiFile(
  d: PreparedData, cfg: ContractSettings, templateBytes: ArrayBuffer,
): Promise<GeneratedFiles> {
  const [hd, bb] = await Promise.all([
    luuMotNua(templateBytes, d, cfg, 'hd'),
    luuMotNua(templateBytes, d, cfg, 'bb'),
  ]);
  docToZipXml(hd.zip, hd.doc);
  docToZipXml(bb.zip, bb.doc);
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const [hdBlob, bbntBlob] = await Promise.all([
    hd.zip.generateAsync({ type: 'blob', mimeType: mime }),
    bb.zip.generateAsync({ type: 'blob', mimeType: mime }),
  ]);
  return {
    hdBlob, bbntBlob,
    hdFilename: tenFileHd(d.ho_ten, d.noi_dung),
    bbntFilename: tenFileBbnt(d.ho_ten, d.noi_dung),
  };
}

/** Đếm placeholder còn sót ('…' hoặc '...') — dùng để cảnh báo trước khi giao file cho đối tác. */
export async function demPlaceholderSot(blob: Blob): Promise<number> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  let t = '';
  for (const p of tatCaParagraph(doc)) t += ptext(p) + '\n';
  const c1 = (t.match(/…/g) || []).length;
  const c2 = (t.match(/\.\.\./g) || []).length;
  return c1 + c2;
}

export function taiXuong(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Lưu ý:** so với `_luu_mot_nua` trong Python (ghi zip → mở lại → vá XML → ghi lại), bản TS gộp `dien()` (đã gọi `vaXml` bên trong) và tách HĐ/BBNT trong CÙNG một lần parse DOM (`luuMotNua`), rồi serialize `document.xml` một lần duy nhất ở `taoHaiFile` (`docToZipXml`) — không cần vòng zip→unzip lần hai như bản Python vì không có giới hạn "python-docx không sửa được content-control" (DOM ở đây đã sửa trực tiếp qua `vaXml`).

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- docxFill`
Expected: PASS. Nếu FAIL vì không tìm thấy đoạn nào đó (`timParagraph` trả null khiến `replacePh` không làm gì) — mở file mẫu `src/assets/contracts/HDDV_BBNT_Mau_moi.docx` bằng Word, so khớp lại đúng chuỗi tiền tố đang tìm (`'Bên A có trách nhiệm...'`, `'1.  Phí dịch vụ'`...) — copy chính xác từ Word, kể cả khoảng trắng kép nếu có.

- [ ] **Step 5: Commit**

```bash
git add src/assets/contracts/HDDV_BBNT_Mau_moi.docx src/lib/contracts/docxFill.ts src/lib/contracts/docxFill.test.ts
git commit -m "feat: port docx_fill.py sang docxFill.ts, sinh HĐ/BBNT hoàn toàn client-side"
```

---

## Task 9: `docxImage.ts` + `imageCrop.ts` — chèn ảnh chứng minh

**Files:**
- Create: `src/lib/contracts/docxImage.ts`
- Create: `src/lib/contracts/imageCrop.ts`
- Test: `src/lib/contracts/docxImage.test.ts`
- Test: `src/lib/contracts/imageCrop.test.ts`
- Modify: `src/lib/contracts/docxFill.ts` (export thêm hàm nhận ảnh)

**Interfaces:**
- Consumes: `W_NS`, `rowsOfTable`, `cellsOfRow`, `paragraphsOf`, `runsOf`, `nfc` từ `./docxXml` (Task 7).
- Produces: `interface CropRegion { x: number; y: number; w: number; h: number }`, `validateCropRegion(vung: CropRegion | null, boundsOk?: boolean): void` (ném lỗi nếu vùng cắt sai), `catAnh(file: Blob, vung: CropRegion | null): Promise<{ bytes: Uint8Array; widthPx: number; heightPx: number; blob: Blob }>` (chạy trình duyệt, canvas), `chenAnhBbnt(zip: JSZip, doc: Document, bytes: Uint8Array, widthPx: number, heightPx: number, rongInch: number): Promise<boolean>` — dùng bởi `Contracts.tsx` (Task 12).

**Rủi ro kỹ thuật cao nhất của cả kế hoạch** (đã nêu trong spec): dựng XML `<w:drawing>` bằng tay vì không dùng thư viện tạo docx nào có sẵn API "chèn ảnh vào ô có sẵn của file .docx đang có". Cấu trúc XML dưới đây là cấu trúc **inline picture tối thiểu chuẩn OOXML** (namespace `wp`/`a`/`pic`), tương đương cấu trúc mà `python-docx`'s `add_picture()` tự sinh ra.

`catAnh` (crop bằng `<canvas>`) dùng `createImageBitmap`/`document.createElement('canvas')` — **KHÔNG chạy được dưới `jsdom`** (không có canvas rendering thật). Vì vậy tách riêng phần validate (thuần, test được) khỏi phần crop thật (chỉ test thủ công trên trình duyệt ở Task 12).

- [ ] **Step 1: Viết test trước cho phần validate — `src/lib/contracts/imageCrop.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { validateCropRegion } from './imageCrop';

describe('validateCropRegion', () => {
  it('null (không crop) luôn hợp lệ', () => {
    expect(() => validateCropRegion(null)).not.toThrow();
  });

  it('vùng hợp lệ trong khung 0..1 không ném lỗi', () => {
    expect(() => validateCropRegion({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).not.toThrow();
  });

  it('w hoặc h <= 0 thì ném lỗi', () => {
    expect(() => validateCropRegion({ x: 0, y: 0, w: 0, h: 0.5 })).toThrow('Vùng cắt ảnh nằm ngoài khung ảnh.');
  });

  it('x hoặc y âm thì ném lỗi', () => {
    expect(() => validateCropRegion({ x: -0.1, y: 0, w: 0.5, h: 0.5 })).toThrow();
  });

  it('vượt quá khung ảnh (x+w > 1) thì ném lỗi', () => {
    expect(() => validateCropRegion({ x: 0.8, y: 0, w: 0.5, h: 0.5 })).toThrow();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- imageCrop`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/contracts/imageCrop.ts`**

```ts
// Cắt ảnh chứng minh bằng canvas — thay Pillow (server-side) của bản Python vì giờ chạy
// hoàn toàn trong trình duyệt. `vung` là tỉ lệ 0..1 so với khung ảnh gốc, giống images.py.
// Chỉ `catAnh` phụ thuộc DOM canvas thật — không test tự động được (xem docxImage.test.ts /
// Task 12 để test thủ công trên trình duyệt thật).

export interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ném lỗi nếu vùng cắt (tỉ lệ 0..1) nằm ngoài khung ảnh. null = không crop, luôn hợp lệ. */
export function validateCropRegion(vung: CropRegion | null): void {
  if (!vung) return;
  const { x, y, w, h } = vung;
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.0001 || y + h > 1.0001) {
    throw new Error('Vùng cắt ảnh nằm ngoài khung ảnh.');
  }
}

export interface CroppedImage {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  blob: Blob;
}

/** Cắt `file` (ảnh PNG/JPG) theo `vung` (tỉ lệ 0..1), trả PNG. `vung=null` giữ nguyên cả ảnh. */
export async function catAnh(file: Blob, vung: CropRegion | null): Promise<CroppedImage> {
  validateCropRegion(vung);
  const bitmap = await createImageBitmap(file);
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (vung) {
    sx = Math.round(vung.x * bitmap.width);
    sy = Math.round(vung.y * bitmap.height);
    sw = Math.round(vung.w * bitmap.width);
    sh = Math.round(vung.h * bitmap.height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không lấy được canvas 2D context.');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG.'))), 'image/png'),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, widthPx: sw, heightPx: sh, blob };
}
```

- [ ] **Step 4: Chạy test validate, xác nhận PASS**

Run: `npm test -- imageCrop`
Expected: PASS (chỉ test `validateCropRegion`; `catAnh` không có test tự động).

- [ ] **Step 5: Viết test trước cho `docxImage.ts` — `src/lib/contracts/docxImage.test.ts`**

Dùng ảnh PNG 1x1 pixel đỏ (base64 cố định, không phụ thuộc file ngoài) làm dữ liệu test.

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { chuanBi, type ContractSettings } from './compute';
import { chenAnhBbnt } from './docxImage';

const CFG: ContractSettings = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30,
  baoTruocChamDut: 5, ngayThanhLy: 30, hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3,
};

// PNG 2x1 pixel đỏ/xanh, dựng tay (không cần file ngoài).
const PNG_2X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFUlEQVR4nGP8z8DwnwEIGAkFjIMBAJqOA/8DfLQ2AAAAAElFTkSuQmCC';

function pngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(PNG_2X1_BASE64, 'base64'));
}

function templateBytes(): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../assets/contracts/HDDV_BBNT_Mau_moi.docx'));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('chenAnhBbnt', () => {
  it('thêm media part + rels + w:drawing vào ô ảnh của bảng "Hạng mục"', async () => {
    const d = chuanBi({ ho_ten: 'Nguyễn Văn A', net: 1000000, noi_dung: 'Quay video' }, CFG, new Date(2026, 7, 19));
    void d;
    const zip = await JSZip.loadAsync(templateBytes());
    const xml = await zip.file('word/document.xml')!.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    const ok = await chenAnhBbnt(zip, doc, pngBytes(), 2, 1, 2.3);
    expect(ok).toBe(true);

    // 1. Có media part mới.
    expect(zip.file('word/media/image1.png')).not.toBeNull();

    // 2. Có relationship trỏ tới nó.
    const relsXml = await zip.file('word/_rels/document.xml.rels')!.async('text');
    expect(relsXml).toContain('media/image1.png');

    // 3. [Content_Types].xml có khai báo extension png.
    const ctXml = await zip.file('[Content_Types].xml')!.async('text');
    expect(ctXml.toLowerCase()).toContain('extension="png"');

    // 4. document.xml (đã sửa qua `doc`) có <w:drawing> mới.
    const serialized = new XMLSerializer().serializeToString(doc);
    expect(serialized).toContain('w:drawing');
    expect(serialized).toContain('pic:pic');
  });

  it('trả về false nếu không tìm thấy bảng "Hạng mục"', async () => {
    const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>';
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const zip = new JSZip();
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    const ok = await chenAnhBbnt(zip, doc, pngBytes(), 2, 1, 2.3);
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 6: Chạy test, xác nhận FAIL**

Run: `npm test -- docxImage`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 7: Viết `src/lib/contracts/docxImage.ts`**

```ts
// Chèn ảnh chứng minh vào ô "Hạng mục" cột 3 của bảng Điều 1 BBNT. Dựng thủ công XML
// <w:drawing> + relationship + content-type vì không dùng thư viện tạo docx nào có sẵn API
// "chèn ảnh vào ô có sẵn". Cấu trúc XML là inline picture tối thiểu chuẩn OOXML, tương đương
// cấu trúc python-docx's add_picture() tự sinh (port ý tưởng từ D:\App\core\images.py, nhưng
// crop ảnh đã làm ở bước khác — xem imageCrop.ts — hàm này chỉ lo nhúng ảnh đã crop sẵn).

import type JSZip from 'jszip';
import { cellsOfRow, nfc, paragraphsOf, rowsOfTable, runsOf, W_NS } from './docxXml';

const EMU_PER_INCH = 914400;
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

async function xmlDoc(zip: JSZip, path: string): Promise<Document> {
  const file = zip.file(path);
  if (!file) throw new Error(`Không tìm thấy ${path} trong file mẫu.`);
  const xml = await file.async('text');
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function writeXml(zip: JSZip, path: string, doc: Document): void {
  zip.file(path, new XMLSerializer().serializeToString(doc));
}

function nextImageName(zip: JSZip): string {
  let i = 1;
  while (zip.file(`word/media/image${i}.png`)) i++;
  return `image${i}.png`;
}

async function addImagePart(zip: JSZip, bytes: Uint8Array): Promise<{ relId: string }> {
  const name = nextImageName(zip);
  zip.file(`word/media/${name}`, bytes);

  const relsPath = 'word/_rels/document.xml.rels';
  const relsDoc = await xmlDoc(zip, relsPath);
  const relsRoot = relsDoc.documentElement;
  const existingIds = Array.from(relsRoot.getElementsByTagNameNS(RELS_NS, 'Relationship'))
    .map((r) => Number((r.getAttribute('Id') || 'rId0').replace('rId', '')))
    .filter((n) => !Number.isNaN(n));
  const relId = `rId${Math.max(0, ...existingIds) + 1}`;
  const rel = relsDoc.createElementNS(RELS_NS, 'Relationship');
  rel.setAttribute('Id', relId);
  rel.setAttribute('Type', `${R_NS}/image`);
  rel.setAttribute('Target', `media/${name}`);
  relsRoot.appendChild(rel);
  writeXml(zip, relsPath, relsDoc);

  const ctPath = '[Content_Types].xml';
  const ctDoc = await xmlDoc(zip, ctPath);
  const hasPngDefault = Array.from(ctDoc.getElementsByTagNameNS(CT_NS, 'Default')).some(
    (d) => (d.getAttribute('Extension') || '').toLowerCase() === 'png',
  );
  if (!hasPngDefault) {
    const def = ctDoc.createElementNS(CT_NS, 'Default');
    def.setAttribute('Extension', 'png');
    def.setAttribute('ContentType', 'image/png');
    ctDoc.documentElement.appendChild(def);
    writeXml(zip, ctPath, ctDoc);
  }

  return { relId };
}

function buildDrawingRun(doc: Document, relId: string, widthPx: number, heightPx: number, rongInch: number): Element {
  const widthEmu = Math.round(rongInch * EMU_PER_INCH);
  const heightEmu = Math.round(widthEmu * (heightPx / widthPx));

  const r = doc.createElementNS(W_NS, 'w:r');
  const drawing = doc.createElementNS(W_NS, 'w:drawing');
  const inline = doc.createElementNS(WP_NS, 'wp:inline');
  inline.setAttribute('distT', '0');
  inline.setAttribute('distB', '0');
  inline.setAttribute('distL', '0');
  inline.setAttribute('distR', '0');

  const extent = doc.createElementNS(WP_NS, 'wp:extent');
  extent.setAttribute('cx', String(widthEmu));
  extent.setAttribute('cy', String(heightEmu));
  inline.appendChild(extent);

  const docPr = doc.createElementNS(WP_NS, 'wp:docPr');
  docPr.setAttribute('id', '1');
  docPr.setAttribute('name', 'AnhChungMinh');
  inline.appendChild(docPr);

  const graphic = doc.createElementNS(A_NS, 'a:graphic');
  const graphicData = doc.createElementNS(A_NS, 'a:graphicData');
  graphicData.setAttribute('uri', PIC_NS);

  const pic = doc.createElementNS(PIC_NS, 'pic:pic');
  const nvPicPr = doc.createElementNS(PIC_NS, 'pic:nvPicPr');
  const cNvPr = doc.createElementNS(PIC_NS, 'pic:cNvPr');
  cNvPr.setAttribute('id', '0');
  cNvPr.setAttribute('name', 'AnhChungMinh');
  nvPicPr.appendChild(cNvPr);
  nvPicPr.appendChild(doc.createElementNS(PIC_NS, 'pic:cNvPicPr'));
  pic.appendChild(nvPicPr);

  const blipFill = doc.createElementNS(PIC_NS, 'pic:blipFill');
  const blip = doc.createElementNS(A_NS, 'a:blip');
  blip.setAttributeNS(R_NS, 'r:embed', relId);
  blipFill.appendChild(blip);
  const stretch = doc.createElementNS(A_NS, 'a:stretch');
  stretch.appendChild(doc.createElementNS(A_NS, 'a:fillRect'));
  blipFill.appendChild(stretch);
  pic.appendChild(blipFill);

  const spPr = doc.createElementNS(PIC_NS, 'pic:spPr');
  const xfrm = doc.createElementNS(A_NS, 'a:xfrm');
  const off = doc.createElementNS(A_NS, 'a:off');
  off.setAttribute('x', '0');
  off.setAttribute('y', '0');
  const ext = doc.createElementNS(A_NS, 'a:ext');
  ext.setAttribute('cx', String(widthEmu));
  ext.setAttribute('cy', String(heightEmu));
  xfrm.appendChild(off);
  xfrm.appendChild(ext);
  spPr.appendChild(xfrm);
  const prstGeom = doc.createElementNS(A_NS, 'a:prstGeom');
  prstGeom.setAttribute('prst', 'rect');
  prstGeom.appendChild(doc.createElementNS(A_NS, 'a:avLst'));
  spPr.appendChild(prstGeom);
  pic.appendChild(spPr);

  graphicData.appendChild(pic);
  graphic.appendChild(graphicData);
  inline.appendChild(graphic);
  drawing.appendChild(inline);
  r.appendChild(drawing);
  return r;
}

/** Chèn ảnh vào ô "Hình ảnh chứng minh" (cột 3) của bảng Điều 1 BBNT. `doc` phải là Document
 *  đã parse từ word/document.xml của CHÍNH `zip` này (caller ghi lại document.xml sau khi gọi
 *  xong — xem Task 8's `docToZipXml`). Trả false nếu không tìm thấy bảng "Hạng mục". */
export async function chenAnhBbnt(
  zip: JSZip, doc: Document, bytes: Uint8Array, widthPx: number, heightPx: number, rongInch: number,
): Promise<boolean> {
  const tbls = Array.from(doc.getElementsByTagNameNS(W_NS, 'tbl'));
  for (const tb of tbls) {
    const rows = rowsOfTable(tb);
    if (!rows.length) continue;
    const oDau = cellsOfRow(rows[0]).map((c) => nfc(c.textContent || '').trim());
    if (!oDau.includes('Hạng mục')) continue;
    if (rows.length < 2) return false;
    const cell = cellsOfRow(rows[1])[2];
    if (!cell) return false;
    const p = paragraphsOf(cell)[0];
    if (!p) return false;
    for (const r of runsOf(p)) p.removeChild(r);

    const { relId } = await addImagePart(zip, bytes);
    p.appendChild(buildDrawingRun(doc, relId, widthPx, heightPx, rongInch));
    return true;
  }
  return false;
}
```

- [ ] **Step 8: Chạy test, xác nhận PASS**

Run: `npm test -- docxImage`
Expected: PASS.

- [ ] **Step 9: Sửa `docxFill.ts` để expose zip/doc trước khi finalize (cho phép chèn ảnh trước khi serialize)**

Trong `src/lib/contracts/docxFill.ts`, đổi `taoHaiFile` để nhận thêm tham số `anh` tuỳ chọn và gọi `chenAnhBbnt` trên bản BBNT trước khi generate blob:

```ts
// Thêm import ở đầu file:
import { chenAnhBbnt } from './docxImage';

// Thay chữ ký + thân hàm taoHaiFile:
export async function taoHaiFile(
  d: PreparedData,
  cfg: ContractSettings,
  templateBytes: ArrayBuffer,
  anh?: { bytes: Uint8Array; widthPx: number; heightPx: number },
): Promise<GeneratedFiles> {
  const [hd, bb] = await Promise.all([
    luuMotNua(templateBytes, d, cfg, 'hd'),
    luuMotNua(templateBytes, d, cfg, 'bb'),
  ]);
  if (anh) {
    await chenAnhBbnt(bb.zip, bb.doc, anh.bytes, anh.widthPx, anh.heightPx, cfg.anhRongInch);
  }
  docToZipXml(hd.zip, hd.doc);
  docToZipXml(bb.zip, bb.doc);
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const [hdBlob, bbntBlob] = await Promise.all([
    hd.zip.generateAsync({ type: 'blob', mimeType: mime }),
    bb.zip.generateAsync({ type: 'blob', mimeType: mime }),
  ]);
  return {
    hdBlob, bbntBlob,
    hdFilename: tenFileHd(d.ho_ten, d.noi_dung),
    bbntFilename: tenFileBbnt(d.ho_ten, d.noi_dung),
  };
}
```

Thêm test vào `docxFill.test.ts` xác nhận đường đi có ảnh vẫn hoạt động:

```ts
it('kèm ảnh chứng minh vẫn sinh file hợp lệ, không còn placeholder', async () => {
  const d = chuanBi({ ho_ten: 'Trần Thị C', net: 2000000, noi_dung: 'Chụp ảnh sản phẩm' }, CFG, new Date(2026, 7, 19));
  const pngBytes = Uint8Array.from(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFUlEQVR4nGP8z8DwnwEIGAkFjIMBAJqOA/8DfLQ2AAAAAElFTkSuQmCC', 'base64'),
  );
  const { bbntBlob } = await taoHaiFile(d, CFG, templateBytes(), { bytes: pngBytes, widthPx: 2, heightPx: 1 });
  expect(await demPlaceholderSot(bbntBlob)).toBe(0);
});
```

(Thêm `import { taoHaiFile, demPlaceholderSot } from './docxFill';` đã có sẵn ở đầu file test — chỉ cần bổ sung `it(...)` này vào khối `describe('taoHaiFile', ...)`.)

- [ ] **Step 10: Chạy toàn bộ test của Task 8+9, xác nhận PASS**

Run: `npm test -- docx`
Expected: PASS toàn bộ (`docxXml`, `docxFill`, `docxImage`, `imageCrop`).

- [ ] **Step 11: Commit**

```bash
git add src/lib/contracts/docxImage.ts src/lib/contracts/imageCrop.ts src/lib/contracts/docxImage.test.ts src/lib/contracts/imageCrop.test.ts src/lib/contracts/docxFill.ts src/lib/contracts/docxFill.test.ts
git commit -m "feat: chèn ảnh chứng minh vào BBNT (raw OOXML) + crop ảnh bằng canvas"
```

**Xác minh thủ công bắt buộc trước khi coi Task này xong** (không có cách test tự động thay thế): viết một script/console nhỏ tạm thời (hoặc chờ Task 12 có UI) tạo 1 file BBNT có ảnh thật, **mở bằng Microsoft Word hoặc LibreOffice thật**, xác nhận: ảnh hiển thị đúng vị trí, đúng tỉ lệ, không vỡ định dạng, file mở được không báo lỗi "nội dung không đọc được".

---

## Task 10: Firestore — types, rules, actions

**Files:**
- Modify: `src/types/index.ts` (thêm `ContractPartner`, `ContractSettingsDoc`, mở rộng `TeamDoc`)
- Modify: `firestore.rules` (thêm rule `contractPartners`)
- Modify: `src/lib/actions.ts` (thêm `col.contractPartners`, `ref.contractPartner`, `luuContractPartner`, `capNhatContractSettings`)

**Interfaces:**
- Consumes: `chuanHoa` từ `../lib/contracts/naming` (Task 2), `ContractForm` từ `../lib/contracts/compute` (Task 6).
- Produces: `ContractPartner`, `ContractSettingsDoc` types; `col.contractPartners()`, `ref.contractPartner(id)`, `luuContractPartner(form: ContractForm): Promise<void>`, `capNhatContractSettings(settings: ContractSettingsDoc): Promise<void>` — dùng bởi `Contracts.tsx` (Task 12).

- [ ] **Step 1: Thêm types vào `src/types/index.ts`**

Thêm vào cuối file (sau `TeamDoc`):

```ts
export interface ContractSettingsDoc {
  luiNgayKy: number;
  thueTNCN: number;
  thoiHanThanhToan: number;
  baoTruocChamDut: number;
  ngayThanhLy: number;
  hangMucBbnt: string;
  anhRongInch: number;
  sheetId: string;
  sheetTab: string;
  thuMucGocDriveId: string; // Drive folder ID (không phải đường dẫn ổ G: như bản Python)
  doSauDoFolder: number;
}

/** Lịch sử đối tác HĐ/BBNT — thay data/history.json của bản Python. Có CCCD/STK: admin-only
 *  (xem firestore.rules). id doc = chuanHoa(hoTen). */
export interface ContractPartner {
  id: string;
  hoTen: string;
  xungHo?: string;
  cccd?: string;
  ngayCap?: string;
  mst?: string;
  diaChi?: string;
  sdt?: string;
  email?: string;
  tenTk?: string;
  soTk?: string;
  nganHang?: string;
  soLan: number;
  lanCuoi?: unknown; // serverTimestamp
}
```

Sửa `TeamDoc` (thêm field `contractSettings` tuỳ chọn):

```ts
export interface TeamDoc {
  id: string;
  name?: string;
  sheetsWebhookUrl?: string;
  notifyWebhookUrl?: string;
  contractSettings?: ContractSettingsDoc;
  createdBy?: string;
}
```

- [ ] **Step 2: Thêm rule vào `firestore.rules`**

Trong `match /teams/{teamId} { ... }`, sau khối `match /tags/{tagId} { ... }` (trước dấu `}` đóng `teams`), thêm:

```
      // Contract Partners Subcollection — lịch sử đối tác HĐ/BBNT (CCCD, số tài khoản): admin-only.
      match /contractPartners/{partnerId} {
        allow read, write: if isAdmin(teamId);
      }
```

`contractSettings` nằm trong doc `teams/{teamId}` — đã được bảo vệ bởi rule `allow update: if isAdmin(teamId);` có sẵn ở đầu `match /teams/{teamId}`, không cần thêm gì.

Deploy thủ công sau khi merge (không tự động trong plan này): Firebase Console → Firestore → database `ai-studio-9933e878-0247-44cf-b7f0-e77cd2ac2eac` → tab Rules → dán toàn bộ nội dung file → Publish.

- [ ] **Step 3: Thêm vào `src/lib/actions.ts`**

Thêm import ở đầu file:

```ts
import type { ContractPartner, ContractSettingsDoc } from '../types';
import { chuanHoa } from './contracts/naming';
import type { ContractForm } from './contracts/compute';
```

Thêm vào object `col` (sau `tags: () => collection(db, ...teamPath, 'tags'),`):

```ts
  contractPartners: () => collection(db, ...teamPath, 'contractPartners'),
```

Thêm vào object `ref` (sau `tag: (id: string) => doc(db, ...teamPath, 'tags', id),`):

```ts
  contractPartner: (id: string) => doc(db, ...teamPath, 'contractPartners', id),
```

Thêm ở cuối file (cần import thêm `getDoc` vào dòng import đầu file — sửa dòng 1-3 thành có `getDoc`):

```ts
/* ---------- Hợp đồng KOL/KOC ---------- */

const CONTRACT_FORM_TO_PARTNER: Record<string, keyof ContractPartner> = {
  xung_ho: 'xungHo', cccd: 'cccd', ngay_cap: 'ngayCap', mst: 'mst', dia_chi: 'diaChi',
  sdt: 'sdt', email: 'email', ten_tk: 'tenTk', so_tk: 'soTk', ngan_hang: 'nganHang',
};

/** Lưu/ghi đè lịch sử đối tác sau khi tạo file thành công — port `store.luu` (history.json). */
export async function luuContractPartner(form: ContractForm): Promise<void> {
  const hoTen = String(form.ho_ten || '').trim();
  if (!hoTen) return;
  const id = chuanHoa(hoTen);
  const snap = await getDoc(ref.contractPartner(id));
  const truoc = snap.exists() ? (snap.data() as ContractPartner) : null;

  const data: Partial<ContractPartner> = { id, hoTen };
  for (const [k, target] of Object.entries(CONTRACT_FORM_TO_PARTNER)) {
    const giaTri = String((form as Record<string, unknown>)[k] || '').trim();
    if (giaTri) (data as Record<string, unknown>)[target] = giaTri;
  }

  await setDoc(ref.contractPartner(id), {
    ...(truoc || {}),
    ...data,
    soLan: (truoc?.soLan || 0) + 1,
    lanCuoi: serverTimestamp(),
  });
}

/** Ghi đè toàn bộ cài đặt tính năng Hợp đồng (giống ghi_cai_dat của bản Python — ghi cả object). */
export async function capNhatContractSettings(settings: ContractSettingsDoc): Promise<void> {
  await updateDoc(ref.team(), { contractSettings: settings });
}
```

Sửa dòng import Firestore ở đầu file để có `getDoc`:

```ts
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
```

- [ ] **Step 4: Kiểm tra biên dịch TypeScript**

Run: `npx tsc --noEmit`
Expected: không có lỗi type liên quan tới file vừa sửa.

- [ ] **Step 5: Chạy toàn bộ test hiện có để chắc không phá gì**

Run: `npm test`
Expected: PASS toàn bộ (Task 10 không có test riêng — thay đổi thuần Firestore/TypeScript, không có logic thuần để unit-test).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts firestore.rules src/lib/actions.ts
git commit -m "feat: thêm Firestore schema + rules cho lịch sử đối tác và cài đặt Hợp đồng"
```

**Nhắc riêng cho người triển khai:** rule mới trong `firestore.rules` **không tự động có hiệu lực** — phải Deploy thủ công qua Firebase Console như mô tả ở Step 2 trước khi test tính năng end-to-end ở Task 12, nếu không mọi ghi/đọc `contractPartners` sẽ bị chặn (permission-denied).

---

## Task 11: Apps Script — mở rộng `apps-script/sync.gs`

**Files:**
- Modify: `apps-script/sync.gs`

**Interfaces:**
- Consumes: không (chạy độc lập trên Google Apps Script, không import gì từ repo).
- Produces: endpoint `GET ?action=contract-list&sheetId=...&sheetTab=...` → `{ ok: true, rows: string[][] }`; endpoint `POST {action:'contract-drive-match', ten, rootFolderId, depth}` → `{ ok: true, ket_qua: {id,name}[] }`; endpoint `POST {action:'contract-drive-copy', filename, base64, folderId?, rootFolderId?, ten?}` → `{ ok: true, fileId, name, folderId }` — dùng bởi `Contracts.tsx` (Task 12).

**Không có test tự động** (giống `sync.gs` hiện tại — Apps Script không chạy được trong CI/vitest). Xác minh bằng `curl` thủ công sau khi Deploy.

- [ ] **Step 1: Sửa `doGet(e)` trong `apps-script/sync.gs`**

Tìm hàm `doGet` hiện tại:

```js
/** Apple/Google Calendar gọi GET để lấy feed .ics. */
function doGet() {
  var ics = loadIcs_();
  if (!ics) {
    ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Media Team//Lich//VI\r\nEND:VCALENDAR';
  }
  return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
}
```

Sửa thành:

```js
/** Apple/Google Calendar gọi GET để lấy feed .ics. Hợp đồng KOL/KOC gọi GET để lấy sheet. */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'contract-list') {
    return contractList_(e.parameter);
  }
  var ics = loadIcs_();
  if (!ics) {
    ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Media Team//Lich//VI\r\nEND:VCALENDAR';
  }
  return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
}
```

- [ ] **Step 2: Sửa `doPost(e)` để thêm 2 action mới**

Tìm đầu hàm `doPost`:

```js
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // --- Feed lịch Apple: lưu chuỗi .ics do app build sẵn ---
    if (data.type === 'ics') {
```

Sửa thành (thêm 2 dòng if ngay sau khai báo `data`):

```js
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // --- Hợp đồng KOL/KOC ---
    if (data.action === 'contract-drive-match') return contractDriveMatch_(data);
    if (data.action === 'contract-drive-copy') return contractDriveCopy_(data);

    // --- Feed lịch Apple: lưu chuỗi .ics do app build sẵn ---
    if (data.type === 'ics') {
```

- [ ] **Step 3: Thêm các hàm mới vào cuối file (trước `function json_(o) {...}`)**

```js
// ============ Hợp đồng KOL/KOC (thêm 2026-08) ============
// GET  ?action=contract-list&sheetId=...&sheetTab=...            -> { ok, rows: [[...], ...] }
// POST {action:'contract-drive-match', ten, rootFolderId, depth}  -> { ok, ket_qua: [{id,name}] }
// POST {action:'contract-drive-copy', filename, base64, folderId?, rootFolderId?, ten?}
//      -> { ok, fileId, name, folderId }
// Đọc sheet CHỈ trả raw rows — việc hiểu cột nào là gì nằm ở client (src/lib/contracts/sheetSync.ts),
// để không lặp logic quick_parse/sheet_sync ở hai ngôn ngữ.

function contractList_(params) {
  try {
    var ss = SpreadsheetApp.openById(params.sheetId);
    var sh = ss.getSheetByName(params.sheetTab);
    if (!sh) return json_({ ok: false, error: 'Không tìm thấy tab "' + params.sheetTab + '"' });
    var lastRow = Math.max(1, sh.getLastRow());
    var rows = sh.getRange(1, 1, lastRow, 10).getDisplayValues();
    return json_({ ok: true, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Mọi thư mục con từ cấp 1 tới cấp `depth` của folder `rootId`. */
function folderConTheoDoSau_(rootId, depth) {
  var tang = [DriveApp.getFolderById(rootId)];
  var ra = [];
  for (var d = 0; d < Math.max(1, depth); d++) {
    var keTiep = [];
    for (var i = 0; i < tang.length; i++) {
      var it = tang[i].getFolders();
      while (it.hasNext()) {
        var f = it.next();
        ra.push(f);
        keTiep.push(f);
      }
    }
    if (!keTiep.length) break;
    tang = keTiep;
  }
  return ra;
}

function chuanHoaTen_(s) {
  return (s || '')
    .toString()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function contractDriveMatch_(data) {
  try {
    var con = folderConTheoDoSau_(data.rootFolderId, data.depth || 2);
    var khoa = chuanHoaTen_(data.ten);
    var khop = con.filter(function (f) {
      return chuanHoaTen_(f.getName()) === khoa;
    });
    if (!khop.length) {
      khop = con.filter(function (f) {
        return chuanHoaTen_(f.getName()).indexOf(khoa) >= 0;
      });
    }
    khop.sort(function (a, b) {
      return b.getLastUpdated() - a.getLastUpdated();
    });
    return json_({
      ok: true,
      ket_qua: khop.map(function (f) {
        return { id: f.getId(), name: f.getName() };
      }),
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Folder tên "T8 26" / "T8 2026" của tháng/năm hiện tại, nằm ngay dưới `rootId`. */
function timFolderThang_(rootId) {
  var now = new Date();
  var thang = now.getMonth() + 1;
  var nam = now.getFullYear();
  var re = /^T0?(\d{1,2})[\s\-\/\._]*?(\d{2}|\d{4})$/i;
  var con = folderConTheoDoSau_(rootId, 1);
  var khop = con.filter(function (f) {
    var m = re.exec(f.getName().trim());
    if (!m) return false;
    var t = Number(m[1]);
    var n = Number(m[2]);
    if (n < 100) n += 2000;
    return t === thang && n === nam;
  });
  khop.sort(function (a, b) {
    return b.getLastUpdated() - a.getLastUpdated();
  });
  return khop.length ? khop[0] : null;
}

function tenKhongTrung_(folder, ten) {
  if (!folder.getFilesByName(ten).hasNext()) return ten;
  var than = ten.replace(/\.docx$/i, '');
  var i = 2;
  while (folder.getFilesByName(than + ' (' + i + ').docx').hasNext()) i++;
  return than + ' (' + i + ').docx';
}

function contractDriveCopy_(data) {
  try {
    var folder;
    if (data.folderId) {
      folder = DriveApp.getFolderById(data.folderId);
    } else {
      var rootFolder = DriveApp.getFolderById(data.rootFolderId);
      var thangFolder = timFolderThang_(data.rootFolderId);
      var cha = thangFolder || rootFolder;
      var hienCo = cha.getFoldersByName(data.ten);
      folder = hienCo.hasNext() ? hienCo.next() : cha.createFolder(data.ten);
    }
    var bytes = Utilities.base64Decode(data.base64);
    var mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var blob = Utilities.newBlob(bytes, mime, data.filename);
    var tenCuoi = tenKhongTrung_(folder, data.filename);
    var file = folder.createFile(blob).setName(tenCuoi);
    return json_({ ok: true, fileId: file.getId(), name: file.getName(), folderId: folder.getId() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
```

- [ ] **Step 4: Deploy version mới trên Google Apps Script**

Trong Google Sheet đang dùng cho đồng bộ (project Apps Script hiện có) → Extensions → Apps Script → dán đè nội dung mới của `sync.gs` → Deploy → Manage deployments → Edit (biểu tượng bút) → Version: "New version" → Deploy. Copy URL `.../exec` (giữ nguyên, không đổi vì cùng deployment).

- [ ] **Step 5: Xác minh thủ công bằng curl**

Thay `<WEBHOOK_URL>`, `<SHEET_ID>` bằng giá trị thật:

```bash
curl "<WEBHOOK_URL>?action=contract-list&sheetId=<SHEET_ID>&sheetTab=Thanh%20Toan"
```

Expected: JSON `{"ok":true,"rows":[[...], ...]}` với dữ liệu thật của sheet.

```bash
curl -X POST "<WEBHOOK_URL>" -d '{"action":"contract-drive-match","ten":"Test Không Tồn Tại","rootFolderId":"<FOLDER_ID>","depth":2}'
```

Expected: JSON `{"ok":true,"ket_qua":[]}` (không tìm thấy, không lỗi).

- [ ] **Step 6: Commit**

```bash
git add apps-script/sync.gs
git commit -m "feat: mở rộng Apps Script webhook đọc Sheet + ghi Drive cho tab Hợp đồng"
```

(Không có gì để "deploy" qua git — Apps Script deploy riêng ở Step 4, độc lập với git repo, giống quy trình `sync.gs` hiện tại.)

---

## Task 12: UI — trang "Hợp đồng" + wiring

**Files:**
- Create: `src/pages/Contracts.tsx`
- Modify: `src/components/layout/Sidebar.tsx` (thêm mục nav)
- Modify: `src/App.tsx` (thêm view routing)

**Interfaces:**
- Consumes: mọi export của Task 1-9 (`src/lib/contracts/*`), `ContractPartner`/`ContractSettingsDoc` + `luuContractPartner`/`capNhatContractSettings` (Task 10), Apps Script endpoints (Task 11), `useAppData()` (đã có sẵn — cung cấp `team`, `isAdmin`), `Button`/`Modal`/`useToast` (đã có sẵn trong `components/ui`, `hooks/useToast`).
- Produces: view `'contracts'` khả dụng trong app, chỉ hiện với admin.

- [ ] **Step 1: Thêm view `'contracts'` vào `Sidebar.tsx`**

Trong `src/components/layout/Sidebar.tsx`:

Sửa dòng type `View` (thêm `'contracts'` trước `'settings'`):

```ts
export type View = 'dashboard' | 'me' | 'projects' | 'daily' | 'contentlist' | 'contracts' | 'reports' | 'performance' | 'settings';
```

Thêm import icon `FileSignature` vào dòng import lucide-react đầu file (thêm vào danh sách import hiện có).

Thêm 1 dòng vào mảng `NAV`, ngay sau dòng `contentlist` (trước dòng `reports`):

```ts
  { view: 'contracts', label: 'Hợp đồng', icon: FileSignature, show: (a) => a.isAdmin },
```

- [ ] **Step 2: Wiring view trong `src/App.tsx`**

Đọc `src/App.tsx` trước khi sửa để khớp đúng pattern switch/render view hiện có (import page tương ứng theo `view === 'xxx'`). Thêm:
- `import { Contracts } from './pages/Contracts';` vào khối import các page.
- Nhánh render `{view === 'contracts' && <Contracts />}` (hoặc đúng cấu trúc switch/if đang dùng trong file) vào đúng vị trí cạnh các view khác.

Không có code mẫu cố định ở đây vì phụ thuộc cấu trúc thật của `App.tsx` (đọc file trước khi sửa, giữ đúng pattern).

- [ ] **Step 3: Viết `src/pages/Contracts.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FolderInput, Loader2, RefreshCw } from 'lucide-react';
import { useAppData } from '../store/AppDataContext';
import { useToast } from '../hooks/useToast';
import { Button, Modal } from '../components/ui';
import { getDoc } from 'firebase/firestore';
import { luuContractPartner, capNhatContractSettings, ref as dbRef } from '../lib/actions';
import { chuanHoa } from '../lib/contracts/naming';
import type { ContractPartner } from '../types';
import { chuanBi, LoiNguoiDung, xemTruoc, type ContractForm, type ContractSettings } from '../lib/contracts/compute';
import { taoHaiFile, taiXuong } from '../lib/contracts/docxFill';
import { catAnh, type CropRegion } from '../lib/contracts/imageCrop';
import { danhSachTuRows, type SheetRow } from '../lib/contracts/sheetSync';
import type { ContractSettingsDoc } from '../types';

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

  const carregarLista = async () => {
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
    if (webhookUrl && settings.sheetId) carregarLista();
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
    const form: ContractForm = { ...row.form };
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
          if (!form[dst] && h[src]) (form as Record<string, unknown>)[dst] = h[src];
        }
      }
    } catch {
      // im lặng — tra lịch sử lỗi không nên chặn người dùng mở form sửa tay.
    }
    setForm(form);
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
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Hợp đồng KOL/KOC</h1>
        <Button onClick={carregarLista} disabled={loadingList}>
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
          <p className="text-sm text-muted">Chưa có dữ liệu — bấm "Tải lại từ Sheet".</p>
        )}
      </div>

      {selected && (
        <Modal title={`Sửa thông tin — ${selected.ho_ten || '(chưa có tên)'}`} onClose={() => setSelected(null)}>
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
                  className="mt-1 w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm"
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
                Tạo & Tải file
              </Button>
              {generated && (
                <Button onClick={copyLenDrive} disabled={busy}>
                  <FolderInput size={16} /> Copy lên Drive
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

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
        className="mt-1 w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm"
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
```

**Lưu ý khi implement:** đọc `src/components/ui/index.tsx` trước khi dùng `Button`/`Modal` để khớp đúng props thật (tên prop `title`/`onClose` ở `Modal` có thể khác — sửa lại theo đúng chữ ký thật của component, code trên là khung tối thiểu để wiring đúng luồng dữ liệu, không phải final pixel-perfect UI). Ô "vùng cắt ảnh" (`cropRegion`) trong bản đầu này cố định `null` (dùng nguyên cả ảnh, không cắt) — UI kéo-chọn vùng cắt trên `<canvas>` là cải tiến có thể làm ở PR sau, không chặn luồng chính.

- [ ] **Step 4: Kiểm tra biên dịch TypeScript**

Run: `npx tsc --noEmit`
Expected: không có lỗi. Sửa các chỗ lệch props thật của `Button`/`Modal`/`useToast` nếu compiler báo.

- [ ] **Step 5: Chạy toàn bộ test suite**

Run: `npm test`
Expected: PASS toàn bộ (Task 12 không thêm unit test — trang UI xác minh bằng browser thủ công ở Step 6).

- [ ] **Step 6: Xác minh thủ công trên trình duyệt (bắt buộc — theo quy tắc UI/frontend của dự án)**

```bash
npx vite --port 5199
```

Mở `http://localhost:5199`, đăng nhập admin, vào tab "Hợp đồng" mới trong sidebar:
1. Xác nhận tab **không hiện** khi đăng nhập bằng tài khoản editor/viewer/content.
2. Cấu hình Sheet ID/tab thật + Webhook URL (đã có sẵn từ Settings → Google Sheet) + Drive folder ID gốc ở panel Cài đặt, bấm Lưu.
3. Bấm "Tải lại từ Sheet", xác nhận danh sách đối tác hiện ra đúng dữ liệu thật.
4. Mở 1 thẻ, sửa thông tin, bấm "Tạo & Tải file" — xác nhận 2 file `.docx` tải về, mở bằng Word/LibreOffice xác nhận nội dung đúng, không còn `…`/`...` sót.
5. Bấm "Copy lên Drive" — xác nhận file xuất hiện đúng folder đối tác (hoặc folder mới tạo trong folder tháng hiện tại) trên Google Drive thật.
6. Kiểm tra Firestore Console: có doc mới trong `teams/MEDIA_TEAM_01/contractPartners`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Contracts.tsx src/components/layout/Sidebar.tsx src/App.tsx
git commit -m "feat: thêm trang Hợp đồng KOL/KOC (đọc Sheet, sinh file client-side, copy Drive)"
```

---

## Sau khi cả 12 task xong

Theo `CLAUDE.md`: chạy `npm run build`, xác nhận build sạch, commit cả `dist/` trước khi push lên `main` — **chỉ làm bước này khi người yêu cầu tính năng xác nhận đã test xong trên trình duyệt** (Task 12 Step 6), không tự ý deploy production.
