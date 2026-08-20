import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chuanBi, type ContractSettings } from './compute';
import { taoHaiFile } from './docxFill';
import { kiemTraHaiFile } from './kiemTra';

const CFG: ContractSettings = {
  luiNgayKy: 5, thueTNCN: 0.1, thoiHanThanhToan: 30,
  baoTruocChamDut: 5, ngayThanhLy: 30, hangMucBbnt: 'Sản xuất hình ảnh', anhRongInch: 2.3,
};

function templateBytes(): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../assets/contracts/HDDV_BBNT_Mau_moi.docx'));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFUlEQVR4nGP8z8DwnwEIGAkFjIMBAJqOA/8DfLQ2AAAAAElFTkSuQmCC', 'base64'),
);

const FORM = {
  ho_ten: 'Ngô Trần Ngọc Tú',
  net: 1500000,
  noi_dung: 'Quay video review sản phẩm',
  cccd: '001194007976',
  so_tk: '19032678830011',
  ngan_hang: 'Techcombank',
  ten_tk: 'NGO TRAN NGOC TU',
};

const NGAY = new Date(2026, 7, 19);

const LINK = 'https://shopee.vn/san-pham-abc';

async function kiemTra(kemAnh: boolean, link = LINK) {
  const d = chuanBi(FORM, CFG, NGAY);
  const { hdBlob, bbntBlob } = await taoHaiFile(
    d, CFG, templateBytes(),
    kemAnh ? { bytes: PNG, widthPx: 2, heightPx: 1 } : undefined,
    link,
  );
  return kiemTraHaiFile(hdBlob, bbntBlob, d, CFG, link);
}

const mucTen = (kq: Awaited<ReturnType<typeof kiemTra>>, ten: string) =>
  kq.muc.find((m) => m.ten.startsWith(ten));

describe('kiemTraHaiFile', () => {
  it('file đầy đủ (kèm ảnh) thì không còn lỗi lẫn cảnh báo', async () => {
    const kq = await kiemTra(true);
    const truot = kq.muc.filter((m) => !m.dat).map((m) => `${m.ten}: ${m.chiTiet}`);
    expect(truot).toEqual([]);
    expect(kq.soLoi).toBe(0);
    expect(kq.soCanhBao).toBe(0);
  });

  it('thiếu ảnh chỉ là CẢNH BÁO, không chặn gửi file', async () => {
    const kq = await kiemTra(false);
    expect(mucTen(kq, 'BBNT có ảnh')?.dat).toBe(false);
    expect(kq.soLoi).toBe(0);
    expect(kq.soCanhBao).toBe(1);
  });

  it('không nhập link sản phẩm -> cảnh báo', async () => {
    const kq = await kiemTra(true, '');
    expect(mucTen(kq, 'Link sản phẩm')?.chiTiet).toBe('Chưa nhập link sản phẩm');
    expect(kq.soLoi).toBe(0);
  });

  it('đọc số tiền GROSS trong file, không phải số NET đã nhập', async () => {
    // net 1.500.000 + thuế 10% -> gross 1.666.667; nếu hàm kiểm tra lỡ so với net thì mục này
    // vẫn "đạt" một cách sai — nên khẳng định luôn là gross nằm trong file.
    const kq = await kiemTra(true);
    expect(mucTen(kq, 'Số tiền (gross)')?.dat).toBe(true);
  });

  it('thiếu số tài khoản / CCCD -> cảnh báo, các mục bắt buộc vẫn đạt', async () => {
    const d = chuanBi({ ho_ten: 'Trần Văn B', net: 2000000, noi_dung: 'Chụp ảnh' }, CFG, NGAY);
    const { hdBlob, bbntBlob } = await taoHaiFile(d, CFG, templateBytes(), { bytes: PNG, widthPx: 2, heightPx: 1 });
    const kq = await kiemTraHaiFile(hdBlob, bbntBlob, d, CFG);
    expect(kq.soLoi).toBe(0);
    expect(mucTen(kq, 'Số tài khoản')?.chiTiet).toBe('Chưa nhập số tài khoản');
    expect(mucTen(kq, 'Link sản phẩm')?.chiTiet).toBe('Chưa nhập link sản phẩm');
    expect(mucTen(kq, 'CCCD')?.chiTiet).toBe('Chưa nhập CCCD');
  });
});
