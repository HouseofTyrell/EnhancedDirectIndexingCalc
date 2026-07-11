import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ACK_KEY = 'taxCalc:qp-acknowledged';

async function openAcknowledgedWorkspace(page: Page) {
  await page.addInitScript(key => {
    localStorage.setItem(
      key,
      JSON.stringify({ acknowledged: true, acknowledgedAt: '2026-07-11T00:00:00.000Z' }),
    );
  }, ACK_KEY);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'EDI Calculator' })).toBeVisible();
}

test('acknowledgment gate is keyboard-contained and accessible', async ({ page }) => {
  await page.goto('/');

  const dialog = page.getByRole('dialog', { name: 'Important Acknowledgments' });
  await expect(dialog).toBeVisible();
  const checkboxes = dialog.getByRole('checkbox');
  await expect(checkboxes.first()).toBeFocused();

  for (const checkbox of await checkboxes.all()) await checkbox.check();
  const submit = dialog.getByRole('button', { name: 'I Acknowledge and Wish to Proceed' });
  await submit.focus();
  await page.keyboard.press('Tab');
  await expect(checkboxes.first()).toBeFocused();

  const scan = await new AxeBuilder({ page }).include('.qp-modal').analyze();
  expect(scan.violations).toEqual([]);

  await submit.click();
  await expect(page.getByRole('heading', { level: 1, name: 'EDI Calculator' })).toBeVisible();
});

test('workspace renders without horizontal page overflow or browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openAcknowledgedWorkspace(page);
  await expect(page.getByText('Est. Tax Savings').first()).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(errors).toEqual([]);
});

test('dark theme and core Workspace navigation remain operable', async ({ page }) => {
  await openAcknowledgedWorkspace(page);

  await page.getByRole('button', { name: /switch to dark mode/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Year-by-Year' }).click();
  await expect(page.locator('.year-breakdown-table').first()).toBeVisible();
  await page.getByRole('button', { name: 'Charts' }).click();
  await expect(page.locator('.wx-charts')).toBeVisible();
});

test('mobile inputs drawer and selected-year detail are keyboard operable', async (
  { page },
  testInfo,
) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-specific product shape');
  await openAcknowledgedWorkspace(page);

  const savings = page.getByTestId('ws-metric-total-savings');
  const before = await savings.textContent();
  const trigger = page.getByRole('button', { name: 'Edit inputs' });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Scenario inputs' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(':focus')).toBeVisible();

  const income = drawer.getByText('Annual income').locator('..').locator('input');
  await income.fill('4,000,000');
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(savings).not.toHaveText(before ?? '');

  await page.getByRole('button', { name: 'Year-by-Year' }).click();
  const detail = page.getByTestId('wx-mobile-year-detail');
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Next' }).click();
  await expect(detail.getByLabel('Selected year')).toHaveValue('2');
  await expect(detail.getByText('Open full audit table')).toBeVisible();
});
