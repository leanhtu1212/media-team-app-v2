/**
 * Media Team — Google Sheets sync + Apple Calendar (iCal) feed webhook.
 *
 * CÁCH CÀI ĐẶT:
 * 1. Mở Google Sheet của bạn → Extensions (Tiện ích mở rộng) → Apps Script
 * 2. Xoá code mặc định, dán TOÀN BỘ file này vào (đè lên bản cũ nếu có)
 * 3. Nhấn Deploy → New deployment (hoặc Manage deployments → Edit → New version) → "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Nhấn Deploy, copy "Web app URL" (dạng .../exec)
 * 5. Vào app → Cài đặt:
 *    - Đồng bộ Google Sheet → dán URL → Lưu  (dùng POST)
 *    - Lịch Apple (iCal) → nhấn "Cập nhật feed", rồi Subscribe URL trên Apple Calendar
 *      (Apple Calendar → File → New Calendar Subscription → dán URL webcal://.../exec)
 *
 * LƯU Ý: mỗi lần đổi code phải Deploy version mới thì URL mới có doGet trả .ics.
 *
 * ============================================================================
 * BẮT BUỘC cho tính năng Hợp đồng KOL/KOC (2026-08) — Script Properties
 * ============================================================================
 * Web app này chạy dưới quyền "Execute as: Me / Who has access: Anyone", tức là
 * BẤT KỲ AI biết URL cũng gọi được. URL lại nằm ở team doc mà mọi thành viên đọc
 * được. Vì dữ liệu hợp đồng có CCCD + số tài khoản, ba endpoint hợp đồng:
 *   - KHÔNG nhận sheetId / rootFolderId từ phía client nữa (đọc từ Script Property),
 *   - BẮT BUỘC kèm token khớp CONTRACT_TOKEN,
 *   - chỉ ghi được vào thư mục nằm BÊN TRONG CONTRACT_ROOT_FOLDER_ID.
 * Feed .ics và đồng bộ Google Sheet giữ nguyên như cũ, KHÔNG cần token.
 *
 * Cách đặt: Apps Script → Project Settings (Cài đặt dự án) → Script Properties →
 * Add script property, thêm 4 dòng:
 *   CONTRACT_SHEET_ID        = id của Google Sheet "Danh sách làm HĐ"
 *                              (phần giữa /d/ và /edit trong URL sheet)
 *   CONTRACT_SHEET_TAB       = tên tab chứa danh sách (vd: Thanh Toán)
 *   CONTRACT_ROOT_FOLDER_ID  = id thư mục Drive gốc để lưu HĐ/BBNT
 *                              (phần sau /folders/ trong URL thư mục)
 *   CONTRACT_TOKEN           = chuỗi bí mật tự đặt (dài, ngẫu nhiên). Dán ĐÚNG chuỗi
 *                              này vào app → trang Hợp đồng → Cài đặt → "Token".
 *                              Token lưu ở teams/{id}/private/contracts (admin-only).
 * Thiếu property nào thì endpoint tương ứng trả { ok:false, error:... } chứ không chạy.
 * Đổi CONTRACT_TOKEN thì phải sửa lại token trong app; KHÔNG cần Deploy lại
 * (Script Properties đọc lúc chạy), nhưng đổi CODE thì vẫn phải Deploy version mới.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // --- Hợp đồng KOL/KOC ---
    if (data.action === 'contract-drive-match') return contractDriveMatch_(data);
    if (data.action === 'contract-drive-copy') return contractDriveCopy_(data);

    // --- Feed lịch Apple: lưu chuỗi .ics do app build sẵn ---
    if (data.type === 'ics') {
      saveIcs_(data.ics || '');
      return json_({ ok: true });
    }

    // --- Đồng bộ Google Sheet (giữ nguyên như cũ) ---
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var totalRows = 0;
    var sheetNames = Object.keys(data.sheets);
    for (var i = 0; i < sheetNames.length; i++) {
      var name = sheetNames[i];
      var block = data.sheets[name];
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.clearContents();
      sh.clearFormats();
      // clearFormats KHÔNG bỏ merge — còn ô merge cũ của dòng tiêu đề thì setValues sẽ lỗi.
      sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();

      // 1 tab có thể chứa NHIỀU bảng (section) xếp dọc, cách nhau 2 dòng trống.
      // Bản cũ gửi {headers, rows} → bọc lại thành 1 section không tiêu đề cho tương thích.
      var sections = block.sections || [{ title: '', headers: block.headers, rows: block.rows }];
      var row = 1;
      var maxCol = 1;
      sh.setFrozenRows(0); // đặt lại, chỉ khoá khi bảng đầu nằm ngay dòng 1
      for (var s = 0; s < sections.length; s++) {
        var sec = sections[s];
        var nCol = sec.headers.length;
        if (nCol > maxCol) maxCol = nCol;
        ensureRows_(sh, row + sec.rows.length + 4);

        if (sec.title) {
          sh.getRange(row, 1, 1, nCol).merge()
            .setValue(sec.title)
            .setFontWeight('bold').setFontSize(12).setBackground('#e8eaed');
          row++;
        }
        sh.getRange(row, 1, 1, nCol).setValues([sec.headers])
          .setFontWeight('bold').setBackground('#f1f3f4');
        // Chỉ khoá dòng đầu khi bảng đầu tiên bắt đầu ngay từ dòng 1 (tab báo cáo app cũ).
        if (s === 0 && row === 1) sh.setFrozenRows(1);
        row++;

        if (sec.rows.length > 0) {
          sh.getRange(row, 1, sec.rows.length, nCol).setValues(sec.rows);
          boldSummaryRows_(sh, sec.rows, nCol, row);
          row += sec.rows.length;
        } else {
          sh.getRange(row, 1).setValue('(không có dữ liệu)').setFontStyle('italic');
          row++;
        }
        row += 2; // chừa 2 dòng trống trước bảng kế tiếp
        totalRows += sec.rows.length;
      }
      sh.autoResizeColumns(1, maxCol);
      sh.getRange(row, 1).setValue('Cập nhật: ' + data.syncedAt);
    }
    return json_({ ok: true, rows: totalRows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Nới thêm dòng nếu bảng dài hơn số dòng sẵn có (mặc định 1000) — không thì setValues lỗi. */
