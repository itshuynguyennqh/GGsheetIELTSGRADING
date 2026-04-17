/**
 * DocsApiService – Fetch Google Doc with tabs and extract tab content by sheet name.
 */

/**
 * Nếu textRun có màu chữ khác đen (vd học sinh tô đỏ để chọn đáp án), trả về tiền tố để Gemini vẫn chấm được khi chỉ dùng text (không qua PDF).
 * Google Docs API: textRun.textStyle.foregroundColor.color.rgbColor { red, green, blue } 0..1
 * @param {Object} textRun Docs API textRun
 * @returns {string} tiền tố rỗng hoặc "[HS_CHỌN: ...] "
 */
function _selectionHintFromTextRun(textRun) {
  if (!textRun || !textRun.textStyle) return '';
  var fg = textRun.textStyle.foregroundColor;
  if (!fg || !fg.color || !fg.color.rgbColor) return '';
  var rgb = fg.color.rgbColor;
  var r = rgb.red != null ? Number(rgb.red) : 0;
  var g = rgb.green != null ? Number(rgb.green) : 0;
  var b = rgb.blue != null ? Number(rgb.blue) : 0;
  // Mặc định / đen gần (0,0,0)
  if (r <= 0.14 && g <= 0.14 && b <= 0.14) return '';
  // Đỏ rõ (pattern hay gặp: chỉ đổi màu chữ đáp án)
  if (r > g + 0.22 && r > b + 0.22 && r > 0.35) return '[HS_CHỌN: chữ đỏ] ';
  // Xanh / cam / tím… (bất kỳ màu nổi khác đen)
  var maxc = Math.max(r, g, b);
  var minc = Math.min(r, g, b);
  if (maxc - minc > 0.2 && maxc > 0.25) return '[HS_CHỌN: chữ màu] ';
  return '';
}

/**
 * Extracts plain text from body.content (array of StructuralElements).
 * Handles PARAGRAPH (elements[].textRun.content) and TABLE (tableRows[].tableCells[].content).
 * Giữ màu chữ dưới dạng tiền tố [HS_CHỌN: ...] để chấm trắc nghiệm khi HS chỉ đổi màu lựa chọn (không gõ đáp án).
 * @param {Array<Object>} content body.content from Docs API
 * @returns {string}
 */
function _extractTextFromBodyContent(content) {
  if (!content || !content.length) return '';
  var parts = [];
  for (var i = 0; i < content.length; i++) {
    var el = content[i];
    if (el.paragraph) {
      var elements = el.paragraph.elements;
      if (elements) {
        for (var j = 0; j < elements.length; j++) {
          var run = elements[j].textRun;
          if (run && run.content) {
            parts.push(_selectionHintFromTextRun(run) + run.content);
          }
        }
      }
    } else if (el.table) {
      var rows = el.table.tableRows;
      if (rows) {
        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r].tableCells;
          if (cells) {
            for (var c = 0; c < cells.length; c++) {
              var cellContent = cells[c].content;
              if (cellContent && cellContent.length) {
                parts.push(_extractTextFromBodyContent(cellContent));
              }
            }
          }
        }
      }
    }
  }
  return parts.join('');
}

/**
 * Finds a tab (or nested tab) whose title matches sheetName. Checks childTabs recursively.
 * @param {Array<Object>} tabs response.tabs or tab.childTabs
 * @param {string} sheetName Tab title to match (e.g. sheet name from spreadsheet).
 * @returns {{ tabContent: string, tabId: string } | null}
 */
