/**
 * IELTS Skill Classifier – Phase 2
 * Classifies tab content into one of WRITING, READING, LISTENING, SPEAKING.
 * Uses Gemini with 4s throttle between API calls.
 */

var IELTSSkillClassifier = (function () {
  var THROTTLE_MS = 4000;
  var CACHE_KEY_LAST_GEMINI = 'IELTSSkillClassifier_lastGeminiCall';

  /**
   * Throttle: wait if last Gemini call was less than 4s ago.
   * Same logic as ExamResultAzota._throttleGeminiBeforeCall().
   */
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

  /**
   * Parse Gemini response to extract skill and optional metadata.
   * @param {string} text - Raw response from Gemini
   * @returns {{ skill: string, metadata: Object }}
   */
  function _parseSkillResponse(text) {
    var skill = null;
    var metadata = {};
    if (!text || typeof text !== 'string') {
      return { skill: 'WRITING', metadata: {} };
    }
    var upper = text.toUpperCase().trim();
    var match = upper.match(/\b(WRITING|READING|LISTENING|SPEAKING)\b/);
    if (match) {
      skill = match[1];
    }
    return { skill: skill, metadata: metadata };
  }

  /**
   * Fallback: Tìm từ khóa xuất hiện nhiều nhất trong văn bản nếu AI thất bại hoặc không nhận diện được
   */
  function _fallbackKeywordSearch(text) {
    if (!text) return 'WRITING'; // Mặc định
    var upper = String(text).toUpperCase();
    var counts = { WRITING: 0, READING: 0, LISTENING: 0, SPEAKING: 0 };
    var foundAny = false;
    
    var skills = ['WRITING', 'READING', 'LISTENING', 'SPEAKING'];
    for (var i = 0; i < skills.length; i++) {
      var s = skills[i];
      var regex = new RegExp('\\b' + s + '\\b', 'g');
      var matches = upper.match(regex);
      if (matches) {
        counts[s] = matches.length;
        foundAny = true;
      }
    }
    
    if (!foundAny) return 'WRITING';
    
    var maxSkill = 'WRITING';
    var maxCount = 0;
    for (var skill in counts) {
      if (counts[skill] > maxCount) {
        maxCount = counts[skill];
        maxSkill = skill;
      }
    }
    return maxSkill;
  }

  /**
   * Classify tab content into one IELTS skill.
   * @param {string} tabContent - Content of the tab (instructions, questions, etc.)
   * @returns {{ skill: string, metadata: Object }} - skill is one of WRITING, READING, LISTENING, SPEAKING
   */
  function classify(tabContent) {
    Logger.log('[IELTS] IELTSSkillClassifier.classify start tabContentLen=' + (tabContent ? tabContent.length : 0));
    _throttleGeminiBeforeCall();
    var fullPrompt = typeof ConfigPrompts !== 'undefined' && ConfigPrompts.getSkillClassifierPrompt
      ? ConfigPrompts.getSkillClassifierPrompt(tabContent)
      : 'You are an IELTS expert. Identify the single IELTS skill that the given content belongs to. Reply with one or more of the following words: WRITING, READING, LISTENING, or SPEAKING. No explanation.\n\nWhat IELTS skill is this?\n\n' + (tabContent || '');
    var response;
    try {
      // Sử dụng model Gemma 4 31B bằng cách gọi API trực tiếp
      var apiKey = typeof Config !== 'undefined' && Config.getGeminiApiKey ? Config.getGeminiApiKey() : null;
      if (!apiKey && typeof GeminiService !== 'undefined' && GeminiService.getApiKey) {
        apiKey = GeminiService.getApiKey();
      }
      
      if (apiKey) {
        var model = 'gemma-2-27b-it'; // API Google hiện hỗ trợ gemma-2-27b-it (Gemma 2 27B Instruction Tuned)
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
        var payload = {
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.1 }
        };
        var res = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        var code = res.getResponseCode();
        if (code === 200) {
          var data = JSON.parse(res.getContentText());
          if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            response = data.candidates[0].content.parts[0].text;
          }
        } else {
          throw new Error('API Error ' + code + ': ' + res.getContentText());
        }
      } else if (typeof GeminiService !== 'undefined' && GeminiService.callGemini) {
        // Dự phòng gọi service mặc định nếu không tự lấy được API key
        response = GeminiService.callGemini(fullPrompt);
      } else {
        throw new Error('No API Key or GeminiService available');
      }
    } catch (e) {
      Logger.log('[IELTS] IELTSSkillClassifier.classify error: ' + e.toString() + ' -> Fallback keyword search');
      return { skill: _fallbackKeywordSearch(tabContent), metadata: {} };
    }
    var parsed = _parseSkillResponse(response);
    
    // Nếu AI không trả về đúng định dạng hoặc không có kết quả hợp lệ, dùng fallback
    if (!parsed.skill) {
      parsed.skill = _fallbackKeywordSearch(tabContent);
      Logger.log('[IELTS] IELTSSkillClassifier AI returned null/invalid -> Fallback skill=' + parsed.skill);
    }

    Logger.log('[IELTS] IELTSSkillClassifier.classify result skill=' + parsed.skill);
    return parsed;
  }

  return {
    classify: classify,
    _throttleGeminiBeforeCall: _throttleGeminiBeforeCall
  };
})();