function ensureRows_(sh, needed) {
  var have = sh.getMaxRows();
  if (needed > have) sh.insertRowsAfter(have, needed - have);
}

/** In đậm các dòng tổng kết (TỔNG TEAM / KPI TEAM) cho dễ đọc. `startRow` = dòng của rows[0]. */
function boldSummaryRows_(sh, rows, nCol, startRow) {
  for (var r = 0; r < rows.length; r++) {
    var label = String(rows[r][1] || rows[r][0] || '');
    if (label.indexOf('TỔNG') === 0 || label.indexOf('KPI TEAM') === 0 || label.indexOf('TB KPI') === 0) {
      sh.getRange(startRow + r, 1, 1, nCol).setFontWeight('bold').setBackground('#fff8e1');
    }
  }
}

/** Apple/Google Calendar gọi GET để lấy feed .ics. Hợp đồng KOL/KOC gọi GET để lấy sheet. */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'contract-list') {
    return contractList_(e.parameter);
  }
  var ics = loadIcs_();
  if (!ics) {
    ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Media Team//Lich//VI\r\nEND:VCALENDAR';
  }
  return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
}

/** Lưu .ics vào Script Properties, chia nhỏ 8000 ký tự/chunk (vượt giới hạn 9KB/property). */
function saveIcs_(ics) {
  var size = 8000;
  var n = Math.max(1, Math.ceil(ics.length / size));
  var map = { ICS_N: String(n) };
  for (var j = 0; j < n; j++) map['ICS_' + j] = ics.substr(j * size, size);
  PropertiesService.getScriptProperties().setProperties(map, true); // true = xoá các key cũ còn sót
}

/** Ghép lại .ics từ các chunk đã lưu. */
function loadIcs_() {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty('ICS_N') || 0);
  if (!n) return '';
  var parts = [];
  for (var i = 0; i < n; i++) parts.push(props.getProperty('ICS_' + i) || '');
  return parts.join('');
}

