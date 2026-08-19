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
