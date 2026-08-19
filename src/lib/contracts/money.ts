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

/** Giá trị hợp đồng trước thuế, suy từ số tiền thực nhận. */
export function tinhGross(net: number, thue = 0.1): number {
  return Math.round(net / (1 - thue));
}

/** "5 (năm)" — đúng văn phong sẵn có của Điều 2 trong template. */
export function soNgayChu(n: number): string {
  return `${n} (${soThanhChu(n).toLowerCase()})`;
}
