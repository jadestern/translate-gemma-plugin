/**
 * DOM에서 번역 가능한 단위를 추출 (구조 보존 및 재귀적 마스킹 지원)
 */

export interface TranslateItem {
  element: HTMLElement;
  originalText: string; // 마스킹된 텍스트
  isMasked: boolean;
  tagMap?: Map<string, string>;
}

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 
  'EMBED', 'SVG', 'MATH', 'CODE', 'PRE', 'TEXTAREA', 'INPUT',
  'TITLE', 'META', 'LINK', 'HEAD', 'HTML'
]);

// 번역 대상이 되는 "잎(leaf)" 블록 태그들 - 이 안의 텍스트만 번역
const LEAF_BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'CAPTION',
  'LABEL', 'FIGCAPTION', 'DT', 'DD', 'SUMMARY'
]);

// 컨테이너 역할을 하는 블록 태그들 - 자식으로 재귀
const CONTAINER_TAGS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE',
  'OL', 'UL', 'DL', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'FIGURE',
  'DETAILS', 'DIALOG', 'FORM', 'FIELDSET'
]);

// 모든 블록 태그 (호환성)
const BLOCK_TAGS = new Set([...LEAF_BLOCK_TAGS, ...CONTAINER_TAGS]);

// 인라인 태그 - 내부 텍스트도 번역 대상
const INLINE_TAGS = new Set([
  'A', 'B', 'STRONG', 'I', 'EM', 'SPAN', 'SUB', 'SUP', 'U', 'SMALL',
  'MARK', 'DEL', 'INS', 'Q', 'CITE', 'DFN', 'ABBR', 'TIME', 'VAR',
  'KBD', 'SAMP', 'BDO', 'BDI', 'RUBY', 'RT', 'RP', 'DATA', 'WBR'
]);

// 보존해야 할 요소들 - 통째로 마스킹 (내부 텍스트 번역 안 함)
const PRESERVE_TAGS = new Set([
  'SELECT', 'INPUT', 'BUTTON', 'TEXTAREA', 'OPTION', 'OPTGROUP',
  'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IMG', 'PICTURE', 'SOURCE',
  'IFRAME', 'OBJECT', 'EMBED', 'MAP', 'AREA',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
  'MATH', 'SLOT', 'TEMPLATE', 'PORTAL'
]);

/**
 * 엘리먼트 내부의 모든 인라인 태그를 <t0>, </t0> 형태의 플레이스홀더로 재귀적으로 마스킹합니다.
 * 보존해야 할 요소(select, input, svg 등)는 통째로 마스킹합니다.
 */
export function maskElement(el: HTMLElement): { maskedText: string; tagMap: Map<string, string> } {
  const tagMap = new Map<string, string>();
  let tagIndex = 0;

  const processNode = (node: Node): string => {
    let result = "";
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.textContent;
      } else if (child.nodeType === Node.COMMENT_NODE) {
        // HTML 주석도 보존
        const id = tagIndex++;
        const placeholder = `<t${id}/>`;
        tagMap.set(placeholder, `<!--${(child as Comment).data}-->`);
        result += placeholder;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        
        // 보존해야 할 요소는 통째로 마스킹 (self-closing 스타일)
        if (PRESERVE_TAGS.has(childEl.tagName)) {
          const id = tagIndex++;
          const placeholder = `<t${id}/>`;
          tagMap.set(placeholder, childEl.outerHTML);
          result += placeholder;
        }
        // 인라인 태그는 열고 닫는 태그를 분리해서 마스킹
        else if (INLINE_TAGS.has(childEl.tagName)) {
          const id = tagIndex++;
          const openP = `<t${id}>`;
          const closeP = `</t${id}>`;
          
          const outer = childEl.outerHTML;
          const inner = childEl.innerHTML;
          // 여는 태그와 닫는 태그의 순수 HTML 추출
          const openTagHTML = outer.substring(0, outer.indexOf(inner));
          const closeTagHTML = outer.substring(outer.lastIndexOf(inner) + inner.length);
          
          tagMap.set(openP, openTagHTML);
          tagMap.set(closeP, closeTagHTML);
          
          // 재귀적으로 내부 자식들도 마스킹
          result += openP + processNode(childEl) + closeP;
        }
        // 알 수 없는 요소도 통째로 보존 (안전)
        else {
          const id = tagIndex++;
          const placeholder = `<t${id}/>`;
          tagMap.set(placeholder, childEl.outerHTML);
          result += placeholder;
        }
      }
    }
    return result;
  };

  return { maskedText: processNode(el), tagMap };
}

