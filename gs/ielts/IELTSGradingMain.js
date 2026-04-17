/**
 * IELTSGradingMain – Entry point: runIELTSGrading(mode) orchestrates selection, Doc tab, classifier, pipeline.
 */

/**
 * @param {string} mode 'all' | 'selection'
 */
function runIELTSGrading(mode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('[IELTS] runIELTSGrading start mode=' + mode);

  var selection = IELTSSelectionLogic.getSelection(mode);
  if (!selection) {
    Logger.log('[IELTS] runIELTSGrading abort: no selection');
    return;
  }
  Logger.log('[IELTS] selection: sheet=' + selection.sheet.getName() + ' rows=' + selection.rows.length + ' docId=' + (selection.docId || '').substring(0, 12) + '...');

  var docId = selection.docId;
  var sheet = selection.sheet;
  var sheetName = sheet.getName();
  var tabResult = DocsApiService.getTabContentBySheetName(docId, sheetName);
  if (!tabResult || !tabResult.tabContent) {
    if (tabResult && tabResult.error === 'doc_fetch_failed') {
      var code = tabResult.httpCode;
      Logger.log('[IELTS] Doc fetch failed: docId=' + docId + ' HTTP ' + code);
      if (code === 403) {
        ss.toast('Không có quyền đọc Doc (403). Chia sẻ file Handout cho tài khoản đang mở Sheet với quyền "Người xem".', 'Lỗi quyền Doc', 8);
      } else if (code === 404) {
        ss.toast('Doc không tồn tại (404). Kiểm tra link tại ô E2.', 'Lỗi Doc', 6);
      } else {
        ss.toast('Doc không truy cập được (HTTP ' + code + '). Kiểm tra link E2 và quyền chia sẻ.', 'Lỗi Doc', 6);
      }
    } else if (tabResult && tabResult.error === 'tab_not_found') {
      Logger.log('[IELTS] Tab not found: docId=' + docId + ' sheetName=' + sheetName);
      ss.toast('Không tìm thấy Tab tên "' + sheetName + '" trong Handout. Đảm bảo trong Doc có một Tab trùng chính xác tên Sheet.', 'Lỗi Tab', 6);
    } else {
      Logger.log('[IELTS] Doc tab not found: docId=' + docId + ' sheetName=' + sheetName);
      ss.toast('Không tìm thấy Tab trùng tên Sheet trong Handout', 'Lỗi', 5);
    }
    return;
  }
  Logger.log('[IELTS] tab content length=' + (tabResult.tabContent || '').length);

  var tabContent = tabResult.tabContent;
  var classified = IELTSSkillClassifier.classify(tabContent);
  var skill = classified.skill;
  var metadata = classified.metadata || {};
  Logger.log('[IELTS] classified skill=' + skill);

  var graded = IELTSGradingPipeline.run({
    rows: selection.rows,
    sheet: selection.sheet,
    docUrlFromE2: selection.docUrlFromE2,
    tabContent: tabContent,
    skill: skill,
    metadata: metadata
  });

  var totalRows = selection.rows.length;
  var errors = totalRows - graded;
  IELTSLog.appendRun(ss, {
    sheetName: sheetName,
    mode: mode,
    totalRows: totalRows,
    skill: skill,
    graded: graded,
    errors: errors,
    note: errors > 0 ? 'Xem cột F các dòng lỗi' : ''
  });

  Logger.log('[IELTS] runIELTSGrading end: graded=' + graded + '/' + totalRows);
  ss.toast('Đã chấm xong ' + graded + ' / ' + totalRows + ' học sinh', 'Hoàn tất', 3);
  if (graded < totalRows) {
    ss.toast('Một số dòng gặp lỗi, xem cột F', 'Lưu ý', 3);
  }
}
