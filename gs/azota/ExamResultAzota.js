/**
 * ExamResultAzota – Throttle Gemini calls to respect rate limits.
 */

var GEMINI_THROTTLE_MS = 4000;
var LAST_GEMINI_CALL_KEY = 'LastGeminiCall';

/**
 * Ensures at least GEMINI_THROTTLE_MS ms between Gemini calls.
 * Uses script cache (or falls back to PropertiesService) to store last call time.
 * If elapsed time is less than 4000 ms, sleeps for the remaining time.
 */
function _throttleGeminiBeforeCall() {
  var cache = CacheService.getScriptCache();
  var key = LAST_GEMINI_CALL_KEY;
  var now = Date.now();
  var lastStr = cache.get(key);
  if (lastStr === null) {
    try {
      lastStr = PropertiesService.getScriptProperties().getProperty(key);
    } catch (e) {
      lastStr = null;
    }
  }
  var last = lastStr ? parseInt(lastStr, 10) : 0;
  var elapsed = now - last;
  if (elapsed < GEMINI_THROTTLE_MS && last > 0) {
    var remaining = GEMINI_THROTTLE_MS - elapsed;
    Utilities.sleep(remaining);
    now = Date.now();
  }
  var value = String(now);
  try {
    cache.put(key, value, 21600);
  } catch (e) {
    PropertiesService.getScriptProperties().setProperty(key, value);
  }
}