// ============ Hợp đồng KOL/KOC (thêm 2026-08) ============
// GET  ?action=contract-list&token=...                     -> { ok, rows: [[...], ...] }
// POST {action:'contract-drive-match', token, ten, depth}  -> { ok, ket_qua: [{id,name}] }
// POST {action:'contract-drive-copy', token, filename, base64, folderId?, ten?}
//      -> { ok, fileId, name, folderId }
// Đọc sheet CHỈ trả raw rows — việc hiểu cột nào là gì nằm ở client (src/lib/contracts/sheetSync.ts),
// để không lặp logic quick_parse/sheet_sync ở hai ngôn ngữ.
//
// BẢO MẬT: sheetId / rootFolderId / sheetTab KHÔNG còn lấy từ request (xem khối chú thích
// đầu file). Nếu client vẫn gửi kèm thì bị BỎ QUA hoàn toàn — nếu không, ai biết URL webhook
// cũng đọc được sheet bất kỳ hoặc ghi file vào thư mục Drive bất kỳ của chủ script.

function prop_(ten) {
  var v = PropertiesService.getScriptProperties().getProperty(ten);
  return v ? String(v).trim() : '';
}

/** Token khớp CONTRACT_TOKEN? Chưa đặt property = khoá cứng (không cho gọi). */
function tokenOk_(token) {
  var mong = prop_('CONTRACT_TOKEN');
  if (!mong) return false;
  var nhan = token ? String(token) : '';
  if (nhan.length !== mong.length) return false;
  // So từng ký tự, không thoát sớm — tránh lộ độ dài prefix đúng qua thời gian phản hồi.
  var lech = 0;
  for (var i = 0; i < mong.length; i++) {
    lech |= mong.charCodeAt(i) ^ nhan.charCodeAt(i);
  }
  return lech === 0;
}

/** Lỗi chung cho mọi trường hợp từ chối — không mô tả thiếu token hay sai token. */
function tuChoi_() {
  return json_({ ok: false, error: 'Không có quyền' });
}

