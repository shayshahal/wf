// wf show — log in, open the page, hand the window to Shay. Copied into <worktree>/.wf/show/
// by show.mjs; the imports resolve to that worktree's own verification/ helpers.
import { test } from '@playwright/test';
import { loginAdmin, loginB2B } from '../../verification/tests/support/auth';
import { ENV } from '../../verification/tests/support/env';

test('show', async ({ page }) => {
	test.setTimeout(0);
	const app = process.env.SHOW_APP;
	if (app === 'admin') await loginAdmin(page);
	else await loginB2B(page, ENV.b2bOwner);
	const url = app === 'admin' ? `${ENV.adminUrl}${ENV.adminBase}` : `${ENV.b2bUrl}${ENV.b2bBase}`;
	await page.goto(`${url}${process.env.SHOW_PATH}`);
	await page.waitForEvent('close', { timeout: 0 });
});
