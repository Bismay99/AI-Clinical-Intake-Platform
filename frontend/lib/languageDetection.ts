/**
 * frontend/lib/languageDetection.ts
 *
 * Real-time Conversational Language Detection & Clinical Phrasing for CareVoice.
 *
 * Supported Conversational Languages:
 *   - "hi": Hindi (natural Indian Hindi)
 *   - "hinglish": Indian Hinglish (natural Hindi-English mixing with medical terms)
 *   - "en": English (clear clinical English)
 *
 * Rules:
 *   - Latest meaningful utterance determines the conversational language.
 *   - Immediate language switching when the patient changes language.
 *   - No language announcements, no prompts asking patient to select language.
 *   - Preserves English medical terms in Hinglish.
 *   - Clinical question selection remains governed strictly by FastAPI backend.
 */

export type ConversationalLanguage = "hi" | "hinglish" | "en";

// Devanagari Unicode block: \u0900 - \u097F
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

// Latin word tokenization (2+ chars)
const LATIN_WORDS_REGEX = /[a-zA-Z]{2,}/g;

/**
 * Transliterated Hindi markers / functional words commonly used in Hinglish and Romanized Hindi.
 */
const HINDI_TRANSLITERATED_MARKERS = new Set([
  "mein", "se", "ko", "ka", "ki", "ke", "hai", "hain", "tha", "thi", "the",
  "dard", "mahine", "saal", "ho", "raha", "rahi", "rahe", "kuch", "bohot",
  "bahut", "bhi", "aur", "par", "mujhe", "mera", "meri", "mere", "hum",
  "kya", "kyun", "kab", "kahan", "nahi", "haan", "accha", "theek", "seene",
  "pet", "bukhar", "khansi", "saans", "takleef", "din", "pehle", "sirf",
  "lag", "batao", "bataiye", "karta", "karti", "karte", "hota", "hoti",
  "hote", "gaya", "gayi", "gaye", "aata", "aati", "aate", "dikkat", "pareshani",
  "zyada", "jyada", "kam", "chalte", "baithte", "subah", "shaam", "raat",
  "bata", "bolo", "boliye", "aaj", "kal", "parso", "badh", "ghat",
]);

/**
 * Common English medical & descriptive words commonly mixed in Indian Hinglish.
 */
const ENGLISH_WORDS_IN_HINGLISH = new Set([
  "chest", "pain", "days", "hours", "fever", "cough", "doctor", "medicine",
  "tablet", "problem", "issue", "hospital", "report", "test", "headache",
  "severe", "mild", "start", "started", "worse", "better", "walking",
  "resting", "breath", "breathing", "shortness", "sweating", "nausea",
  "vomiting", "stomach", "back", "arm", "jaw", "left", "right", "side",
  "activity", "heavy", "heaviness", "bp", "sugar", "heart", "attack",
  "gas", "acidity", "relief", "normal", "high", "low",
]);

/**
 * Detects the conversational language from the patient's latest utterance.
 * Returns 'hi' (Hindi), 'hinglish' (Indian Hinglish), or 'en' (English).
 */
export function detectConversationalLanguage(
  text: string,
  fallback: ConversationalLanguage = "en"
): ConversationalLanguage {
  if (!text || text.trim().length === 0) {
    return fallback;
  }

  const trimmed = text.trim();
  const hasDevanagari = DEVANAGARI_REGEX.test(trimmed);
  const latinMatches = trimmed.match(LATIN_WORDS_REGEX) || [];
  const latinWords = latinMatches.map((w) => w.toLowerCase());

  // 1. Devanagari script presence
  if (hasDevanagari) {
    // If Devanagari is heavily code-mixed with English medical terms:
    const englishWordCount = latinWords.filter((w) => ENGLISH_WORDS_IN_HINGLISH.has(w)).length;
    if (englishWordCount >= 2) {
      return "hinglish";
    }
    return "hi";
  }

  // 2. Latin script analysis: check for Hindi markers vs English words
  let hindiMarkerCount = 0;
  let englishMarkerCount = 0;

  for (const word of latinWords) {
    if (HINDI_TRANSLITERATED_MARKERS.has(word)) {
      hindiMarkerCount++;
    }
    if (ENGLISH_WORDS_IN_HINGLISH.has(word)) {
      englishMarkerCount++;
    }
  }

  // If Hindi grammatical markers are present:
  if (hindiMarkerCount >= 1) {
    // Both Hindi markers and English words -> Indian Hinglish
    if (englishMarkerCount >= 1) {
      return "hinglish";
    }
    // High density of transliterated Hindi -> Hinglish / Romanized Hindi
    return "hinglish";
  }

  // 3. Pure English sentence structure check
  return "en";
}

