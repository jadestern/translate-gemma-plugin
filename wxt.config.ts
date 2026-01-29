import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  webExt: {
    binaries: {
      firefox: '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
    },
  },
});
