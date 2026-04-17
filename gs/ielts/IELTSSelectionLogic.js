/**
 * IELTSSelectionLogic – Resolve selected rows and handout Doc ID from the active sheet.
 */

/**
 * @param {string} mode 'selection' | 'all'
 * @returns {{ rows: number[], sheet: GoogleAppsScript.Spreadsheet.Sheet, docId: string, docUrlFromE2: string } | null}
 */
function getSelection(mode) {
  Logger.log('[IELTS] getSelection mode=' + mode);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var rows = [];
  if (mode === 'selection') {
    var range = sheet.getActiveRange();
    if (!range) {
      Logger.log('[IELTS] getSelection: no active range');
      SpreadsheetApp.getActiveSpreadsheet().toast('Vui lòng chọn dòng cần chấm', 'Chấm bài', 3);
      return null;
    }
    var firstRow = range.getRow();
    var numRows = range.getNumRows();
    for (var r = 0; r < numRows; r++) {
      rows.push(firstRow + r);
    }
  } else {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('[IELTS] getSelection: lastRow < 2');
      return null;
    }
    var data = sheet.getRange(2, 1, lastRow, 5).getValues();
    for (var i = 0; i < data.length; i++) {
      var rowIndex = i + 2;
      if (rowIndex <= 1) continue;
      var colC = data[i][2];
      if (colC === null || colC === undefined || (typeof colC === 'string' && colC.trim() === '')) {
        continue;
      }
      rows.push(rowIndex);
    }
  }
  if (rows.length === 0) {
    Logger.log('[IELTS] getSelection: no rows after filter');
    return null;
  }
  Logger.log('[IELTS] getSelection: rows=' + rows.join(','));
  var e2Value = sheet.getRange('E2').getValue();
  var docId = null;
  if (e2Value) {
    var str = String(e2Value).trim();
    var match = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      docId = match[1];
    } else if (/^[a-zA-Z0-9_-]+$/.test(str) && str.length >= 20) {
      docId = str;
    }
  }
  if (!docId) {
    Logger.log('[IELTS] getSelection: no docId from E2');
    SpreadsheetApp.getActiveSpreadsheet().toast('Không tìm thấy Doc ID (cần link hoặc ID tại ô E2)', 'Lỗi', 5);
    return null;
  }
  if (docId.length < 20) {
    Logger.log('[IELTS] getSelection: docId too short (not a valid Doc ID): ' + docId);
    SpreadsheetApp.getActiveSpreadsheet().toast('Ô E2 cần link Google Doc đầy đủ (vd: https://docs.google.com/document/d/xxx/edit), không dùng tên viết tắt.', 'Lỗi E2', 6);
    return null;
  }
  Logger.log('[IELTS] getSelection: docId=' + docId);
  return {
    rows: rows,
    sheet: sheet,
    docId: docId,
    docUrlFromE2: e2Value ? String(e2Value) : ''
  };
}

var IELTSSelectionLogic = { getSelection: getSelection };