/**
 * Canonical translations and natural phrasing for the core clinical questions.
 */
interface QuestionPhrasings {
  en: string;
  hi: string;
  hinglish: string;
}

const CLINICAL_QUESTION_PHRASINGS: Record<string, QuestionPhrasings> = {
  // Chief Complaint
  "What brings you in today?": {
    en: "What brings you in today?",
    hi: "नमस्ते, आज आपको क्या तकलीफ है या किस वजह से आना हुआ?",
    hinglish: "Hello, aaj aapko kya problem ho rahi hai?",
  },
  // Onset
  "When did this start?": {
    en: "When did this start?",
    hi: "यह दर्द या परेशानी कब से शुरू हुई?",
    hinglish: "Yeh pain ya problem kab se start hui?",
  },
  // Exertion related
  "Does it get worse with activity?": {
    en: "Does it get worse with activity?",
    hi: "क्या चलने-फिरने या काम करने से यह दर्द और बढ़ जाता है?",
    hinglish: "Kya koi activity karne ya chalne-phirne se yeh pain badh jata hai?",
  },
  // Radiation
  "Does the pain spread anywhere else, like your arm or jaw?": {
    en: "Does the pain spread anywhere else, like your arm or jaw?",
    hi: "क्या यह दर्द कहीं और भी फैलता है, जैसे आपके हाथ, कंधे या जबड़े में?",
    hinglish: "Kya yeh pain kahin aur spread hota hai, jaise aapke arm, shoulder ya jaw mein?",
  },
  // Associated symptoms
  "Any shortness of breath, sweating, or nausea with it?": {
    en: "Any shortness of breath, sweating, or nausea with it?",
    hi: "क्या इसके साथ सांस फूलना, बहुत पसीना आना, या उल्टी/जी मिचलाना जैसी कोई परेशानी है?",
    hinglish: "Kya iske saath breathing problem, sweating ya nausea jaisa feel hota hai?",
  },
};

/**
 * Formats the clinical question into the target conversational language.
 */
export function formatQuestionForLanguage(
  question: string,
  lang: ConversationalLanguage
): string {
  const phrasing = CLINICAL_QUESTION_PHRASINGS[question.trim()];
  if (phrasing) {
    return phrasing[lang];
  }
  return question;
}

/**
 * Immediate language lock update sent to ElevenLabs the moment a patient utterance is transcribed.
 * Enforces immediate adherence before turn synthesis completes.
 */
export function buildImmediateLanguageLockUpdate(lang: ConversationalLanguage): string {
  if (lang === "hi") {
    return "The patient's current conversational language is Hindi. You MUST respond in Hindi. Do NOT respond in English. Do NOT translate the conversation into English. Continue the clinical conversation in Hindi. NEVER claim that medical records require English.";
  }
  if (lang === "hinglish") {
    return "The patient's current conversational language is Hinglish. You MUST respond in natural Hinglish. Do NOT switch to English. Do NOT translate the conversation into English. Continue the clinical conversation in natural Hinglish. NEVER claim that medical records require English.";
  }
  return "The patient's current conversational language is English. Respond in English.";
}

/**
 * Generates the authoritative contextual update instruction for CareVoice.
 * Enforces exact language discipline, conversational speed, natural cadence, and clear pronunciation.
 */
