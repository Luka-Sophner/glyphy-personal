import { defineConfig } from '@playwright/test';

// Include the offline reload test against the production preview below.
process.env.GLYPHY_TEST_PWA = '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/vite.mjs e2e',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1365, height: 768 } } },
    // CSS viewport coverage, not an assertion of physical Poco device testing.
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true } },
    { name: 'wide-mobile-chromium', use: { browserName: 'chromium', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
    { name: 'narrow-mobile-chromium', use: { browserName: 'chromium', viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true } },
  ],
});
