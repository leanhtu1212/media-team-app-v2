import { describe, expect, it } from 'vitest';
import type { ContractPartner } from '../../types';
import type { SheetRow } from './sheetSync';
import { gopDoiTacTuSheet } from './importSheet';
import { chuanHoa } from './naming';

function dong(ho_ten: string, form: Record<string, string>, daCoHd = false): SheetRow {
  return {
    dong: 1, stt: '', ho_ten, noi_dung: '', tien: '', link_sp: '', link_luu: '',
    da_co_hd: daCoHd, da_co_bbnt: false, nguoi_moi: !daCoHd, done: false,
    form: { ho_ten, ...form }, goc: {}, khongRo: [],
  } as SheetRow;
}

describe('gopDoiTacTuSheet', () => {
  it('thêm người mới, gộp nhiều dòng cùng tên, dòng dưới thắng', () => {
    const ra = gopDoiTacTuSheet([
      dong('Trần Văn C', { so_tk: '111', sdt: '0901' }, true),
      dong('tran van  c', { so_tk: '222' }, true),
      dong('', { so_tk: '999' }),
    ], {}, chuanHoa);
    expect(ra).toHaveLength(1);
    expect(ra[0].moi).toBe(true);
    expect(ra[0].data).toMatchObject({ hoTen: 'Trần Văn C', soTk: '222', sdt: '0901', soLan: 2 });
  });

  it('không đè dữ liệu đã lưu trên web, chỉ bù ô trống', () => {
    const partners: Record<string, ContractPartner> = {
      'le d': { id: 'le d', hoTen: 'Lê D', soTk: 'web', soLan: 3 },
    };
    const ra = gopDoiTacTuSheet([dong('Lê D', { so_tk: 'sheet', cccd: '0123' })], partners, chuanHoa);
    expect(ra).toEqual([{ id: 'le d', moi: false, data: { cccd: '0123' } }]);
  });

  it('bỏ qua người đã có mà sheet không bổ sung được gì', () => {
    const partners: Record<string, ContractPartner> = {
      'le d': { id: 'le d', hoTen: 'Lê D', soTk: 'web', soLan: 3 },
    };
    expect(gopDoiTacTuSheet([dong('Lê D', { so_tk: 'sheet' })], partners, chuanHoa)).toEqual([]);
  });
});