export function buildCareVoiceContextualUpdate(
  backendQuestion: string,
  lang: ConversationalLanguage
): string {
  const targetedQuestion = formatQuestionForLanguage(backendQuestion, lang);

  const styleGuidelines = [
    "VOICE & SPEAKING STYLE RULES:",
    "- Speak naturally at a comfortable, normal conversational speed. Do NOT speak unusually slowly.",
    "- Do NOT stretch or drag out words. Maintain a normal, natural conversational rhythm and pace.",
    "- Keep pronunciation crisp, clear, and easy for patients to understand.",
    "- Use short, natural pauses between sentences/questions, but do NOT insert long pauses between individual words.",
    "- Avoid sounding robotic, like a text-to-speech reader, or like a classroom lesson.",
    "- Maintain a calm, warm, empathetic, professional clinical tone.",
    "- Acknowledge the patient's answer very briefly and move naturally to the clinical question without over-explaining.",
  ].join(" ");

  if (lang === "hi") {
    return [
      "The patient's current conversational language is Hindi. You MUST respond in Hindi. Do NOT respond in English. Do NOT translate the conversation into English. Continue the clinical conversation in Hindi.",
      "CRITICAL: The sentence 'I need to continue our conversation in English to ensure your medical records are accurate' must NEVER be generated.",
      "Medical-record accuracy must NOT be used as a reason to switch to English.",
      "You MUST respond ONLY in natural conversational Indian Hindi with authentic Indian Hindi rhythm and natural speed.",
      "Do NOT announce that you detected Hindi. Do NOT ask the patient to choose a language.",
      "Do NOT translate common healthcare terms into unnatural Sanskritized Hindi if the everyday term is familiar in Indian clinics.",
      `The hospital backend has selected this clinical question: "${targetedQuestion}".`,
      "Speak this clinical question naturally, warmly, and clearly to the patient at normal conversational speed.",
      styleGuidelines,
    ].join(" ");
  }

  if (lang === "hinglish") {
    return [
      "The patient's current conversational language is Hinglish. You MUST respond in natural Hinglish. Do NOT switch to English. Do NOT translate the conversation into English.",
      "CRITICAL: The sentence 'I need to continue our conversation in English to ensure your medical records are accurate' must NEVER be generated.",
      "Medical-record accuracy must NOT be used as a reason to switch to English.",
      "You MUST respond ONLY in natural Indian conversational Hinglish, naturally mixing Hindi and English at a normal conversational pace.",
      "Do NOT speak formal pure English. Do NOT speak difficult formal Hindi. Do NOT announce that you detected Hinglish.",
      "Preserve common English clinical and everyday terms (pain, chest, doctor, problem, breathing, days, normal) rather than translating them awkwardly.",
      `The hospital backend has selected this clinical question: "${targetedQuestion}".`,
      "Speak this clinical question warmly, conversationally, and at normal pace in authentic Indian Hinglish.",
      styleGuidelines,
    ].join(" ");
  }

  // English
  return [
    "The patient's current conversational language is English. Respond in English.",
    "CRITICAL LANGUAGE INSTRUCTION: The patient spoke in English.",
    "You MUST respond ONLY in clear clinical English at a comfortable, natural conversational pace.",
    "Do NOT speak Hindi. Do NOT announce that you detected English.",
    `The hospital backend has selected this clinical question: "${targetedQuestion}".`,
    "Speak this clinical question clearly, warmly, and naturally to the patient at normal conversational speed.",
    styleGuidelines,
  ].join(" ");
}

/**
 * Generates the pathway completion message in the active conversational language.
 */
export function buildPathwayCompleteUpdate(lang: ConversationalLanguage): string {
  const commonClosingStyle = "Speak warmly at a comfortable, natural conversational pace without dragging words. Do NOT ask any more questions. Acknowledge and conclude.";

  if (lang === "hi") {
    return [
      "All clinical intake questions are complete.",
      "In natural conversational Hindi, say warmly: 'आपकी सभी जानकारियां दर्ज कर ली गई हैं और डॉक्टर के रिव्यू के लिए तैयार हैं। धन्यवाद!'",
      commonClosingStyle,
    ].join(" ");
  }

  if (lang === "hinglish") {
    return [
      "All clinical intake questions are complete.",
      "In natural Indian Hinglish, say warmly: 'Aapki information note kar li gayi hai aur doctor review ke liye ready hai. Thank you!'",
      commonClosingStyle,
    ].join(" ");
  }

  return [
    "All clinical intake questions are complete.",
    "In clear English, say warmly: 'Your information has been recorded and is ready for doctor review. Thank you!'",
    commonClosingStyle,
  ].join(" ");
}
