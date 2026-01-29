import { translate, translateBatch, containsKorean } from '@/lib/translate';
import { extractTextNodes, debugTextNodes, unmaskText } from '@/lib/dom-utils';
import { chunkTextNodes } from '@/lib/text-chunker';

const MAX_BATCH_RETRIES = 1;  // 배치는 빠르게 포기 (총 2번 시도)
const MAX_SINGLE_RETRIES = 2; // 낱개는 더 시도 (총 3번 시도)

// 설정 기본값
const DEFAULT_SETTINGS = {
  showSelectionButton: false,
};

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main() {
    // 설정 로드
    const settings = await browser.storage.sync.get(DEFAULT_SETTINGS);
    let showSelectionButton = settings.showSelectionButton;

    // 설정 변경 감지
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.showSelectionButton) {
        showSelectionButton = changes.showSelectionButton.newValue;
        if (translateBtn) {
          translateBtn.style.display = 'none';
        }
      }
    });

    let progressToast: HTMLElement | null = null;

    function showToast(message: string, isDone: boolean = false) {
      if (!progressToast) {
        progressToast = document.createElement('div');
        progressToast.id = 'tg-progress-toast';
        progressToast.style.cssText = `position:fixed;bottom:30px;right:30px;z-index:2147483647;background-color:#4f46e5;color:white;padding:16px 24px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.4);font-family:system-ui,-apple-system,sans-serif;font-size:16px;font-weight:600;transition:opacity 0.3s ease-in-out;pointer-events:none;opacity:0;`;
        document.body.appendChild(progressToast);
      }
      progressToast.textContent = message;
      progressToast.style.opacity = '1';
      if (isDone) setTimeout(() => { if (progressToast) progressToast.style.opacity = '0'; }, 4000);
    }

    async function translateFullPage() {
      try {
        console.log('🌐 전체 페이지 번역 시작 (태그 보존 모드)...');
        showToast('📄 페이지 구조 분석 중...');
        
        // 먼저 원본 상태인 요소들이 있으면 저장된 번역으로 복원
        const originalElements = document.querySelectorAll<HTMLElement>('[data-tg-state="original"]');
        let restoredCount = 0;
        if (originalElements.length > 0) {
          console.log(`🔄 ${originalElements.length}개 요소를 저장된 번역으로 복원`);
          originalElements.forEach(el => {
            const translated = el.dataset.tgTranslatedHtml;
            if (translated) {
              el.innerHTML = translated;
              el.dataset.tgState = 'translated';
              restoredCount++;
            }
          });
        }
        
        const items = extractTextNodes();
        debugTextNodes(items);
        
        // 새로 번역할 요소가 없는 경우
        if (items.length === 0) {
          if (restoredCount > 0) {
            showToast(`🎉 ${restoredCount}개 요소 번역 복원 완료!`, true);
          } else {
            showToast('✅ 모든 텍스트가 이미 번역되었습니다.', true);
          }
          return;
        }

        // 새로 번역할 요소가 있는 경우
        const chunks = chunkTextNodes(items);
        console.log(`📝 총 ${chunks.length}개 청크로 분할됨 (복원: ${restoredCount}개, 신규: ${items.length}개)`);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const progress = Math.round(((i + 1) / chunks.length) * 100);
          showToast(`⏳ 번역 중... ${i + 1}/${chunks.length} (${progress}%)`);

          try {
            let translatedBatch: string[] = [];
            const SKIP_MARKER = '__SKIP_TRANSLATION__';
            
            // 배치 번역 시도 (빠르게 포기하고 낱개로 전환)
            for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
              try {
                translatedBatch = await translateBatch(chunk.texts);
                
                // 한글 검증
                const invalidItems = translatedBatch
                  .map((t, idx) => ({ t, idx }))
                  .filter(({ t }) => !containsKorean(t));
                
                if (invalidItems.length === 0) break; // 성공
                
                console.warn(`⚠️ 배치 중 ${invalidItems.length}개 한글 부족 (시도 ${attempt + 1}/${MAX_BATCH_RETRIES + 1})`);
                invalidItems.slice(0, 3).forEach(({ t, idx }) => {
                  console.log(`  [${idx}] "${t.slice(0, 50)}..."`);
                });
                
                if (attempt === MAX_BATCH_RETRIES) {
                  // 마지막 시도: 실패한 항목만 개별 재번역
                  console.log('🔄 실패 항목 개별 재번역 시도...');
                  for (const { idx } of invalidItems) {
                    let success = false;
                    for (let retry = 0; retry <= MAX_SINGLE_RETRIES; retry++) {
                      const single = await translate({ text: chunk.texts[idx] });
                      if (containsKorean(single)) {
                        translatedBatch[idx] = single;
                        success = true;
                        break;
                      }
                    }
                    if (!success) {
                      console.warn(`⚠️ [${idx}] 번역 실패, 원본 유지`);
                      translatedBatch[idx] = SKIP_MARKER;
                    }
                  }
                }
              } catch (batchErr) {
                console.warn(`⚠️ 배치 번역 실패(청크 ${i}), 낱개 번역으로 전환:`, batchErr);
                translatedBatch = [];
                for (const text of chunk.texts) {
                  let translated = SKIP_MARKER;
                  for (let retry = 0; retry <= MAX_SINGLE_RETRIES; retry++) {
                    const single = await translate({ text });
                    if (containsKorean(single)) {
                      translated = single;
                      break;
                    }
                  }
                  if (translated === SKIP_MARKER) {
                    console.warn(`⚠️ 개별 번역 실패, 원본 유지`);
                  }
                  translatedBatch.push(translated);
                }
                break;
              }
            }
            
            chunk.nodes.forEach((item, index) => {
              const translatedResult = translatedBatch[index];
              const el = item.element;
              
              // 원본 보존 (항상)
              if (!el.dataset.tgOriginal) {
                el.dataset.tgOriginal = el.innerHTML;
              }
              
              // 번역 실패(SKIP_MARKER)면 원본 유지
              if (!translatedResult || translatedResult === SKIP_MARKER) {
                console.log(`⏭️ [${index}] 원본 유지`);
                return;
              }
              
              // 디버그: 마스킹된 텍스트와 번역 결과 비교
              if (item.isMasked) {
                console.group(`🔍 마스킹 디버그 [${index}]`);
                console.log('원본 마스킹:', item.originalText);
                console.log('번역 결과:', translatedResult);
                console.log('tagMap:', item.tagMap);
                console.groupEnd();
              }
              
              // 마스킹된 텍스트인 경우 HTML로 복구
              let finalHTML: string;
              if (item.isMasked && item.tagMap) {
                finalHTML = unmaskText(translatedResult, item.tagMap);
              } else {
                finalHTML = translatedResult;
              }

              // 결과 적용
              el.innerHTML = finalHTML;
              el.dataset.tgState = 'translated';
              el.dataset.tgTranslatedHtml = finalHTML;
            });

          } catch (err) {
            console.error(`❌ 청크 ${i} 번역 최종 실패:`, err);
          }
        }
        
        const totalCount = restoredCount + items.length;
        showToast(`🎉 번역 완료! (복원: ${restoredCount}개, 신규: ${items.length}개)`, true);
      } catch (err) {
        console.error('❌ 번역 중 치명적 오류:', err);
        showToast('❌ 번역 중 오류가 발생했습니다.', true);
      }
    }

    function toggleAllTranslations() {
      const elements = document.querySelectorAll<HTMLElement>('[data-tg-state]');
      if (elements.length === 0) return { state: 'none', count: 0 };

      // 모든 요소의 현재 상태를 확인 (대다수 상태 기준)
      const states = Array.from(elements).map(el => el.dataset.tgState);
      const translatedCount = states.filter(s => s === 'translated').length;
      const currentState = translatedCount > states.length / 2 ? 'translated' : 'original';
      const newState = currentState === 'translated' ? 'original' : 'translated';

      let successCount = 0;
      elements.forEach(el => {
        if (newState === 'original') {
          const original = el.dataset.tgOriginal;
          if (original) {
            el.innerHTML = original;
            el.dataset.tgState = 'original';
            successCount++;
          }
        } else {
          const translated = el.dataset.tgTranslatedHtml;
          if (translated) {
            el.innerHTML = translated;
            el.dataset.tgState = 'translated';
            successCount++;
          }
        }
      });

      return { state: newState, count: successCount };
    }

    async function translateSelection() {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (!selectedText) {
        showToast('선택된 텍스트가 없습니다.', true);
        return;
      }

      showToast('⏳ 선택 텍스트 번역 중...');
      try {
        const translated = await translate({ text: selectedText });
        if (tooltip) {
          const range = selection?.getRangeAt(0);
          const rect = range?.getBoundingClientRect();
          if (rect) {
            tooltip.textContent = translated;
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
            tooltip.style.display = 'block';
          }
        }
        showToast('✅ 번역 완료!', true);
      } catch (err) {
        console.error(err);
        showToast('❌ 번역 실패', true);
      }
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'translatePage') {
        translateFullPage();
        sendResponse({ message: '번역 시작...' });
      } else if (message.action === 'translateSelection') {
        translateSelection();
        sendResponse({ message: '선택 번역 시작...' });
      } else if (message.action === 'toggleTranslation') {
        const result = toggleAllTranslations();
        sendResponse(result);
      } else if (message.action === 'getTranslationState') {
        // popup이 열릴 때 현재 상태 확인용
        const elements = document.querySelectorAll<HTMLElement>('[data-tg-state]');
        if (elements.length === 0) {
          sendResponse({ state: 'none', count: 0 });
        } else {
          const states = Array.from(elements).map(el => el.dataset.tgState);
          const translatedCount = states.filter(s => s === 'translated').length;
          const currentState = translatedCount > states.length / 2 ? 'translated' : 'original';
          sendResponse({ state: currentState, count: elements.length });
        }
      }
      return true;
    });

    // --- 선택 텍스트 번역 기능 (유지) ---
    let translateBtn: HTMLElement | null = null;
    let tooltip: HTMLElement | null = null;

    function createTranslateButton() {
      const btn = document.createElement('button');
      btn.id = 'tg-translate-btn';
      btn.textContent = '번역';
      btn.style.cssText = `position:absolute !important;z-index:2147483647 !important;padding:4px 10px !important;background-color:#4f46e5 !important;color:white !important;border:none !important;border-radius:6px !important;font-size:12px !important;font-weight:bold !important;cursor:pointer !important;box-shadow:0 2px 8px rgba(0,0,0,0.3) !important;display:none;`;
      document.body.appendChild(btn);
      return btn;
    }

    function createTooltip() {
      const div = document.createElement('div');
      div.id = 'tg-tooltip';
      div.style.cssText = `position:absolute !important;z-index:2147483647 !important;max-width:320px !important;padding:10px 14px !important;background-color:#1f2937 !important;color:white !important;border-radius:8px !important;font-size:14px !important;line-height:1.5 !important;box-shadow:0 4px 15px rgba(0,0,0,0.4) !important;display:none;white-space:pre-wrap !important;border:1px solid #374151 !important;`;
      document.body.appendChild(div);
      return div;
    }

    translateBtn = createTranslateButton();
    tooltip = createTooltip();

    // 키보드 단축키 직접 처리 (fallback)
    document.addEventListener('keydown', (e) => {
      // Ctrl+T (Mac) 또는 Alt+T (Windows/Linux) - 선택 번역
      if ((e.ctrlKey && !e.metaKey && e.key === 't') || (e.altKey && e.key === 't')) {
        e.preventDefault();
        console.log('Shortcut detected: translate-selection');
        translateSelection();
      }
      // Ctrl+Shift+T (Mac) 또는 Alt+Shift+T (Windows/Linux) - 전체 페이지 번역
      if ((e.ctrlKey && !e.metaKey && e.shiftKey && e.key === 'T') || (e.altKey && e.shiftKey && e.key === 'T')) {
        e.preventDefault();
        console.log('Shortcut detected: translate-page');
        translateFullPage();
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (!showSelectionButton) return;
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (selectedText && selectedText.length > 0 && translateBtn) {
        translateBtn.style.left = `${e.pageX + 10}px`;
        translateBtn.style.top = `${e.pageY + 10}px`;
        translateBtn.style.display = 'block';
        translateBtn.dataset.text = selectedText;
      }
    });

    document.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (target.id !== 'tg-translate-btn' && translateBtn) translateBtn.style.display = 'none';
      if (target.id !== 'tg-tooltip' && tooltip) tooltip.style.display = 'none';
    });

    translateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = translateBtn?.dataset.text;
      if (!text || !translateBtn || !tooltip) return;
      translateBtn.textContent = '...';
      try {
        const translated = await translate({ text });
        tooltip.textContent = translated;
        tooltip.style.left = translateBtn.style.left;
        tooltip.style.top = `${parseInt(translateBtn.style.top) + 35}px`;
        tooltip.style.display = 'block';
      } catch (err) {
        console.error(err);
      } finally {
        translateBtn.textContent = '번역';
        translateBtn.style.display = 'none';
      }
    });
  },
});
