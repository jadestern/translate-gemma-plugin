import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Translate Gemma',
    description: 'Translate web pages using local LLM (LM Studio)',
    permissions: ['storage'],
    // Firefox 임시 설치에서 storage API 사용을 위해 필요
    browser_specific_settings: {
      gecko: {
        id: 'translate-gemma@jadestern.dev',
      },
    },
    commands: {
      'translate-selection': {
        suggested_key: {
          default: 'Alt+T',
          mac: 'MacCtrl+T',
        },
        description: 'Translate selected text',
      },
      'translate-page': {
        suggested_key: {
          default: 'Alt+Shift+T',
          mac: 'MacCtrl+Shift+T',
        },
        description: 'Translate entire page',
      },
    },
  },
  webExt: {
    binaries: {
      firefox: '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
    },
  },
});
