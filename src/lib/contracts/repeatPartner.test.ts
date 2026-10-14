import { describe, expect, it } from 'vitest';
import type { ContractPartner } from '../../types';
import { apDoiTacVaoForm, danhSachDoiTac, formChoHopDongMoi } from './repeatPartner';

describe('formChoHopDongMoi', () => {
  it('giữ thông tin cá nhân và bỏ nội dung, số tiền của hợp đồng cũ', () => {
    const partner: ContractPartner = {
      id: 'nguyen-van-a',
      hoTen: 'Nguyễn Văn A',
      xungHo: 'Ông',
      cccd: '012345678901',
      ngayCap: '01/01/2025',
      mst: '123456789',
      diaChi: 'Hà Nội',
      sdt: '0900000000',
      email: 'a@example.com',
      tenTk: 'NGUYEN VAN A',
      soTk: '1234567890',
      nganHang: 'Vietcombank',
      soLan: 2,
    };

    expect(formChoHopDongMoi(partner, {
      ho_ten: 'Tên trên dòng cũ',
      noi_dung: 'Quay video cũ',
      net: '5000000',
    })).toEqual({
      ho_ten: 'Nguyễn Văn A',
      xung_ho: 'Ông',
      cccd: '012345678901',
      ngay_cap: '01/01/2025',
      mst: '123456789',
      dia_chi: 'Hà Nội',
      sdt: '0900000000',
      email: 'a@example.com',
      ten_tk: 'NGUYEN VAN A',
      so_tk: '1234567890',
      ngan_hang: 'Vietcombank',
    });
  });
});

describe('apDoiTacVaoForm', () => {
  it('đè thông tin cá nhân nhưng giữ số tiền và nội dung đang có', () => {
    const partner: ContractPartner = { id: 'b', hoTen: 'Trần Thị B', soTk: '999', nganHang: 'VCB', soLan: 1 };
    const form = apDoiTacVaoForm(
      { ho_ten: 'gõ dở', so_tk: '111', cccd: 'cũ', net: '3.000.000', noi_dung: 'Quay video' },
      partner,
    );
    expect(form.ho_ten).toBe('Trần Thị B');
    expect(form.so_tk).toBe('999');
    expect(form.ngan_hang).toBe('VCB');
    // Hồ sơ không có CCCD thì ô CCCD phải trống, không giữ CCCD của người gõ trước.
    expect(form.cccd).toBe('');
    expect(form.net).toBe('3.000.000');
    expect(form.noi_dung).toBe('Quay video');
  });
});

describe('danhSachDoiTac', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const partners: Record<string, ContractPartner> = {
    a: { id: 'a', hoTen: 'Đỗ Văn An', sdt: '0911', soLan: 1, lanCuoi: ts(100) },
    b: { id: 'b', hoTen: 'Lê Bình', soTk: '123456', soLan: 2, lanCuoi: ts(300) },
    c: { id: 'c', hoTen: 'Phạm Cường', soLan: 1, lanCuoi: null },
  };

  it('xếp theo TÊN (chữ cuối) A→Z, trùng tên thì xét họ đệm, không phân biệt hoa thường', () => {
    const ds: Record<string, ContractPartner> = {
      a: { id: 'a', hoTen: 'Nguyễn Tiến Anh', soLan: 1 },
      b: { id: 'b', hoTen: 'Đỗ Tuấn Anh', soLan: 1 },
      c: { id: 'c', hoTen: 'NGUYỄN TRUNG KIÊN', soLan: 1 },
      d: { id: 'd', hoTen: 'Lê Bình', soLan: 1 },
      e: { id: 'e', hoTen: 'Vũ Văn Dũng', soLan: 1 },
      f: { id: 'f', hoTen: 'GPHA', soLan: 1 },
    };
    // Bình < Dũng < GPHA < KIÊN; hai "Anh" thì Đỗ trước Nguyễn.
    expect(danhSachDoiTac(ds).map((p) => p.id)).toEqual(['b', 'a', 'd', 'e', 'f', 'c']);
  });

  it('tìm không dấu, kể cả chữ đ, và theo số tài khoản', () => {
    expect(danhSachDoiTac(partners, 'do van').map((p) => p.id)).toEqual(['a']);
    expect(danhSachDoiTac(partners, '3456').map((p) => p.id)).toEqual(['b']);
  });
});
