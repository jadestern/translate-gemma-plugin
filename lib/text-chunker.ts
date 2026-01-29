import { TranslateItem } from './dom-utils';

export interface Chunk {
  nodes: TranslateItem[];
  texts: string[];
}

/**
 * 번역 아이템들을 API 요청 가능한 청크 단위로 묶습니다.
 */
export function chunkTextNodes(nodes: TranslateItem[], maxChars: number = 800, maxItems: number = 3): Chunk[] {
  const chunks: Chunk[] = [];
  let currentNodes: TranslateItem[] = [];
  let currentTexts: string[] = [];
  let currentLength = 0;

  for (const item of nodes) {
    const textLen = item.originalText.length;

    if (currentNodes.length > 0 && 
       (currentLength + textLen > maxChars || currentNodes.length >= maxItems)) {
      chunks.push({
        nodes: [...currentNodes],
        texts: [...currentTexts]
      });
      currentNodes = [];
      currentTexts = [];
      currentLength = 0;
    }

    currentNodes.push(item);
    currentTexts.push(item.originalText);
    currentLength += textLen;
  }

  if (currentNodes.length > 0) {
    chunks.push({
      nodes: [...currentNodes],
      texts: [...currentTexts]
    });
  }

  return chunks;
}
