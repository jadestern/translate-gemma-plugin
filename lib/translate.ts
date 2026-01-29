const LM_STUDIO_URL = 'http://localhost:1234';

export interface TranslateOptions {
  text: string;
  sourceLang?: string;
  targetLang?: string;
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
    model: 'translategemma-4b-it',
    prompt: prompt,
    temperature: 0.1,
    max_tokens: 2048,
    stop: ['<end_of_turn>', 'Text:', 'Note:', 'Explanation:'],
  };

  const response = await fetch(`${LM_STUDIO_URL}/api/v0/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  
  return data.choices[0].text.trim();
}

export async function translateBatch(texts: string[], sourceLang: string = 'en', targetLang: string = 'ko'): Promise<string[]> {
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
    model: 'translategemma-4b-it',
    prompt: prompt,
    temperature: 0.1,
    max_tokens: 4096,
    stop: ['<end_of_turn>', 'Sentences:', 'Note:', 'Explanation:'],
  };

  const response = await fetch(`${LM_STUDIO_URL}/api/v0/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Batch API error: ${response.status}`);

  const resultText = data.choices[0].text.trim();
  const translatedTexts = resultText.split(delimiter.trim()).map((s: string) => s.trim());

  if (translatedTexts.length !== texts.length) {
    throw new Error(`Batch mismatch: ${texts.length} expected, ${translatedTexts.length} received`);
  }

  return translatedTexts;
}
