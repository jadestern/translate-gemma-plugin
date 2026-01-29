import { translate, translateBatch } from '@/lib/translate';
import { extractTextNodes, debugTextNodes, unmaskText } from '@/lib/dom-utils';
import { chunkTextNodes } from '@/lib/text-chunker';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  main() {
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
            let translatedBatch: string[];
            try {
              translatedBatch = await translateBatch(chunk.texts);
            } catch (batchErr) {
              console.warn(`⚠️ 배치 번역 실패(청크 ${i}), 낱개 번역으로 전환`);
              translatedBatch = [];
              for (const text of chunk.texts) {
                const single = await translate({ text });
                translatedBatch.push(single);
              }
            }
            
            chunk.nodes.forEach((item, index) => {
              const translatedResult = translatedBatch[index];
              if (translatedResult) {
                const el = item.element;
                // 원본 보존
                if (!el.dataset.tgOriginal) {
                  el.dataset.tgOriginal = el.innerHTML;
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
              }
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

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'translatePage') {
        translateFullPage();
        sendResponse({ message: '번역 시작...' });
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

    document.addEventListener('mouseup', (e) => {
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
