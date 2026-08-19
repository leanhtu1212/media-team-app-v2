// Tên đối tác, số hợp đồng, tên file. Port 1:1 từ D:\App\core\naming.py.

const CAM = /[\\/:*?"<>|]/g;
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
