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
