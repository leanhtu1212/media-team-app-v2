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

  // Ô link trong sheet thật thường là Insert > Link / smart chip: display value là chữ hoặc
  // RỖNG, URL chỉ có trong ma trận `links` do Apps Script trả kèm.
  it('lấy URL từ ma trận links khi ô chỉ có chữ hoặc rỗng', () => {
    const hang = [...HANG_MAU];
    hang[5] = 'Link SP'; // ô hiện chữ, URL nằm ở rich text
    const links: string[] = [];
    links[3] = 'https://drive.google.com/hd';
    links[5] = 'https://shopee.vn/sp';
    const r = phanTichHang(hang, 2, links);
    expect(r.link_sp).toBe('https://shopee.vn/sp');
    expect(r.nguoi_moi).toBe(false); // link HĐ chỉ có ở rich text vẫn phải tính là đã làm
  });

  it('không có links thì vẫn dùng display value như cũ', () => {
    const hang = [...HANG_MAU];
    hang[5] = 'https://shopee.vn/sp';
    expect(phanTichHang(hang, 2).link_sp).toBe('https://shopee.vn/sp');
  });

  it('cột DONE nhận nhiều dạng true', () => {
    const hang = [...HANG_MAU];
    hang[9] = 'x';
    expect(phanTichHang(hang, 2).done).toBe(true);
  });
});

describe('danhSachTuRows', () => {
  it('giữ dòng mà mọi ô đều là smart chip (display rỗng, chỉ có link)', () => {
    const hang = ['', 'Quay TVC', 'Nguyễn Văn A', '', '', '', '2.000.000', '', '', ''];
    const links: string[][] = [[], []];
    links[1] = [];
    links[1][5] = 'https://shopee.vn/sp';
    const ra = danhSachTuRows([['STT'], hang], links);
    expect(ra).toHaveLength(1);
    expect(ra[0].link_sp).toBe('https://shopee.vn/sp');
  });

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
