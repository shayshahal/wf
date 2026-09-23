// wf show — one headed window; phone emulation when SHOW_MOBILE is set.
import { defineConfig, devices } from '@playwright/test';

// A null viewport (the maximized window) refuses any deviceScaleFactor, and Desktop Chrome carries 1:
// `browser.newContext: "deviceScaleFactor" option is not supported with null "viewport"` (fix/role-assign-dialog T2).
const { deviceScaleFactor: _desktopScale, ...desktopChrome } = devices['Desktop Chrome'];
const phone = process.env.SHOW_MOBILE
	? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
	: { viewport: null };

export default defineConfig({
	testDir: __dirname,
	timeout: 0,
	workers: 1,
	retries: 0,
	reporter: 'line',
	outputDir: `${__dirname}/test-results`,
	use: {
		...desktopChrome,
		...phone,
		locale: 'he-IL',
		headless: false,
		launchOptions: process.env.SHOW_MOBILE ? {} : { args: ['--start-maximized'] },
		trace: 'off',
		// timeout: 0 above keeps the window open until Shay closes it (show.spec.ts waits on 'close' with
		// its own timeout: 0); every step before that is bounded so a stuck login fails loudly instead of
		// leaving a logged-out window (fix/role-assign-dialog T2). 90 s covers a cold vite compile.
		actionTimeout: 30_000,
		navigationTimeout: 90_000,
	},
});
