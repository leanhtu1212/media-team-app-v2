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

  it('nhãn gộp chỉ tách ở dấu gạch ĐẦU TIÊN (maxsplit=1)', () => {
    const r = phanTichNhanh('STK - Ngân hàng: 123456 - Foobar Bank - Chi nhánh ABC');
    expect(r.form.so_tk).toBe('123456');
    expect(r.form.ngan_hang).toBe('Foobar Bank - Chi nhánh ABC');
  });
});
