/**
 * IELTS Log – Nhật ký chạy chấm bài.
 * Ghi mỗi lần chạy vào sheet "Nhật ký" (tạo nếu chưa có).
 */

var IELTSLog = (function () {
  var LOG_SHEET_NAME = 'Nhật ký';
  var HEADERS = ['Thời gian', 'Sheet', 'Chế độ', 'Số dòng', 'Kỹ năng', 'Thành công', 'Lỗi', 'Ghi chú'];

  /**
   * Lấy hoặc tạo sheet nhật ký.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  function getOrCreateLogSheet(ss) {
    var sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (sheet) return sheet;
    sheet = ss.insertSheet(LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }

  /**
   * Ghi một dòng nhật ký sau mỗi lần chấm.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
   * @param {Object} data
   * @param {string} data.sheetName - Tên sheet vừa chấm
   * @param {string} data.mode - 'all' | 'selection'
   * @param {number} data.totalRows - Tổng số dòng được chọn
   * @param {string} data.skill - WRITING | READING | LISTENING | SPEAKING
   * @param {number} data.graded - Số dòng chấm thành công
   * @param {number} data.errors - Số dòng lỗi
   * @param {string} [data.note] - Ghi chú tùy chọn
   */
  function appendRun(ss, data) {
    try {
      var sheet = getOrCreateLogSheet(ss);
      var lastRow = sheet.getLastRow();
      var nextRow = lastRow + 1;
      var now = new Date();
      var timeStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
      var row = [
        timeStr,
        data.sheetName || '',
        data.mode || '',
        data.totalRows != null ? data.totalRows : 0,
        data.skill || '',
        data.graded != null ? data.graded : 0,
        data.errors != null ? data.errors : 0,
        data.note || ''
      ];
      sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([row]);
      Logger.log('IELTSLog.appendRun: ' + timeStr + ' Sheet=' + data.sheetName + ' ' + data.graded + '/' + data.totalRows);
    } catch (e) {
      Logger.log('IELTSLog.appendRun error: ' + e.toString());
    }
  }

  return {
    appendRun: appendRun,
    getOrCreateLogSheet: getOrCreateLogSheet,
    LOG_SHEET_NAME: LOG_SHEET_NAME
  };
})();