function contractList_(params) {
  try {
    if (!tokenOk_(params && params.token)) return tuChoi_();
    var sheetId = prop_('CONTRACT_SHEET_ID');
    var sheetTab = prop_('CONTRACT_SHEET_TAB');
    if (!sheetId || !sheetTab) {
      return json_({ ok: false, error: 'Chưa đặt Script Property CONTRACT_SHEET_ID / CONTRACT_SHEET_TAB' });
    }
    var ss = SpreadsheetApp.openById(sheetId);
    var sh = ss.getSheetByName(sheetTab);
    if (!sh) return json_({ ok: false, error: 'Không tìm thấy tab "' + sheetTab + '"' });
    var lastRow = Math.max(1, sh.getLastRow());
    var rows = sh.getRange(1, 1, lastRow, 10).getDisplayValues();
    return json_({ ok: true, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Mọi thư mục con từ cấp 1 tới cấp `depth` của folder `rootId`. */
function folderConTheoDoSau_(rootId, depth) {
  var tang = [DriveApp.getFolderById(rootId)];
  var ra = [];
  for (var d = 0; d < Math.max(1, depth); d++) {
    var keTiep = [];
    for (var i = 0; i < tang.length; i++) {
      var it = tang[i].getFolders();
      while (it.hasNext()) {
        var f = it.next();
        ra.push(f);
        keTiep.push(f);
      }
    }
    if (!keTiep.length) break;
    tang = keTiep;
  }
  return ra;
}

function chuanHoaTen_(s) {
  return (s || '')
    .toString()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function contractDriveMatch_(data) {
  try {
    if (!tokenOk_(data && data.token)) return tuChoi_();
    var rootId = prop_('CONTRACT_ROOT_FOLDER_ID');
    if (!rootId) return json_({ ok: false, error: 'Chưa đặt Script Property CONTRACT_ROOT_FOLDER_ID' });
    // depth vẫn nhận từ client nhưng chặn trên 5 tầng: chỉ ảnh hưởng phạm vi quét BÊN TRONG
    // thư mục gốc, không mở rộng ra ngoài.
    var doSau = Math.min(5, Math.max(1, Number(data.depth) || 2));
    var con = folderConTheoDoSau_(rootId, doSau);
    var khoa = chuanHoaTen_(data.ten);
    var khop = con.filter(function (f) {
      return chuanHoaTen_(f.getName()) === khoa;
    });
    if (!khop.length) {
      khop = con.filter(function (f) {
        return chuanHoaTen_(f.getName()).indexOf(khoa) >= 0;
      });
    }
    khop.sort(function (a, b) {
      return b.getLastUpdated() - a.getLastUpdated();
    });
    return json_({
      ok: true,
      ket_qua: khop.map(function (f) {
        return { id: f.getId(), name: f.getName() };
      }),
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Folder tên "T8 26" / "T8 2026" của tháng/năm hiện tại, nằm ngay dưới `rootId`. */
function timFolderThang_(rootId) {
  var now = new Date();
  var thang = now.getMonth() + 1;
  var nam = now.getFullYear();
  var re = /^T0?(\d{1,2})[\s\-\/\._]*?(\d{2}|\d{4})$/i;
  var con = folderConTheoDoSau_(rootId, 1);
  var khop = con.filter(function (f) {
    var m = re.exec(f.getName().trim());
    if (!m) return false;
    var t = Number(m[1]);
    var n = Number(m[2]);
    if (n < 100) n += 2000;
    return t === thang && n === nam;
  });
  khop.sort(function (a, b) {
    return b.getLastUpdated() - a.getLastUpdated();
  });
  return khop.length ? khop[0] : null;
}

function tenKhongTrung_(folder, ten) {
  if (!folder.getFilesByName(ten).hasNext()) return ten;
  var than = ten.replace(/\.docx$/i, '');
  var i = 2;
  while (folder.getFilesByName(than + ' (' + i + ').docx').hasNext()) i++;
  return than + ' (' + i + ').docx';
}

/** `folderId` có nằm trong (hoặc chính là) `rootId` không? Đi ngược lên qua getParents(),
 *  giới hạn 10 tầng + 40 nút để không treo trên cây thư mục lạ. Một thư mục Drive có thể có
 *  NHIỀU cha nên phải duyệt rộng chứ không chỉ cha đầu tiên. */
function laConCuaGoc_(folderId, rootId) {
  if (!folderId || !rootId) return false;
  if (folderId === rootId) return true;
  var hangDoi = [DriveApp.getFolderById(folderId)];
  var daXet = {};
  daXet[folderId] = true;
  var soNut = 0;
  for (var tang = 0; tang < 10 && hangDoi.length; tang++) {
    var keTiep = [];
    for (var i = 0; i < hangDoi.length; i++) {
      var ps = hangDoi[i].getParents();
      while (ps.hasNext()) {
        var p = ps.next();
        var pid = p.getId();
        if (pid === rootId) return true;
        if (daXet[pid]) continue;
        daXet[pid] = true;
        if (++soNut > 40) return false;
        keTiep.push(p);
      }
    }
    hangDoi = keTiep;
  }
  return false;
}

function contractDriveCopy_(data) {
  try {
    if (!tokenOk_(data && data.token)) return tuChoi_();
    var rootId = prop_('CONTRACT_ROOT_FOLDER_ID');
    if (!rootId) return json_({ ok: false, error: 'Chưa đặt Script Property CONTRACT_ROOT_FOLDER_ID' });
    var folder;
    if (data.folderId) {
      // folderId đến từ kết quả contract-drive-match trước đó, nhưng vẫn phải kiểm lại:
      // request là do client gửi nên không được tin, nếu không thì ghi được file (kèm CCCD,
      // số tài khoản) vào bất kỳ thư mục nào mà chủ script có quyền.
      if (!laConCuaGoc_(String(data.folderId), rootId)) {
        return json_({ ok: false, error: 'Thư mục đích không nằm trong thư mục gốc đã cấu hình' });
      }
      folder = DriveApp.getFolderById(data.folderId);
    } else {
      var rootFolder = DriveApp.getFolderById(rootId);
      var thangFolder = timFolderThang_(rootId);
      var cha = thangFolder || rootFolder;
      var hienCo = cha.getFoldersByName(data.ten);
      folder = hienCo.hasNext() ? hienCo.next() : cha.createFolder(data.ten);
    }
    var bytes = Utilities.base64Decode(data.base64);
    var mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    var blob = Utilities.newBlob(bytes, mime, data.filename);
    var tenCuoi = tenKhongTrung_(folder, data.filename);
    var file = folder.createFile(blob).setName(tenCuoi);
    return json_({ ok: true, fileId: file.getId(), name: file.getName(), folderId: folder.getId() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
