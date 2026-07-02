/**
 * Media Team — Google Sheets sync webhook.
 *
 * CÁCH CÀI ĐẶT:
 * 1. Mở Google Sheet của bạn → Extensions (Tiện ích mở rộng) → Apps Script
 * 2. Xoá code mặc định, dán toàn bộ file này vào
 * 3. Nhấn Deploy → New deployment → chọn "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Nhấn Deploy, copy "Web app URL"
 * 5. Vào app → Cài đặt → Đồng bộ Google Sheet → dán URL → Lưu
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var totalRows = 0;

    var sheetNames = Object.keys(data.sheets);
    for (var i = 0; i < sheetNames.length; i++) {
      var name = sheetNames[i];
      var block = data.sheets[name];
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      sh.clearContents();
      sh.getRange(1, 1, 1, block.headers.length).setValues([block.headers]);
      if (block.rows.length > 0) {
        sh.getRange(2, 1, block.rows.length, block.headers.length).setValues(block.rows);
      }
      sh.getRange(sh.getLastRow() + 2, 1).setValue('Cập nhật: ' + data.syncedAt);
      totalRows += block.rows.length;
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: totalRows }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
