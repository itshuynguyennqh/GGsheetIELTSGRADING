/**
 * IELTS Grading Pipeline – Phase 3 & 4
 * Runs grading per row by skill: WRITING, READING, LISTENING, SPEAKING.
 * Uses GeminiService, Config, DocsApiService; 4s throttle before each Gemini call.
 */

var IELTSGradingPipeline = (function () {
  var THROTTLE_MS = 4000;
  var CACHE_KEY_LAST_GEMINI = 'IELTSSkillClassifier_lastGeminiCall';
  var COL_STATUS = 6;
  var COL_SUBMISSION_URL = 3;

  function _throttleGeminiBeforeCall() {
    var cache = CacheService.getScriptCache();
    var last = cache.get(CACHE_KEY_LAST_GEMINI);
    if (last) {
      var elapsed = Date.now() - parseInt(last, 10);
      if (elapsed < THROTTLE_MS) {
        Utilities.sleep(THROTTLE_MS - elapsed);
      }
    }
    cache.put(CACHE_KEY_LAST_GEMINI, String(Date.now()), 60);
  }

  function _setGrading(sheet, row, value, background) {
    var range = sheet.getRange(row, COL_STATUS);
    range.setValue(value);
    range.setBackground(background == null ? null : background);
  }

  /**
   * Fetch URL and return blob; returns null on failure.
   */
  function _fetchBlob(url) {
    if (!url) return null;
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() >= 400) return null;
      return res.getBlob();
    } catch (e) {
      Logger.log('[IELTS] Pipeline._fetchBlob: ' + e.toString());
      return null;
    }
  }

  /**
   * Detect if URL is a Google Doc (docs.google.com/document).
   */
  function _isGoogleDocUrl(url) {
    return url && typeof url === 'string' && url.indexOf('docs.google.com/document') !== -1;
  }

  /**
   * Detect if URL is a Google Sheet (docs.google.com/spreadsheets).
   */
  function _isGoogleSheetUrl(url) {
    return url && typeof url === 'string' && url.indexOf('docs.google.com/spreadsheets') !== -1;
  }

  /**
   * Extract Google Doc/Folder ID from URL.
   */
  function _getDocIdFromUrl(url) {
    if (!url) return null;
    var m = url.match(/\/(?:d|folders)\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  /**
   * Lấy text từ một file cụ thể trên Drive (hỗ trợ OCR cho PDF/ảnh).
   */
  function _getTextFromDriveFile(file) {
    var mime = file.getMimeType();
    if (mime === MimeType.PLAIN_TEXT || mime === MimeType.CSV) {
      return file.getBlob().getDataAsString();
    }
    // DOCX/DOC: chuyển sang Google Doc tạm, đọc text, xóa file tạm
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword') {
      var tmpDocx = Drive.Files.insert({ title: 'Temp', mimeType: MimeType.GOOGLE_DOCS }, file.getBlob());
      var docxText = DocumentApp.openById(tmpDocx.id).getBody().getText();
      Drive.Files.remove(tmpDocx.id);
      return docxText;
    }
    // PDF: convert sang Doc (Drive tự trích text). Ảnh: dùng OCR
    if (mime === MimeType.PDF || mime.indexOf('image/') === 0) {
        var insertOpts = mime.indexOf('image/') === 0 ? { ocr: true, ocrLanguage: 'en' } : {};
        var tempDoc = Drive.Files.insert(
          { title: 'Temp OCR', mimeType: MimeType.GOOGLE_DOCS },
          file.getBlob(),
          insertOpts
        );
      var tempDocId = tempDoc.id;
      var tempBody = DocumentApp.openById(tempDocId).getBody().getText();
      Drive.Files.remove(tempDocId); // Xóa file tạm
      return tempBody;
    }
    // Nếu là Google Doc
    if (mime === MimeType.GOOGLE_DOCS) {
      return DocumentApp.openById(file.getId()).getBody().getText();
    }
    return null;
  }

  /**
   * Get plain text from a Google Doc URL, Drive file, or Drive folder.
   */
  function _getDocText(submissionUrl) {
    var docId = _getDocIdFromUrl(submissionUrl);
    if (!docId) return { text: null, error: 'Không tìm thấy ID trong URL' };
    
    // Kiểm tra xem đây là folder hay file
    var isFolder = submissionUrl.indexOf('/folders/') !== -1;
    var lastError = null;

    if (isFolder) {
      try {
        var folder = DriveApp.getFolderById(docId);
        var files = folder.getFiles();
        var combinedText = [];
        while (files.hasNext()) {
          var file = files.next();
          try {
            var text = _getTextFromDriveFile(file);
            if (text) combinedText.push(text);
          } catch (eFile) {
            Logger.log('[IELTS] Pipeline._getDocText error reading file in folder: ' + eFile.toString());
          }
        }
        return { text: combinedText.length > 0 ? combinedText.join('\n\n') : null, error: null };
      } catch (eFolder) {
        lastError = eFolder.toString();
        Logger.log('[IELTS] Pipeline._getDocText folder fallback error: ' + lastError);
        return { text: null, error: lastError };
      }
    }

    // Nếu là Google Doc URL có tab=t.xxx thì ưu tiên đọc đúng tab đó
    try {
      if (submissionUrl && submissionUrl.indexOf('docs.google.com/document') !== -1 &&
        typeof DocsApiService !== 'undefined' && DocsApiService &&
        DocsApiService.getTabIdFromUrl && DocsApiService.getTabContentByTabId) {
        var tabId = DocsApiService.getTabIdFromUrl(submissionUrl);
        if (tabId) {
          var tabRes = DocsApiService.getTabContentByTabId(docId, tabId);
          if (tabRes && tabRes.tabContent) return { text: tabRes.tabContent, error: null };
        }
      }
    } catch (eTab) {
      lastError = eTab.toString();
      Logger.log('[IELTS] Pipeline._getDocText tabId error: ' + lastError);
    }

    // Nếu là file đơn lẻ (Google Doc)
    if (typeof DocsApiService !== 'undefined' && DocsApiService.getDocText) {
      try {
        var text = DocsApiService.getDocText(docId);
        if (text) return { text: text, error: null };
      } catch (eApi) {
        lastError = eApi.toString();
      }
    }
    
    // Fallback: dùng DocumentApp (cho Google Doc)
    try {
      var doc = DocumentApp.openById(docId);
      var body = doc.getBody();
      if (body) return { text: body.getText(), error: null };
    } catch (e) {
      lastError = e.toString();
      Logger.log('[IELTS] Pipeline._getDocText DocumentApp fallback error: ' + lastError);
    }

    // Fallback 2: Nếu là file text/pdf trên Drive (không phải Google Doc native)
    try {
      var file = DriveApp.getFileById(docId);
      return { text: _getTextFromDriveFile(file), error: null };
    } catch (e2) {
      lastError = e2.toString();
      Logger.log('[IELTS] Pipeline._getDocText DriveApp fallback error: ' + lastError);
    }

    return { text: null, error: lastError };
  }

  /**
   * Call Gemini with multimodal parts (e.g. image or audio as inline_data).
   * Uses Config.getGeminiModel() and same API key as GeminiService.
   */
  function _logPartsForGemini(systemPrompt, parts) {
    var maxLog = 5000;
    Logger.log('[Gemini] systemPrompt:\n' + (systemPrompt && systemPrompt.length > maxLog ? systemPrompt.substring(0, maxLog) + '...[truncated]' : (systemPrompt || '')));
    (parts || []).forEach(function (p, i) {
      if (p.text) {
        var t = p.text.length > maxLog ? p.text.substring(0, maxLog) + '\n...[truncated]' : p.text;
        Logger.log('[Gemini] parts[' + i + '] text (len=' + p.text.length + '):\n' + t);
      } else if (p.inlineData) {
        Logger.log('[Gemini] parts[' + i + '] inlineData: mimeType=' + (p.inlineData.mimeType || '') + ', dataLen=' + (p.inlineData.data ? p.inlineData.data.length : 0));
      }
    });
  }

  function _callGeminiWithParts(systemPrompt, parts) {
    _throttleGeminiBeforeCall();
    Logger.log('[Gemini] _callGeminiWithParts parts count=' + (parts ? parts.length : 0));
    _logPartsForGemini(systemPrompt, parts);
    var model = typeof Config !== 'undefined' && Config.getGeminiModel ? Config.getGeminiModel('default') : 'gemini-3.1-flash-lite-preview';
    var apiKey = typeof Config !== 'undefined' && Config.getGeminiApiKey ? Config.getGeminiApiKey() : null;
    if (!apiKey && typeof GeminiService !== 'undefined' && GeminiService.getApiKey) {
      apiKey = GeminiService.getApiKey();
    }
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
    var payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{
        role: 'user',
        parts: parts
      }],
      generationConfig: { temperature: 0.2 }
    };
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code !== 200) {
      throw new Error('Gemini API ' + code + ': ' + body);
    }
    var data = JSON.parse(body);
    var textPart = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) ? data.candidates[0].content.parts[0] : null;
    return textPart && textPart.text ? textPart.text.trim() : '';
  }

  function _gradeWritingByText(sheet, row, tabContent, submissionUrl) {
    var docIdForPdf = _getDocIdFromUrl(submissionUrl);
    var docResult = _getDocText(submissionUrl);
    var text = docResult ? docResult.text : null;
    if (!text || !text.trim()) {
      if (_autoGoogleDocPdf() && docIdForPdf && typeof DocsApiService !== 'undefined' && DocsApiService.getGoogleDocAsPdfBlob) {
        var pdfAuto = DocsApiService.getGoogleDocAsPdfBlob(docIdForPdf);
        if (pdfAuto) {
          Logger.log('[IELTS] Pipeline: Google Doc -> PDF (auto: không có text)');
          _gradeWritingByInlineBlob(sheet, row, tabContent, pdfAuto);
          return;
        }
      }
      var errMsg = 'Lỗi: Không đọc được nội dung Doc';
      if (docResult && docResult.error) {
        errMsg += '\nChi tiết: ' + docResult.error;
      }
      _setGrading(sheet, row, errMsg, null);
      return;
    }
    _throttleGeminiBeforeCall();
    var fullPrompt = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getGradingWritingPipelinePrompt
      ? ConfigPrompts.getGradingWritingPipelinePrompt(tabContent, text)
      : 'Chấm bài BTVN IELTS. Viết nhận xét theo đúng format (chỉ trả về nhận xét, không Band score):\n\nTask/rubric context:\n' + (tabContent || '') + '\n\nStudent writing:\n' + text;
    var feedback;
    try {
      feedback = GeminiService.callGemini(fullPrompt);
    } catch (e) {
      throw e;
    }
    _setGrading(sheet, row, feedback || 'Band ? - Chưa chấm được', null);
  }

  function _forceGoogleDocPdf(submissionUrl) {
    if (typeof Config !== 'undefined' && Config.submissionUrlHasGradeAsPdf && Config.submissionUrlHasGradeAsPdf(submissionUrl)) return true;
    if (typeof Config !== 'undefined' && Config.getGradeGoogleDocAsPdfMode && Config.getGradeGoogleDocAsPdfMode() === 'always') return true;
    return false;
  }

  function _autoGoogleDocPdf() {
    return typeof Config !== 'undefined' && Config.getGradeGoogleDocAsPdfMode && Config.getGradeGoogleDocAsPdfMode() === 'auto';
  }

  /**
   * Chấm Writing với một blob (PDF hoặc ảnh) gửi Gemini multimodal.
   */
  function _gradeWritingByInlineBlob(sheet, row, tabContent, blob) {
    if (!blob) {
      _setGrading(sheet, row, 'Lỗi: Không tải được file (PDF/ảnh)', null);
      return;
    }
    var mimeType = blob.getContentType() || 'application/pdf';
    if (mimeType.indexOf('pdf') !== -1) mimeType = 'application/pdf';
    else if (mimeType.indexOf('image') === -1) mimeType = 'image/png';
    var isPdf = mimeType.indexOf('pdf') !== -1;
    Logger.log('[IELTS][PDF debug] row ' + row + ' chuyển PDF để chấm: ' + (isPdf ? 'CÓ (multimodal PDF)' : 'KHÔNG (chỉ ảnh, không phải PDF)'));
    var b64 = Utilities.base64Encode(blob.getBytes());
    var imageParts = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getGradingWritingImageParts
      ? ConfigPrompts.getGradingWritingImageParts(tabContent)
      : { systemInstruction: 'Chấm BTVN IELTS. Nhận xét: Ex X sai Y câu. THIẾU [...]. WRITING: [...].', textPart: 'Chấm bài BTVN IELTS. Viết nhận xét theo format:\n\nĐề bài:\n' + (tabContent || '') + '\n\nBài làm (PDF/ảnh):' };
    var parts = [
      { inlineData: { mimeType: mimeType, data: b64 } },
      { text: imageParts.textPart }
    ];
    var feedback;
    try {
      feedback = _callGeminiWithParts(imageParts.systemInstruction, parts);
    } catch (e) {
      throw e;
    }
    _setGrading(sheet, row, feedback || 'Band ? - Chưa chấm được', null);
  }

  function _gradeWritingByImage(sheet, row, tabContent, submissionUrl) {
    var blob = _fetchBlob(submissionUrl);
    _gradeWritingByInlineBlob(sheet, row, tabContent, blob);
  }

  function _gradeWriting(sheet, row, tabContent, submissionUrl) {
    if (_isGoogleDocUrl(submissionUrl)) {
      var gdocId = _getDocIdFromUrl(submissionUrl);
      if (_forceGoogleDocPdf(submissionUrl) && gdocId && typeof DocsApiService !== 'undefined' && DocsApiService.getGoogleDocAsPdfBlob) {
        var pdfFromDoc = DocsApiService.getGoogleDocAsPdfBlob(gdocId);
        if (pdfFromDoc) {
          Logger.log('[IELTS] Pipeline: Google Doc -> PDF (force) cho Gemini');
          _gradeWritingByInlineBlob(sheet, row, tabContent, pdfFromDoc);
          return;
        }
        Logger.log('[IELTS] Pipeline: export PDF thất bại, fallback đọc text');
      }
      _gradeWritingByText(sheet, row, tabContent, submissionUrl);
    } else {
      _gradeWritingByImage(sheet, row, tabContent, submissionUrl);
    }
  }

  /**
   * Extract answer key from tabContent (or use Gemini). Returns array of expected answers or object.
   */
  function _getAnswerKeyFromTabContent(tabContent) {
    if (!tabContent) return [];
    if (typeof GeminiService === 'undefined') return [];
    _throttleGeminiBeforeCall();
    var fullPrompt = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getAnswerKeyPrompt
      ? ConfigPrompts.getAnswerKeyPrompt(tabContent)
      : 'You are an IELTS expert. From the following content, extract the answer key as a JSON array of correct answers in order, e.g. ["A","B","C",...]. Reply with only the JSON array, no other text.\n\n' + tabContent;
    try {
      var res = GeminiService.callGemini(fullPrompt);
      var match = res.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (e) {
      Logger.log('[IELTS] _getAnswerKeyFromTabContent: ' + e.toString());
    }
    return [];
  }

  /**
   * Get student answers from a Google Sheet URL (first column or first sheet data).
   */
  function _getStudentAnswersFromSheet(submissionUrl) {
    try {
      var ss = SpreadsheetApp.openByUrl(submissionUrl);
      var sheet = ss.getSheets()[0];
      if (!sheet) return { answers: [], reason: 'empty_sheet' };
      var data = sheet.getDataRange().getValues();
      var answers = [];
      for (var r = 0; r < data.length; r++) {
        var cell = data[r][0];
        if (cell == null) continue;
        var s = String(cell).trim();
        if (!s) continue;
        var m = s.match(/^([A-Da-d])$/);
        if (m) answers.push(m[1].toUpperCase());
        else answers.push(s);
      }
      return { answers: answers, reason: answers.length ? 'ok' : 'no_match' };
    } catch (e) {
      Logger.log('[IELTS] Pipeline._getStudentAnswersFromSheet: ' + e.toString());
      return { answers: [], reason: 'no_doc', error: e.toString() };
    }
  }

  /**
   * Get student answers from Doc. Accepts many formats: "A", "1. A", "1) B", "Câu 1: C", "Answer: D", or first A-D/digit in line.
   */
  function _getStudentAnswersFromDoc(submissionUrl) {
    var docResult = _getDocText(submissionUrl);
    var text = docResult ? docResult.text : null;
    if (!text) return { answers: [], reason: 'no_doc', error: docResult ? docResult.error : null };
    var trimmed = text.trim();
    if (!trimmed) return { answers: [], reason: 'empty_doc', text: text };
    var lines = trimmed.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var answers = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(/^\s*(?:\d+[\.\)\:]?\s*|(?:câu|question|answer)\s*\d*[\.\)\:]?\s*)?([A-Da-d]|\d+)\s*$/i);
      if (m) {
        answers.push(m[1].toUpperCase());
        continue;
      }
      if (/^[A-Da-d]$/.test(line)) {
        answers.push(line.toUpperCase());
        continue;
      }
      var firstChoice = line.match(/\b([A-Da-d])\b/);
      if (firstChoice) answers.push(String(firstChoice[1]).toUpperCase());
      else if (/^\d+$/.test(line)) answers.push(String(line));
      else {
        var num = line.match(/\b(\d+)\s*[\.\)\:]\s*([A-Da-d])/i) || line.match(/\b([A-Da-d])\b/);
        if (num) answers.push(num[2] ? String(num[2]).toUpperCase() : String(num[1]));
      }
    }
    return { answers: answers, reason: answers.length ? 'ok' : 'no_match', text: text };
  }

  /**
   * Get student answers from submission URL (Doc or Sheet).
   * @returns {{ answers: string[], reason?: string }} reason: 'ok' | 'no_doc' | 'empty_doc' | 'no_match' (Doc only)
   */
  function _getStudentAnswers(submissionUrl) {
    if (_isGoogleSheetUrl(submissionUrl)) {
      return _getStudentAnswersFromSheet(submissionUrl);
    }
    return _getStudentAnswersFromDoc(submissionUrl);
  }

  function _gradeReadingOrListening(sheet, row, tabContent, submissionUrl, skillLabel) {
    var answerKey = _getAnswerKeyFromTabContent(tabContent);
    var result = _getStudentAnswers(submissionUrl);
    var studentAnswers = result.answers || [];
    var reason = result.reason;

    if (studentAnswers.length === 0) {
      var errMsg = 'Lỗi: ';
      if (reason === 'no_doc') {
        errMsg += 'Không đọc được link (chia sẻ Doc/Sheet cho tài khoản đang chấm với quyền Xem).';
        if (result.error) {
          errMsg += '\nChi tiết: ' + result.error;
        }
      } else if (reason === 'empty_doc' || reason === 'empty_sheet') {
        errMsg += 'Bài làm trống (Doc/Sheet không có nội dung).';
      } else if (reason === 'no_match') {
        errMsg += 'Không tìm thấy đáp án. Gợi ý: mỗi dòng một đáp án (A/B/C/D hoặc 1. A, 2. B, Câu 1: C...).';
      } else {
        errMsg += 'Không đọc được bài làm (Doc trống hoặc không hỗ trợ).';
      }
      _setGrading(sheet, row, errMsg, null);
      return;
    }
    var correct = 0;
    var total = Math.max(answerKey.length, studentAnswers.length);
    for (var i = 0; i < answerKey.length && i < studentAnswers.length; i++) {
      if (String(answerKey[i]).toUpperCase().trim() === String(studentAnswers[i]).toUpperCase().trim()) {
        correct++;
      }
    }
    if (answerKey.length === 0) {
      _setGrading(sheet, row, skillLabel + ': Số câu đúng ' + correct + ' / ' + studentAnswers.length + ' (chưa có đáp án)', null);
      return;
    }
    _throttleGeminiBeforeCall();
    var bandPrompt = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getBandConversionPrompt
      ? ConfigPrompts.getBandConversionPrompt(skillLabel, correct, total)
      : 'You are an IELTS expert. Reply only with one band number.\n\nConvert IELTS ' + skillLabel + ' raw score to approximate band. Raw: ' + correct + ' correct out of ' + total + '. Reply with only a single band number 1-9.';
    var band = '?';
    try {
      band = GeminiService.callGemini(bandPrompt).replace(/\D/g, '') || '?';
    } catch (e) {
      Logger.log('[IELTS] Pipeline Band conversion: ' + e.toString());
    }
    _setGrading(sheet, row, skillLabel + ': Số câu đúng ' + correct + ' / ' + total + ' - Band ' + band, null);
  }

  function _gradeSpeaking(sheet, row, tabContent, submissionUrl) {
    var blob = _fetchBlob(submissionUrl);
    if (!blob) {
      _setGrading(sheet, row, 'Lỗi: Không tải được file audio', null);
      return;
    }
    var mimeType = blob.getContentType() || 'audio/mpeg';
    if (mimeType.indexOf('audio') === -1) mimeType = 'audio/mpeg';
    var b64 = Utilities.base64Encode(blob.getBytes());
    var speakingPrompt = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getGradingSpeakingPrompt
      ? ConfigPrompts.getGradingSpeakingPrompt(tabContent)
      : 'Chấm bài BTVN IELTS Speaking. Viết nhận xét theo format:\n\nĐề bài:\n' + (tabContent || '');
    var speakingSystem = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.gradingSpeaking
      ? ConfigPrompts.gradingSpeaking.systemInstruction
      : 'Chấm BTVN IELTS Speaking. Nhận xét: Ex X sai Y câu. THIẾU [...].';
    var parts = [
      { inlineData: { mimeType: mimeType, data: b64 } },
      { text: speakingPrompt }
    ];
    var feedback;
    try {
      feedback = _callGeminiWithParts(speakingSystem, parts);
    } catch (e) {
      throw e;
    }
    _setGrading(sheet, row, feedback || 'Band ? - Chưa chấm được', null);
  }

  /**
   * Run the grading pipeline for the given rows.
   * @param {Object} params
   * @param {number[]} params.rows - Row numbers to grade
   * @param {Spreadsheet.SpreadsheetSheet} params.sheet - Sheet to write results to
   * @param {string} [params.docUrlFromE2] - Optional doc URL from E2
   * @param {string} params.tabContent - Tab content (rubric, questions, answer key context)
   * @param {string} params.skill - One of WRITING, READING, LISTENING, SPEAKING
   * @returns {number} Count of rows graded (optional)
   */
  function run(params) {
    var rows = params.rows || [];
    var sheet = params.sheet;
    var tabContent = params.tabContent || '';
    var skill = (params.skill || 'WRITING').toUpperCase();
    Logger.log('[IELTS] IELTSGradingPipeline.run start rows=' + rows.length + ' skill=' + skill);
    if (!sheet || !rows.length) return 0;

    var graded = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      Logger.log('[IELTS] Pipeline grading row ' + row + ' (' + (i + 1) + '/' + rows.length + ')');
      _setGrading(sheet, row, 'Đang chấm...', '#fff3cd');
      var submissionUrl = sheet.getRange(row, COL_SUBMISSION_URL).getValue();
      if (!submissionUrl) {
        _setGrading(sheet, row, 'Lỗi: Thiếu link bài nộp', null);
        continue;
      }
      try {
        switch (skill) {
          case 'WRITING':
            _gradeWriting(sheet, row, tabContent, submissionUrl);
            break;
          case 'READING':
            _gradeReadingOrListening(sheet, row, tabContent, submissionUrl, 'Reading');
            break;
          case 'LISTENING':
            _gradeReadingOrListening(sheet, row, tabContent, submissionUrl, 'Listening');
            break;
          case 'SPEAKING':
            _gradeSpeaking(sheet, row, tabContent, submissionUrl);
            break;
          default:
            _setGrading(sheet, row, 'Lỗi: Kỹ năng không hỗ trợ', null);
            continue;
        }
        graded++;
        Logger.log('[IELTS] Pipeline row ' + row + ' OK');
      } catch (e) {
        var shortMsg = e && e.message ? e.message.substring(0, 80) : String(e).substring(0, 80);
        _setGrading(sheet, row, 'Lỗi: ' + shortMsg, null);
        Logger.log('[IELTS] Pipeline run row ' + row + ' error: ' + e.toString());
      }
    }
    Logger.log('[IELTS] IELTSGradingPipeline.run end graded=' + graded + '/' + rows.length);
    return graded;
  }

  return {
    run: run
  };
})();
