export interface TranslateOptions {
  text: string;
  sourceLang?: string;
  targetLang?: string;
}

// Background script를 통해 API 요청 (CORS 우회)
async function apiRequest(endpoint: string, body: object): Promise<any> {
  const response = await browser.runtime.sendMessage({
    action: 'apiRequest',
    endpoint,
    body,
  });
  
  if (!response.success) {
    throw new Error(response.error);
  }
  return response.data;
}

/**
 * 텍스트가 유효한 한글 번역인지 확인
 * - 한글이 충분하면 통과
 * - 영어/숫자만 있으면 통과 (고유명사로 간주)
 * - 한자, 아랍어, 페르시아어 등 다른 문자가 있으면 실패
 */
export function containsKorean(text: string, minRatio: number = 0.3): boolean {
  // 태그 제거
  const withoutTags = text.replace(/<\/?t\d+\/?>/g, '');
  // 공백, 숫자, 특수문자 제거하고 실제 문자만
  const letters = withoutTags.replace(/[\s\d\p{P}\p{S}]/gu, '');
  
  if (letters.length === 0) return true; // 문자가 없으면 통과
  
  // 한글 문자 카운트 (가-힣)
  const koreanChars = letters.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || [];
  const koreanRatio = koreanChars.length / letters.length;
  
  // 1. 한글이 충분하면 통과
  if (koreanRatio >= minRatio) return true;
  
  // 2. 한글 제외한 나머지가 영어(ASCII)만이면 통과 (고유명사)
  const nonKoreanLetters = letters.replace(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '');
  const isOnlyAscii = /^[a-zA-Z]*$/.test(nonKoreanLetters);
  if (isOnlyAscii) return true;
  
  // 3. 그 외 (한자, 아랍어, 페르시아어 등) → 실패
  return false;
}

/**
 * 번역이 실제로 수행되었는지 확인
 * - 원문과 번역 결과가 거의 동일하면 번역 실패로 간주
 * - 단, 짧은 텍스트(고유명사 등)는 예외
 */
export function isTranslationDone(original: string, translated: string, minLength: number = 30): boolean {
  // 태그 제거 후 비교
  const cleanOriginal = original.replace(/<\/?t\d+\/?>/g, '').trim().toLowerCase();
  const cleanTranslated = translated.replace(/<\/?t\d+\/?>/g, '').trim().toLowerCase();
  
  // 짧은 텍스트는 고유명사일 수 있으므로 통과
  if (cleanOriginal.length < minLength) return true;
  
  // 원문과 번역이 동일하면 번역 안 된 것
  if (cleanOriginal === cleanTranslated) return false;
  
  // 90% 이상 유사하면 번역 안 된 것으로 간주
  const similarity = calculateSimilarity(cleanOriginal, cleanTranslated);
  if (similarity > 0.9) return false;
  
  return true;
}

/**
 * 두 문자열의 유사도 계산 (0~1)
 * 간단한 문자 기반 비교
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  
  return matches / longer.length;
}

export async function translate(options: TranslateOptions): Promise<string> {
  const { text, sourceLang = 'en', targetLang = 'ko' } = options;
  const targetLangName = targetLang === 'ko' ? 'Korean (한국어)' : targetLang;

  const prompt = `<bos><start_of_turn>user
Translate the English text below into ${targetLangName}.
CRITICAL RULES:
1. Preserve all tags like "<t0>", "</t0>", "<t1>" exactly where they belong in the translated sentence. 
2. Do not modify or remove any tags.
3. Output ONLY the translated ${targetLangName} text. No English, no explanations.

Text:
${text}<end_of_turn>
<start_of_turn>model
`;

  const requestBody = {
    model: 'translategemma-12b-it',
    prompt: prompt,
    temperature: 0.1,
    max_tokens: 2048,
    stop: ['<end_of_turn>', 'Text:', 'Note:', 'Explanation:'],
  };

  const data = await apiRequest('/api/v0/completions', requestBody);
  return data.choices[0].text.trim();
}

export async function translateBatch(
  texts: string[], 
  sourceLang: string = 'en', 
  targetLang: string = 'ko'
): Promise<string[]> {
  const delimiter = ' ||| ';
  const combinedText = texts.join(delimiter);
  const targetLangName = targetLang === 'ko' ? 'Korean (한국어)' : targetLang;

  const prompt = `<bos><start_of_turn>user
Task: Translate these ${texts.length} sentences from ${sourceLang} to ${targetLangName}.
Strict Requirements:
1. Output ONLY the translated text.
2. Separate each translation strictly with "${delimiter.trim()}".
3. Preserve all data tags like "<t0>", "</t0>", "<t1>" in their relative positions. Do NOT remove tags.
4. No English, No other languages, No explanations.

Sentences:
${combinedText}<end_of_turn>
<start_of_turn>model
`;

  const requestBody = {
    model: 'translategemma-12b-it',
    prompt: prompt,
    temperature: 0.1,
    max_tokens: 4096,
    stop: ['<end_of_turn>', 'Sentences:', 'Note:', 'Explanation:'],
  };

  const data = await apiRequest('/api/v0/completions', requestBody);

  const resultText = data.choices[0].text.trim();
  const translatedTexts = resultText.split(delimiter.trim()).map((s: string) => s.trim());

  // 개수 불일치면 에러
  if (translatedTexts.length !== texts.length) {
    throw new Error(`Batch mismatch: ${texts.length} expected, ${translatedTexts.length} received`);
  }

  return translatedTexts;
}