/**
 * 페이지에서 번역 가능한 최소 블록들을 추출합니다.
 * 컨테이너는 건너뛰고, 실제 텍스트가 있는 잎(leaf) 요소만 추출합니다.
 */
export function extractTextNodes(root: HTMLElement = document.body): TranslateItem[] {
  const results: TranslateItem[] = [];
  const seen = new Set<HTMLElement>();

  function walk(el: HTMLElement) {
    if (SKIP_TAGS.has(el.tagName)) return;
    // 이미 번역된 요소는 스킵
    if (el.dataset.tgState) return;

    // 직접 텍스트 노드가 있는지 확인 (자식 요소 내 텍스트 제외)
    const hasDirectText = Array.from(el.childNodes).some(node => 
      node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    );

    // 컨테이너 태그는 항상 자식으로 재귀 (직접 텍스트가 없는 경우)
    if (CONTAINER_TAGS.has(el.tagName) && !hasDirectText) {
      for (const child of Array.from(el.children)) {
        walk(child as HTMLElement);
      }
      return;
    }

    // 자식 중에 블록 태그가 있으면 자식으로 재귀
    const hasBlockChild = Array.from(el.children).some(child => 
      BLOCK_TAGS.has(child.tagName)
    );

    if (hasBlockChild) {
      for (const child of Array.from(el.children)) {
        walk(child as HTMLElement);
      }
      return;
    }

    // 텍스트가 있는 요소만 번역 대상
    const textContent = el.innerText?.trim();
    if (!textContent || textContent.length === 0) return;

    // 이미 처리된 요소 스킵
    if (seen.has(el)) return;
    seen.add(el);

    // 자식 요소가 있거나 HTML 주석이 있으면 마스킹 필요
    const hasChildElements = el.children.length > 0;
    const hasComments = Array.from(el.childNodes).some(n => n.nodeType === Node.COMMENT_NODE);
    
    if (hasChildElements || hasComments) {
      const { maskedText, tagMap } = maskElement(el);
      results.push({ element: el, originalText: maskedText, isMasked: true, tagMap });
    } else {
      results.push({ element: el, originalText: textContent, isMasked: false });
    }
  }

  walk(root);
  return results;
}

/**
 * 마스킹된 텍스트를 다시 HTML로 복구합니다.
 */
export function unmaskText(translatedText: string, tagMap: Map<string, string>): string {
  let result = translatedText;
  // 태그 번호가 큰 것부터 치환하여 인덱스 겹침 방지
  const sortedKeys = Array.from(tagMap.keys()).sort((a, b) => {
    const numA = parseInt(a.replace(/[^\d]/g, ''));
    const numB = parseInt(b.replace(/[^\d]/g, ''));
    return numB - numA;
  });

  for (const key of sortedKeys) {
    result = result.split(key).join(tagMap.get(key)!);
  }
  return result;
}

export function debugTextNodes(nodes: TranslateItem[]) {
  console.group('📝 추출된 번역 블록 (고급 마스킹)');
  console.log(`총 ${nodes.length}개`);
  nodes.slice(0, 10).forEach((item, i) => {
    console.log(`[${i}] <${item.element.tagName}> (Masked: ${item.isMasked}): "${item.originalText.slice(0, 50)}..."`);
  });
  console.groupEnd();
}
