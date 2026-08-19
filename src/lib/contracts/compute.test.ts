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
    expect(d.so_hd).toContain('/HĐ/ALC-MTB');
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
