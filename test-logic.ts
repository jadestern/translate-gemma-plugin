import { chunkTextNodes } from './lib/text-chunker';
import { TranslateItem } from './lib/dom-utils';

// 모킹된 데이터
const mockNodes: TranslateItem[] = Array.from({ length: 20 }, (_, i) => ({
  element: {} as HTMLElement,
  node: {} as Node,
  originalText: `Sentence ${i + 1} which is somewhat long.`,
  isMasked: false
}));

function testChunker() {
  console.log('🧪 Testing Text Chunker...');
  
  // 1. 개수 제한 테스트 (maxItems: 1)
  const chunksByCount = chunkTextNodes(mockNodes, 5000, 1);
  console.log(`- Test 1 (Max 1 items): Got ${chunksByCount.length} chunks. (Expected: 20)`);
  if (chunksByCount.length !== 20) throw new Error('Test 1 Failed');

  console.log('✅ Chunker logic is valid!');
}

try {
  testChunker();
} catch (e) {
  console.error('❌ Test failed:', e);
}