function _findTabByTitle(tabs, sheetName) {
  if (!tabs || !tabs.length) return null;
  for (var t = 0; t < tabs.length; t++) {
    var tab = tabs[t];
    var props = tab.tabProperties || tab.tab_properties;
    var title = props ? (props.title || '') : '';
    var tabIdVal = (props ? (props.tabId || props.tab_id) : null) || tab.tabId || tab.tab_id || '';
    if (title === sheetName) {
      var docTab = tab.documentTab || tab.document_tab;
      if (!docTab) return null;
      var body = docTab.body;
      var content = body && body.content ? body.content : [];
      var tabContent = _extractTextFromBodyContent(content);
      return { tabContent: tabContent, tabId: tabIdVal };
    }
    var childTabs = tab.childTabs || tab.child_tabs;
    if (childTabs && childTabs.length) {
      var found = _findTabByTitle(childTabs, sheetName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Finds a tab (or nested tab) by tabId (e.g. "t.93l09hnwddxs"). Checks childTabs recursively.
 * @param {Array<Object>} tabs response.tabs or tab.childTabs
 * @param {string} tabId Tab ID from URL query (?tab=t.xxxx)
 * @returns {{ tabContent: string, tabId: string } | null}
 */
function _findTabById(tabs, tabId) {
  if (!tabs || !tabs.length || !tabId) return null;
  for (var t = 0; t < tabs.length; t++) {
    var tab = tabs[t];
    var props = tab.tabProperties || tab.tab_properties;
    var id = (props ? (props.tabId || props.tab_id) : null) || tab.tabId || tab.tab_id || '';
    if (id && id === tabId) {
      var docTab = tab.documentTab || tab.document_tab;
      if (!docTab) return null;
      var body = docTab.body;
      var content = body && body.content ? body.content : [];
      var tabContent = _extractTextFromBodyContent(content);
      return { tabContent: tabContent, tabId: id };
    }
    var childTabs = tab.childTabs || tab.child_tabs;
    if (childTabs && childTabs.length) {
      var found = _findTabById(childTabs, tabId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Extract tabId from a Google Doc URL that includes ?tab=t.xxxx
 * @param {string} url Full Google Doc URL
 * @returns {string|null}
 */
function getTabIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  var m = url.match(/[?&]tab=(t\.[a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Fetches a Google Doc (no tabs) and returns full body text. Use for submission links (column C).
 * @param {string} docId Google Doc ID (from URL or plain ID).
 * @returns {string|null} Plain text of document body, or null on failure.
 */
function getDocText(docId) {
  if (!docId) return null;
  var url = 'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId);
  var options = {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  try {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Logger.log('[IELTS] getDocText docId=' + docId.substring(0, 12) + '... HTTP ' + response.getResponseCode());
      // Fallback sang DocumentApp nếu Docs API lỗi (vd: file không hỗ trợ Docs API nhưng DocumentApp đọc được)
      try {
        var doc = DocumentApp.openById(docId);
        var body = doc.getBody();
        return body ? body.getText() : null;
      } catch (e2) {
        Logger.log('[IELTS] getDocText fallback error: ' + e2.toString());
        return null;
      }
    }
    var json = JSON.parse(response.getContentText());
    var body = json.body;
    var content = body && body.content ? body.content : [];
    var text = _extractTextFromBodyContent(content);
    Logger.log('[IELTS] getDocText docId=' + docId.substring(0, 12) + '... len=' + (text ? text.length : 0));
    return text;
  } catch (e) {
    Logger.log('[IELTS] getDocText error: ' + e.toString());
    return null;
  }
}

/**
 * Fetches document with includeTabsContent=true and returns the tab whose title matches sheetName.
 * @param {string} docId Google Doc ID (from URL or plain ID).
 * @param {string} sheetName Tab title to match (e.g. active sheet name).
 * @returns {{ tabContent: string, tabId: string } | null}
 */
function getTabContentBySheetName(docId, sheetName) {
  var url = 'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + '?includeTabsContent=true';
  var options = {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code !== 200) {
    Logger.log('[IELTS] getTabContentBySheetName docId=' + docId.substring(0, 12) + '... HTTP ' + code);
    return { tabContent: null, tabId: null, error: 'doc_fetch_failed', httpCode: code };
  }
  var json = JSON.parse(response.getContentText());
  var tabs = json.tabs;
  var result = _findTabByTitle(tabs || [], sheetName);
  Logger.log('[IELTS] getTabContentBySheetName docId=' + docId.substring(0, 12) + '... sheetName=' + sheetName + ' found=' + !!result);
  if (!result) {
    return { tabContent: null, tabId: null, error: 'tab_not_found', sheetName: sheetName };
  }
  return result;
}

/**
 * Fetches document with includeTabsContent=true and returns the tab whose tabId matches.
 * @param {string} docId Google Doc ID (from URL or plain ID).
 * @param {string} tabId tab ID in URL query (?tab=t.xxxx)
 * @returns {{ tabContent: string, tabId: string } | { tabContent: null, tabId: null, error: string, httpCode?: number}}
 */
function getTabContentByTabId(docId, tabId) {
  if (!docId || !tabId) return { tabContent: null, tabId: null, error: 'missing_params' };
  var url = 'https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + '?includeTabsContent=true';
  var options = {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code !== 200) {
    Logger.log('[IELTS] getTabContentByTabId docId=' + docId.substring(0, 12) + '... HTTP ' + code);
    return { tabContent: null, tabId: null, error: 'doc_fetch_failed', httpCode: code };
  }
  var json = JSON.parse(response.getContentText());
  var tabs = json.tabs;
  var result = _findTabById(tabs || [], tabId);
  Logger.log('[IELTS] getTabContentByTabId docId=' + docId.substring(0, 12) + '... tabId=' + tabId + ' found=' + !!result);
  if (!result) {
    var availableIds = _listTabIdsForLog(tabs || []);
    Logger.log('[IELTS] getTabContentByTabId tab_not_found. Các tabId có trong Doc: ' + availableIds.join(', '));
    return { tabContent: null, tabId: null, error: 'tab_not_found', tabIdQuery: tabId };
  }
  return result;
}

function _listTabIdsForLog(tabs) {
  var out = [];
  if (!tabs || !tabs.length) return out;
  for (var t = 0; t < tabs.length; t++) {
    var tab = tabs[t];
    var props = tab.tabProperties || tab.tab_properties;
    var id = (props ? (props.tabId || props.tab_id) : null) || tab.tabId || tab.tab_id || '';
    if (id) out.push(id);
    var childTabs = tab.childTabs || tab.child_tabs;
    if (childTabs && childTabs.length) {
      out = out.concat(_listTabIdsForLog(childTabs));
    }
  }
  return out;
}

/**
 * Xuất Google Doc native sang PDF (Drive) để Gemini đọc dạng hình – giữ highlight, layout.
 * Lưu ý: PDF thường là toàn bộ tài liệu; Doc nhiều tab có thể gộp chung trong một file export.
 * @param {string} docId File ID Google Doc
 * @returns {GoogleAppsScript.Base.Blob|null}
 */
function getGoogleDocAsPdfBlob(docId) {
  if (!docId) return null;
  try {
    var file = DriveApp.getFileById(docId);
    var mime = file.getMimeType();
    if (mime !== MimeType.GOOGLE_DOCS && mime !== 'application/vnd.google-apps.document') {
      Logger.log('[IELTS] getGoogleDocAsPdfBlob: not a Google Doc mime=' + mime);
      return null;
    }
    var pdfBlob = file.getAs(MimeType.PDF);
    Logger.log('[IELTS] getGoogleDocAsPdfBlob docId=' + docId.substring(0, 12) + '... pdfBytes=' + (pdfBlob ? pdfBlob.getBytes().length : 0));
    return pdfBlob;
  } catch (e) {
    Logger.log('[IELTS] getGoogleDocAsPdfBlob error: ' + e.toString());
    return null;
  }
}

/**
 * @param {string} mime
 * @returns {boolean}
 */
function isOdtMimeType(mime) {
  if (!mime || typeof mime !== 'string') return false;
  var m = mime.toLowerCase();
  return m === 'application/vnd.oasis.opendocument.text' ||
    m === 'application/x-vnd.oasis.opendocument.text';
}

/**
 * File ODT trên Drive: import tạm thành Google Doc (Drive API), xuất PDF, xóa file tạm.
 * Dùng cho Chấm đơn giản – Gemini đọc PDF (giữ layout/highlight tốt hơn text thuần).
 * @param {string} fileId Drive file ID
 * @returns {GoogleAppsScript.Base.Blob|null}
 */
function getOdtAsPdfBlobFromDriveFileId(fileId) {
  if (!fileId) return null;
  var tmpId = null;
  try {
    var file = DriveApp.getFileById(fileId);
    if (!isOdtMimeType(file.getMimeType())) {
      Logger.log('[IELTS] getOdtAsPdfBlobFromDriveFileId: không phải ODT mime=' + file.getMimeType());
      return null;
    }
    var blob = file.getBlob();
    var tmp = Drive.Files.insert({ title: 'Temp_ODT', mimeType: MimeType.GOOGLE_DOCS }, blob);
    tmpId = tmp.id;
    var pdfBlob = DriveApp.getFileById(tmpId).getAs(MimeType.PDF);
    Logger.log('[IELTS] getOdtAsPdfBlobFromDriveFileId ok pdfBytes=' + (pdfBlob ? pdfBlob.getBytes().length : 0));
    return pdfBlob;
  } catch (e) {
    Logger.log('[IELTS] getOdtAsPdfBlobFromDriveFileId error: ' + e.toString());
    return null;
  } finally {
    if (tmpId) {
      try {
        Drive.Files.remove(tmpId);
      } catch (eRm) {
        Logger.log('[IELTS] getOdtAsPdfBlobFromDriveFileId remove temp: ' + eRm.toString());
      }
    }
  }
}

var DocsApiService = {
  getDocText: getDocText,
  getTabContentBySheetName: getTabContentBySheetName,
  getTabIdFromUrl: getTabIdFromUrl,
  getTabContentByTabId: getTabContentByTabId,
  getGoogleDocAsPdfBlob: getGoogleDocAsPdfBlob,
  isOdtMimeType: isOdtMimeType,
  getOdtAsPdfBlobFromDriveFileId: getOdtAsPdfBlobFromDriveFileId
};
