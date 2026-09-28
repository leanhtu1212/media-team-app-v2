import { describe, expect, it } from 'vitest';
import type { ContractPartner } from '../../types';
import { formChoHopDongMoi } from './repeatPartner';

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
