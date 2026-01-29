const LM_STUDIO_URL = 'http://localhost:1234';

export default defineBackground(() => {
  console.log('Translate Gemma background loaded', { id: browser.runtime.id });

  // 단축키 명령 처리
  browser.commands.onCommand.addListener(async (command) => {
    console.log('Command received:', command);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      console.log('No active tab found');
      return;
    }

    console.log('Sending message to tab:', tab.id);
    if (command === 'translate-selection') {
      browser.tabs.sendMessage(tab.id, { action: 'translateSelection' });
    } else if (command === 'translate-page') {
      browser.tabs.sendMessage(tab.id, { action: 'translatePage' });
    }
  });

  // Content script에서 오는 API 요청 처리 (CORS 우회)
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'apiRequest') {
      fetch(`${LM_STUDIO_URL}${message.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message.body),
      })
        .then(res => res.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: String(err) }));
      return true; // async response
    }
  });
});
