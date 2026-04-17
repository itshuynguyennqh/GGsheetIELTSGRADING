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
    if (!skill) {
      skill = 'WRITING';
    }
    return { skill: skill, metadata: metadata };
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
      : 'You are an IELTS expert. Identify the single IELTS skill that the given content belongs to. Reply with exactly one word: WRITING, READING, LISTENING, or SPEAKING. No explanation.\n\nWhat IELTS skill is this?\n\n' + (tabContent || '');
    var response;
    try {
      response = GeminiService.callGemini(fullPrompt);
    } catch (e) {
      Logger.log('[IELTS] IELTSSkillClassifier.classify error: ' + e.toString());
      return { skill: 'WRITING', metadata: {} };
    }
    var parsed = _parseSkillResponse(response);
    Logger.log('[IELTS] IELTSSkillClassifier.classify result skill=' + parsed.skill);
    return parsed;
  }

  return {
    classify: classify,
    _throttleGeminiBeforeCall: _throttleGeminiBeforeCall
  };
})();
