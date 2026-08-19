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
// GET  ?action=contract-list&sheetId=...&sheetTab=...            -> { ok, rows: [[...], ...] }
// POST {action:'contract-drive-match', ten, rootFolderId, depth}  -> { ok, ket_qua: [{id,name}] }
// POST {action:'contract-drive-copy', filename, base64, folderId?, rootFolderId?, ten?}
//      -> { ok, fileId, name, folderId }
// Đọc sheet CHỈ trả raw rows — việc hiểu cột nào là gì nằm ở client (src/lib/contracts/sheetSync.ts),
// để không lặp logic quick_parse/sheet_sync ở hai ngôn ngữ.

function contractList_(params) {
  try {
    var ss = SpreadsheetApp.openById(params.sheetId);
    var sh = ss.getSheetByName(params.sheetTab);
    if (!sh) return json_({ ok: false, error: 'Không tìm thấy tab "' + params.sheetTab + '"' });
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
    var con = folderConTheoDoSau_(data.rootFolderId, data.depth || 2);
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

function contractDriveCopy_(data) {
  try {
    var folder;
    if (data.folderId) {
      folder = DriveApp.getFolderById(data.folderId);
    } else {
      var rootFolder = DriveApp.getFolderById(data.rootFolderId);
      var thangFolder = timFolderThang_(data.rootFolderId);
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
