const { test, expect } = require('@playwright/test');

test('offline page content', async ({ page }) => {
    await page.setContent('<html><head><title>PhotoVaultTest</title></head><body>ok</body></html>');
    await expect(page).toHaveTitle(/PhotoVaultTest/);
});
