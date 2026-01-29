import './style.css';
import { translate } from '@/lib/translate';

// 설정 기본값
const DEFAULT_SETTINGS = {
  showSelectionButton: false,
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <h1>🌐 TranslateGemma</h1>
    
    <div class="button-group">
      <button id="page-translate-btn" class="primary-btn">📄 전체 페이지 번역</button>
      <button id="toggle-btn" class="secondary-btn" disabled>🔄 원본 보기</button>
    </div>
    <div id="status"></div>
    
    <hr style="margin: 1rem 0; border-color: #444;">
    
    <details>
      <summary style="cursor: pointer; color: #888;">설정</summary>
      <label class="setting-item">
        <input type="checkbox" id="show-selection-btn">
        <span>텍스트 선택 시 번역 버튼 표시</span>
      </label>
    </details>
    
    <details>
      <summary style="cursor: pointer; color: #888;">텍스트 직접 번역</summary>
      <textarea id="input" placeholder="번역할 텍스트 입력...">Hello, world!</textarea>
      <button id="translate-btn">번역하기</button>
      <div id="result"></div>
    </details>
  </div>
`;

const inputEl = document.querySelector<HTMLTextAreaElement>('#input')!;
const btnEl = document.querySelector<HTMLButtonElement>('#translate-btn')!;
const resultEl = document.querySelector<HTMLDivElement>('#result')!;
const pageBtnEl = document.querySelector<HTMLButtonElement>('#page-translate-btn')!;
const toggleBtnEl = document.querySelector<HTMLButtonElement>('#toggle-btn')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const showSelectionBtnEl = document.querySelector<HTMLInputElement>('#show-selection-btn')!;

// 설정 로드 및 저장
async function loadSettings() {
  const settings = await browser.storage.sync.get(DEFAULT_SETTINGS) as typeof DEFAULT_SETTINGS;
  showSelectionBtnEl.checked = settings.showSelectionButton;
}

showSelectionBtnEl.addEventListener('change', async () => {
  await browser.storage.sync.set({ showSelectionButton: showSelectionBtnEl.checked });
});

loadSettings();

// popup 열릴 때 현재 번역 상태 확인
async function checkCurrentState() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    const response = await browser.tabs.sendMessage(tab.id, { action: 'getTranslationState' });
    if (response.state !== 'none' && response.count > 0) {
      toggleBtnEl.disabled = false;
      if (response.state === 'original') {
        toggleBtnEl.textContent = '🔄 번역 보기';
      } else {
        toggleBtnEl.textContent = '🔄 원본 보기';
      }
    }
  } catch (err) {
    // content script가 아직 로드되지 않았을 수 있음 - 무시
    console.log('State check skipped:', err);
  }
}

checkCurrentState();

// 전체 페이지 번역
pageBtnEl.addEventListener('click', async () => {
  pageBtnEl.disabled = true;
  pageBtnEl.textContent = '번역 시작 중...';
  statusEl.textContent = '';

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error('탭을 찾을 수 없습니다');

    await browser.tabs.sendMessage(tab.id, { action: 'translatePage' });
    // 번역 시작 후 팝업 닫기
    window.close();
  } catch (err) {
    console.error('Error:', err);
    statusEl.textContent = `오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`;
    pageBtnEl.disabled = false;
    pageBtnEl.textContent = '📄 전체 페이지 번역';
  }
});

// 원본/번역 토글
toggleBtnEl.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    const response = await browser.tabs.sendMessage(tab.id, { action: 'toggleTranslation' });
    if (response.state === 'none') {
      statusEl.textContent = '번역된 콘텐츠가 없습니다. 먼저 번역을 실행하세요.';
      return;
    }
    if (response.state === 'original') {
      toggleBtnEl.textContent = '🔄 번역 보기';
      statusEl.textContent = `원본으로 전환됨 (${response.count}개 요소)`;
    } else {
      toggleBtnEl.textContent = '🔄 원본 보기';
      statusEl.textContent = `번역으로 전환됨 (${response.count}개 요소)`;
    }
  } catch (err) {
    console.error('Toggle Error:', err);
    statusEl.textContent = '토글 실패: 페이지를 새로고침 후 다시 시도하세요.';
  }
});

// 텍스트 직접 번역
btnEl.addEventListener('click', async () => {
  const text = inputEl.value.trim();
  if (!text) return;

  btnEl.disabled = true;
  btnEl.textContent = '번역 중...';
  resultEl.textContent = '';

  try {
    const translated = await translate({ text, sourceLang: 'en', targetLang: 'ko' });
    resultEl.textContent = translated;
  } catch (err) {
    resultEl.textContent = `오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`;
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = '번역하기';
  }
});
