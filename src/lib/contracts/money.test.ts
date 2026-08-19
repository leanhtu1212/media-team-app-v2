import { describe, expect, it } from 'vitest';
import { fmtSo, soNgayChu, soThanhChu, tinhGross } from './money';

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

describe('tinhGross', () => {
  it('suy gross từ net với thuế 10%', () => expect(tinhGross(900000, 0.1)).toBe(1000000));
  it('mặc định thuế 10% khi không truyền', () => expect(tinhGross(900000)).toBe(1000000));
});

describe('soNgayChu', () => {
  it('5 ngày', () => expect(soNgayChu(5)).toBe('5 (năm)'));
  it('30 ngày', () => expect(soNgayChu(30)).toBe('30 (ba mươi)'));
});
