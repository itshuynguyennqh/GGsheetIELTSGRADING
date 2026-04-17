/**
 * Module chấm đơn giản: nội dung → Gemini → cột F.
 * Không phụ thuộc Doc/Sheet/folder, chỉ cần chuỗi nội dung.
 */

var IELTSSimpleGrade = (function () {
  var CACHE_KEY = 'IELTSSimpleGrade_lastCall';
  var THROTTLE_MS = 4000;

  function _throttle() {
    var cache = CacheService.getScriptCache();
    var last = cache.get(CACHE_KEY);
    if (last) {
      var elapsed = Date.now() - parseInt(last, 10);
      if (elapsed < THROTTLE_MS) Utilities.sleep(THROTTLE_MS - elapsed);
    }
    cache.put(CACHE_KEY, String(Date.now()), 60);
  }

  /**
   * Gửi nội dung cho Gemini chấm và trả về feedback.
   * @param {string} content - Nội dung cần chấm
   * @param {string} [promptContext] - Gợi ý đề bài / rubric (tùy chọn)
   * @param {string} [skill] - WRITING | READING | LISTENING | SPEAKING (tùy chọn, mặc định WRITING)
   * @returns {string} Kết quả chấm (Band + nhận xét)
   */
  function grade(content, promptContext, skill) {
    skill = (skill || 'WRITING').toUpperCase();
    var fullPrompt = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getGradingWritingPrompt
      ? ConfigPrompts.getGradingWritingPrompt(content || '', promptContext)
      : 'Chấm bài BTVN IELTS. Viết nhận xét theo đúng định dạng sau (chỉ trả về nhận xét, không thêm giải thích):\n\nBài làm:\n' + (content || '');
    _throttle();
    return GeminiService.callGemini(fullPrompt);
  }

  function _logPartsForGemini(parts) {
    var maxLog = 5000;
    parts.forEach(function (p, i) {
      if (p.text) {
        var t = p.text.length > maxLog ? p.text.substring(0, maxLog) + '\n...[truncated ' + (p.text.length - maxLog) + ' chars]' : p.text;
        Logger.log('[Gemini] parts[' + i + '] text (len=' + p.text.length + '):\n' + t);
      } else if (p.inlineData) {
        Logger.log('[Gemini] parts[' + i + '] inlineData: mimeType=' + (p.inlineData.mimeType || '') + ', dataLen=' + (p.inlineData.data ? p.inlineData.data.length : 0));
      }
    });
  }

  function _callGeminiMultimodal(parts) {
    _throttle();
    Logger.log('[Gemini] multimodal parts count=' + (parts ? parts.length : 0));
    _logPartsForGemini(parts || []);
    var model = Config && Config.getGeminiModel ? Config.getGeminiModel('default') : 'gemini-3.1-flash-lite-preview';
    var apiKey = Config && Config.getGeminiApiKey ? Config.getGeminiApiKey() : '';
    if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình');
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
    var payload = {
      contents: [{ role: 'user', parts: parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    };
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code !== 200) throw new Error('Gemini API ' + code + ': ' + body);
    var data = JSON.parse(body);
    var textPart = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) ? data.candidates[0].content.parts[0] : null;
    return (textPart && textPart.text) ? textPart.text.trim() : '';
  }

  /**
   * Chấm file (PDF/ảnh) gửi trực tiếp lên Gemini và ghi cột F.
   */
  function _logPdfDebugSimpleGrade(row, blobResult) {
    var pdfN = 0;
    var imgN = 0;
    (blobResult.blobs || []).forEach(function (b) {
      var m = String(b.mimeType || '').toLowerCase();
      if (m.indexOf('pdf') !== -1) pdfN++;
      else if (m.indexOf('image/') === 0) imgN++;
    });
    var msg = pdfN > 0
      ? 'CÓ (' + pdfN + ' file PDF' + (imgN ? ', ' + imgN + ' ảnh kèm' : '') + ')'
      : 'KHÔNG (chỉ ảnh/multimodal, ' + imgN + ' ảnh — không có PDF)';
    Logger.log('[SimpleGrade][PDF debug] row ' + row + ' chuyển PDF để chấm: ' + msg);
  }

  function gradeWithBlobsAndWrite(blobResult, row, sheet, tabContext) {
    sheet = sheet || SpreadsheetApp.getActiveSheet();
    sheet.getRange(row, 6).setValue('Đang chấm...').setBackground('#fff3cd');
    _logPdfDebugSimpleGrade(row, blobResult);
    try {
      var parts = [];
      blobResult.blobs.forEach(function (b) {
        parts.push({ inlineData: { mimeType: b.mimeType, data: Utilities.base64Encode(b.blob.getBytes()) } });
      });
      var ctx = (tabContext || '') + (blobResult.textParts && blobResult.textParts.length ? '\n\n' + blobResult.textParts.join('\n\n') : '');
      var prompt = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getGradingWritingMultimodalPrompt
        ? ConfigPrompts.getGradingWritingMultimodalPrompt(ctx)
        : 'Chấm bài BTVN IELTS. Viết nhận xét theo đúng format (chỉ trả về nhận xét):\n\n' + (ctx ? 'Đề bài tham khảo:\n' + ctx : '');
      parts.push({ text: prompt });
      var feedback = _callGeminiMultimodal(parts);
      sheet.getRange(row, 6).setValue(feedback || 'Chưa chấm được').setBackground(null);
    } catch (e) {
      sheet.getRange(row, 6).setValue('Lỗi: ' + (e.message || String(e)).substring(0, 80)).setBackground(null);
      throw e;
    }
  }

  /**
   * Chấm và ghi kết quả vào cột F.
   * @param {string} content - Nội dung cần chấm
   * @param {number} row - Dòng cần ghi (cột F)
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet đích (mặc định active sheet)
   * @param {string} [promptContext] - Gợi ý đề (tùy chọn)
   * @param {string} [skill] - WRITING | READING | LISTENING | SPEAKING
   */
  function gradeAndWrite(content, row, sheet, promptContext, skill) {
    sheet = sheet || SpreadsheetApp.getActiveSheet();
    sheet.getRange(row, 6).setValue('Đang chấm...').setBackground('#fff3cd');
    try {
      var feedback = grade(content, promptContext, skill);
      sheet.getRange(row, 6).setValue(feedback || 'Chưa chấm được').setBackground(null);
    } catch (e) {
      sheet.getRange(row, 6).setValue('Lỗi: ' + (e.message || String(e)).substring(0, 80)).setBackground(null);
      throw e;
    }
  }

  function _forcePdfForGoogleDocUrl(url) {
    if (typeof Config !== 'undefined' && Config.submissionUrlHasGradeAsPdf && Config.submissionUrlHasGradeAsPdf(url)) return true;
    if (typeof Config !== 'undefined' && Config.getGradeGoogleDocAsPdfMode && Config.getGradeGoogleDocAsPdfMode() === 'always') return true;
    return false;
  }

  function _autoPdfFallbackForGoogleDoc() {
    return typeof Config !== 'undefined' && Config.getGradeGoogleDocAsPdfMode && Config.getGradeGoogleDocAsPdfMode() === 'auto';
  }

  function _tryGoogleDocPdfBlobs(id) {
    if (!id || typeof DocsApiService === 'undefined' || !DocsApiService.getGoogleDocAsPdfBlob) return null;
    var pdfBlob = DocsApiService.getGoogleDocAsPdfBlob(id);
    if (!pdfBlob) return null;
    return { _blobs: true, blobs: [{ blob: pdfBlob, mimeType: MimeType.PDF }], textParts: [] };
  }

  /**
   * Lấy nội dung từ link bài nộp (Doc, Sheet, hoặc thư mục Drive).
   */
  function _getContentFromUrl(url) {
    Logger.log('[SimpleGrade] _getContentFromUrl start url=' + (url ? url.substring(0, 80) : 'null') + '...');
    if (!url || typeof url !== 'string') {
      Logger.log('[SimpleGrade] _getContentFromUrl: url empty or not string');
      return null;
    }
    var m = url.match(/\/(?:d|folders)\/([a-zA-Z0-9_-]+)/);
    var id = m ? m[1] : null;
    if (!id) {
      Logger.log('[SimpleGrade] _getContentFromUrl: no id extracted from url');
      return null;
    }
    var isFolder = url.indexOf('/folders/') !== -1;
    var isSheet = url.indexOf('spreadsheets') !== -1;
    var isDoc = url.indexOf('document') !== -1;
    Logger.log('[SimpleGrade] _getContentFromUrl: id=' + id + ' isFolder=' + isFolder + ' isSheet=' + isSheet + ' isDoc=' + isDoc);

    if (isFolder) {
      Logger.log('[SimpleGrade] _getContentFromUrl: branch FOLDER');
      var fileList = [];
      try {
        var pageToken = null;
        do {
          var listOpts = { q: "'" + id + "' in parents and trashed=false", maxResults: 100 };
          if (pageToken) listOpts.pageToken = pageToken;
          var resp = Drive.Files.list(listOpts);
          fileList = fileList.concat(resp.items || []);
          pageToken = resp.nextPageToken || null;
        } while (pageToken);
        Logger.log('[SimpleGrade] Drive.Files.list ok, files=' + fileList.length);
      } catch (e) {
        Logger.log('[SimpleGrade] Drive.Files.list error: ' + e.toString());
        for (var attempt = 1; attempt <= 2; attempt++) {
          try {
            var folder = DriveApp.getFolderById(id);
            var files = folder.getFiles();
            while (files.hasNext()) {
              var f = files.next();
              fileList.push({ id: f.getId(), mimeType: f.getMimeType(), title: f.getName() });
            }
            break;
          } catch (e2) {
            Logger.log('[SimpleGrade] DriveApp fallback attempt ' + attempt + ': ' + e2.toString());
            if (attempt < 2) Utilities.sleep(3000);
          }
        }
        if (fileList.length === 0) return null;
      }
      var textParts = [];
      var blobParts = [];
      for (var fi = 0; fi < fileList.length; fi++) {
        var fileItem = fileList[fi];
        var fileId = fileItem.id;
        var mt = fileItem.mimeType || '';
        var fName = fileItem.title || ('file ' + (fi + 1));
        Logger.log('[SimpleGrade] file ' + (fi + 1) + ': ' + fName + ' mime=' + mt);
        try {
          if (mt === MimeType.GOOGLE_DOCS || mt === 'application/vnd.google-apps.document') {
            if (_forcePdfForGoogleDocUrl(url)) {
              var pdfB = typeof DocsApiService !== 'undefined' && DocsApiService.getGoogleDocAsPdfBlob ? DocsApiService.getGoogleDocAsPdfBlob(fileId) : null;
              if (pdfB) {
                blobParts.push({ blob: pdfB, mimeType: MimeType.PDF });
                Logger.log('[SimpleGrade] file ' + (fi + 1) + ' Google Doc -> PDF (force)');
              } else {
                var docTextF = DocumentApp.openById(fileId).getBody().getText();
                textParts.push(docTextF);
                Logger.log('[SimpleGrade] file ' + (fi + 1) + ' Doc len=' + (docTextF ? docTextF.length : 0));
              }
            } else {
              var docText = DocumentApp.openById(fileId).getBody().getText();
              if (_autoPdfFallbackForGoogleDoc() && (!docText || !String(docText).trim())) {
                var pdfAuto = typeof DocsApiService !== 'undefined' && DocsApiService.getGoogleDocAsPdfBlob ? DocsApiService.getGoogleDocAsPdfBlob(fileId) : null;
                if (pdfAuto) {
                  blobParts.push({ blob: pdfAuto, mimeType: MimeType.PDF });
                  Logger.log('[SimpleGrade] file ' + (fi + 1) + ' Google Doc -> PDF (auto, text rỗng)');
                } else if (docText) {
                  textParts.push(docText);
                }
              } else {
                textParts.push(docText);
                Logger.log('[SimpleGrade] file ' + (fi + 1) + ' Doc len=' + (docText ? docText.length : 0));
              }
            }
          } else if (mt === MimeType.PLAIN_TEXT || mt === MimeType.CSV) {
            var txt = DriveApp.getFileById(fileId).getBlob().getDataAsString();
            textParts.push(txt);
            Logger.log('[SimpleGrade] file ' + (fi + 1) + ' text len=' + txt.length);
          } else if (mt === MimeType.PDF || mt.indexOf('image/') === 0) {
            Logger.log('[SimpleGrade] file ' + (fi + 1) + ' gửi trực tiếp lên Gemini');
            blobParts.push({ blob: DriveApp.getFileById(fileId).getBlob(), mimeType: mt });
          } else if (typeof DocsApiService !== 'undefined' && DocsApiService.isOdtMimeType && DocsApiService.isOdtMimeType(mt)) {
            Logger.log('[SimpleGrade] file ' + (fi + 1) + ' ODT -> PDF (qua Doc tạm)');
            var odtPdf = DocsApiService.getOdtAsPdfBlobFromDriveFileId ? DocsApiService.getOdtAsPdfBlobFromDriveFileId(fileId) : null;
            if (odtPdf) {
              blobParts.push({ blob: odtPdf, mimeType: MimeType.PDF });
            } else {
              Logger.log('[SimpleGrade] file ' + (fi + 1) + ' ODT PDF lỗi, thử text');
              try {
                var blobOdt = DriveApp.getFileById(fileId).getBlob();
                var tmpOdt = Drive.Files.insert({ title: 'Temp_ODT', mimeType: MimeType.GOOGLE_DOCS }, blobOdt);
                var odtText = DocumentApp.openById(tmpOdt.id).getBody().getText();
                Drive.Files.remove(tmpOdt.id);
                textParts.push(odtText);
                Logger.log('[SimpleGrade] file ' + (fi + 1) + ' ODT text len=' + (odtText ? odtText.length : 0));
              } catch (eOdt) {
                Logger.log('[SimpleGrade] file ' + (fi + 1) + ' ODT text error: ' + eOdt.toString());
              }
            }
          } else if (mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mt === 'application/msword') {
            Logger.log('[SimpleGrade] file ' + (fi + 1) + ' docx: convert sang Doc tạm...');
            var blobDocx = DriveApp.getFileById(fileId).getBlob();
            var tmpDoc = Drive.Files.insert({ title: 'Temp', mimeType: MimeType.GOOGLE_DOCS }, blobDocx);
            var docxText = DocumentApp.openById(tmpDoc.id).getBody().getText();
            Drive.Files.remove(tmpDoc.id);
            textParts.push(docxText);
            Logger.log('[SimpleGrade] file ' + (fi + 1) + ' docx len=' + (docxText ? docxText.length : 0));
          } else {
            Logger.log('[SimpleGrade] file ' + (fi + 1) + ' unsupported mime, skip');
          }
        } catch (eFile) {
          Logger.log('[SimpleGrade] file ' + (fi + 1) + ' error: ' + eFile.toString());
        }
      }
      Logger.log('[SimpleGrade] folder: textParts=' + textParts.length + ' blobParts=' + blobParts.length);
      if (blobParts.length > 0) return { _blobs: true, blobs: blobParts, textParts: textParts };
      return textParts.length ? textParts.join('\n\n') : null;
    }
    if (isSheet) {
      Logger.log('[SimpleGrade] _getContentFromUrl: branch SHEET');
      try {
        var ss = SpreadsheetApp.openByUrl(url);
        var sh = ss.getSheets()[0];
        if (!sh) {
          Logger.log('[SimpleGrade] sheet: no first sheet');
          return null;
        }
        var sheetText = sh.getDataRange().getValues().map(function (r) { return (r[0] != null ? String(r[0]) : ''); }).filter(Boolean).join('\n');
        Logger.log('[SimpleGrade] sheet len=' + sheetText.length);
        return sheetText;
      } catch (e) {
        Logger.log('[SimpleGrade] sheet error: ' + e.toString());
        return null;
      }
    }
    Logger.log('[SimpleGrade] _getContentFromUrl: branch DOC');
    // Bắt buộc chấm bằng PDF (highlight/layout) – Script Property GRADE_GOOGLE_DOC_AS_PDF=always hoặc &gradeAsPdf=1
    if (_forcePdfForGoogleDocUrl(url)) {
      var forced = _tryGoogleDocPdfBlobs(id);
      if (forced) {
        Logger.log('[SimpleGrade] Google Doc link -> PDF (force) cho Gemini');
        return forced;
      }
      Logger.log('[SimpleGrade] Xuất PDF bắt buộc thất bại, thử đọc text');
    }
    var docTextResult = null;
    // Nếu URL có query tab=t.xxx thì ưu tiên lấy nội dung theo tabId (Doc tabs)
    try {
      if (typeof DocsApiService !== 'undefined' && DocsApiService && DocsApiService.getTabIdFromUrl && DocsApiService.getTabContentByTabId) {
        var tabId = DocsApiService.getTabIdFromUrl(url);
        if (tabId) {
          Logger.log('[SimpleGrade] DOC has tabId=' + tabId + ' -> read tab content');
          var tabRes = DocsApiService.getTabContentByTabId(id, tabId);
          if (tabRes && tabRes.tabContent) {
            Logger.log('[SimpleGrade] getTabContentByTabId len=' + tabRes.tabContent.length);
            docTextResult = tabRes.tabContent;
          } else {
            Logger.log('[SimpleGrade] getTabContentByTabId returned null, fallback to full doc');
          }
        }
      }
    } catch (eTab) {
      Logger.log('[SimpleGrade] getTabContentByTabId error: ' + eTab.toString());
    }
    if (docTextResult == null && typeof DocsApiService !== 'undefined' && DocsApiService && DocsApiService.getDocText) {
      var t = DocsApiService.getDocText(id);
      if (t) {
        Logger.log('[SimpleGrade] DocsApiService.getDocText len=' + t.length);
        docTextResult = t;
      } else {
        Logger.log('[SimpleGrade] DocsApiService.getDocText returned null');
      }
    }
    if (docTextResult == null) {
      try {
        var docBody = DocumentApp.openById(id).getBody().getText();
        Logger.log('[SimpleGrade] DocumentApp len=' + docBody.length);
        docTextResult = docBody;
      } catch (e) {
        Logger.log('[SimpleGrade] DocumentApp error: ' + e.toString());
        try {
          var file = DriveApp.getFileById(id);
          var mime = file.getMimeType();
          Logger.log('[SimpleGrade] DriveApp file mime=' + mime);
          if (mime === MimeType.PLAIN_TEXT || mime === MimeType.CSV) {
            var txt2 = file.getBlob().getDataAsString();
            Logger.log('[SimpleGrade] plain text len=' + txt2.length);
            return txt2;
          }
          if (mime === MimeType.PDF || mime.indexOf('image/') === 0) {
            Logger.log('[SimpleGrade] Drive: gửi file trực tiếp lên Gemini');
            return { _blobs: true, blobs: [{ blob: file.getBlob(), mimeType: mime }], textParts: [] };
          }
          if (typeof DocsApiService !== 'undefined' && DocsApiService.isOdtMimeType && DocsApiService.isOdtMimeType(mime)) {
            Logger.log('[SimpleGrade] Drive: ODT -> PDF cho Gemini');
            var odtPdfSingle = DocsApiService.getOdtAsPdfBlobFromDriveFileId ? DocsApiService.getOdtAsPdfBlobFromDriveFileId(id) : null;
            if (odtPdfSingle) {
              return { _blobs: true, blobs: [{ blob: odtPdfSingle, mimeType: MimeType.PDF }], textParts: [] };
            }
            Logger.log('[SimpleGrade] ODT PDF thất bại, thử text qua Doc tạm');
            try {
              var tmpOdt2 = Drive.Files.insert({ title: 'Temp_ODT', mimeType: MimeType.GOOGLE_DOCS }, file.getBlob());
              var odtOut = DocumentApp.openById(tmpOdt2.id).getBody().getText();
              Drive.Files.remove(tmpOdt2.id);
              return odtOut;
            } catch (eOdt2) {
              Logger.log('[SimpleGrade] ODT text fallback error: ' + eOdt2.toString());
            }
          }
          if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword') {
            Logger.log('[SimpleGrade] Drive: docx convert sang Doc tạm...');
            var tmpDocx = Drive.Files.insert({ title: 'Temp', mimeType: MimeType.GOOGLE_DOCS }, file.getBlob());
            var docxOut = DocumentApp.openById(tmpDocx.id).getBody().getText();
            Drive.Files.remove(tmpDocx.id);
            return docxOut;
          }
          if (mime === MimeType.GOOGLE_DOCS || mime === 'application/vnd.google-apps.document') {
            docTextResult = DocumentApp.openById(id).getBody().getText();
          }
        } catch (e2) {
          Logger.log('[SimpleGrade] DriveApp fallback error: ' + e2.toString());
        }
      }
    }
    if (_autoPdfFallbackForGoogleDoc() && (!docTextResult || !String(docTextResult).trim())) {
      var autoPdf = _tryGoogleDocPdfBlobs(id);
      if (autoPdf) {
        Logger.log('[SimpleGrade] Google Doc -> PDF (auto: không có text)');
        return autoPdf;
      }
    }
    if (docTextResult != null) return docTextResult;
    Logger.log('[SimpleGrade] _getContentFromUrl: all branches failed, return null');
    return null;
  }

  /**
   * Chạy chấm đơn giản từ menu: lấy dòng đã chọn, link C, lấy nội dung → Gemini → cột F.
   */
  function runFromMenu() {
    Logger.log('[SimpleGrade] runFromMenu start');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var range = sheet.getActiveRange();
    if (!range) {
      Logger.log('[SimpleGrade] runFromMenu: no selection');
      ss.toast('Vui lòng chọn ít nhất một dòng cần chấm', 'Chấm đơn giản', 4);
      return;
    }
    var firstRow = range.getRow();
    var numRows = range.getNumRows();
    Logger.log('[SimpleGrade] runFromMenu: rows ' + firstRow + ' to ' + (firstRow + numRows - 1));
    var tabContext = '';
    try {
      var e2 = sheet.getRange('E2').getValue();
      if (e2) {
        var e2Str = String(e2).trim();
        if (e2Str.indexOf('docs.google.com/document') !== -1) {
          var docId = e2Str.match(/\/(?:d|folders)\/([a-zA-Z0-9_-]+)/);
          if (docId && typeof DocsApiService !== 'undefined' && DocsApiService) {
            var e2DocId = docId[1];
            // 1) Link E2 có ?tab=t.xxx → đọc đúng tab đó (chấm theo tab)
            var e2TabId = DocsApiService.getTabIdFromUrl ? DocsApiService.getTabIdFromUrl(e2Str) : null;
            if (e2TabId && DocsApiService.getTabContentByTabId) {
              var e2TabRes = DocsApiService.getTabContentByTabId(e2DocId, e2TabId);
              if (e2TabRes && e2TabRes.tabContent) {
                tabContext = e2TabRes.tabContent;
                Logger.log('[SimpleGrade] E2: dùng tabId=' + e2TabId + ' len=' + tabContext.length);
              }
            }
            // 2) Chưa có nội dung → tab trùng tên sheet
            if (!tabContext && DocsApiService.getTabContentBySheetName) {
              var tab = DocsApiService.getTabContentBySheetName(e2DocId, sheet.getName());
              if (tab && tab.tabContent) tabContext = tab.tabContent;
            }
            // 3) Fallback: toàn bộ doc
            if (!tabContext && DocsApiService.getDocText) {
              tabContext = DocsApiService.getDocText(e2DocId) || '';
            }
          }
        } else {
          tabContext = e2Str;
        }
        Logger.log('[SimpleGrade] E2 đề bài len=' + tabContext.length);
      }
    } catch (e) {
      Logger.log('[SimpleGrade] E2 error: ' + e.toString());
    }
    for (var r = 0; r < numRows; r++) {
      var row = firstRow + r;
      var link = sheet.getRange(row, 3).getValue();
      Logger.log('[SimpleGrade] row ' + row + ' link=' + (link ? String(link).substring(0, 60) : 'empty') + '...');
      if (!link) {
        Logger.log('[SimpleGrade] row ' + row + ' skip: no link');
        continue;
      }
      var content = _getContentFromUrl(link);
      if (content && typeof content === 'object' && content._blobs) {
        Logger.log('[SimpleGrade] row ' + row + ' blobs=' + content.blobs.length);
        gradeWithBlobsAndWrite(content, row, sheet, tabContext);
      } else if (content && typeof content === 'string' && content.trim()) {
        Logger.log('[SimpleGrade][PDF debug] row ' + row + ' chuyển PDF để chấm: KHÔNG (chấm text)');
        Logger.log('[SimpleGrade] row ' + row + ' content=' + content.length + ' chars');
        gradeAndWrite(content, row, sheet, tabContext);
      } else {
        Logger.log('[SimpleGrade] row ' + row + ' FAIL: Không đọc được nội dung');
        sheet.getRange(row, 6).setValue('Lỗi: Không đọc được nội dung').setBackground(null);
        continue;
      }
      Logger.log('[SimpleGrade] row ' + row + ' done');
    }
    Logger.log('[SimpleGrade] runFromMenu end');
    ss.toast('Đã chấm xong', 'Chấm đơn giản', 3);
  }

  return {
    grade: grade,
    gradeAndWrite: gradeAndWrite,
    runFromMenu: runFromMenu
  };
})();

/** Gọi từ menu. */
function menuChamDonGian() {
  if (typeof IELTSSimpleGrade !== 'undefined' && IELTSSimpleGrade.runFromMenu) {
    IELTSSimpleGrade.runFromMenu();
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('Chưa load IELTSSimpleGrade.', 'Lỗi', 4);
  }
}
