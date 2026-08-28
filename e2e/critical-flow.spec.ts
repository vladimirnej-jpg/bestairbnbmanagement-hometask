import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('operator completes the deterministic lead journey and monitor verifies it', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(process.env.OPS_USER_EMAIL ?? 'ops@example.com');
  await page.getByLabel('Password').fill(process.env.OPS_USER_PASSWORD ?? 'ops-demo-password');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/ops$/);
  await expect(page.getByRole('heading', { name: 'Lead operations' })).toBeVisible();

  await page.getByRole('button', { name: 'Sync master data' }).click();
  await expect(page.getByText(/Master-data sync queued/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Master-data sync completed.')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Sync Gmail' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Gmail sync queued/ })).toBeVisible({
    timeout: 30_000,
  });
  const leadRow = page.getByRole('row').filter({ hasText: 'Alex Example' }).first();
  await expect(leadRow).toBeVisible({ timeout: 60_000 });
  await expect(leadRow.getByText('Needs Info')).toBeVisible();
  await page.getByRole('button', { name: 'Sync Gmail' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Gmail sync queued/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(leadRow.getByText('Qualified')).toBeVisible({ timeout: 60_000 });
  await leadRow.getByRole('link', { name: /Review/ }).click();
  await expect(page).toHaveURL(/\/ops\/leads\//);
  await expect(page.getByRole('heading', { name: 'Conversation' })).toBeVisible();
  await expect(page.getByText('More information needed')).not.toBeVisible();

  await page.getByRole('button', { name: 'Generate showcase' }).click();
  await expect(page.getByText(/Showcase generated/)).toBeVisible({ timeout: 30_000 });
  const subject = page.getByLabel('Subject');
  await subject.fill('Demo showcase for Alex');
  await page.getByRole('button', { name: 'Save showcase' }).click();
  await expect(page.getByText('Showcase edits saved.')).toBeVisible({ timeout: 30_000 });

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Save to Gmail/ }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/mail\.google\.com/);
  await popup.close();
  await page.getByLabel('Current lifecycle').selectOption('WARM');
  await expect(page.getByText('Lifecycle updated.')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: /Monitoring/ }).click();
  await expect(page).toHaveURL(/\/monitoring$/);
  await expect(page.getByRole('heading', { name: 'Monitoring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Source health' })).toBeVisible();
  await page.getByRole('button', { name: /Sign out/ }).click();
  await page.getByLabel('Work email').fill(process.env.MONITOR_USER_EMAIL ?? 'monitor@example.com');
  await page
    .getByLabel('Password')
    .fill(process.env.MONITOR_USER_PASSWORD ?? 'monitor-demo-password');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page).toHaveURL(/\/monitoring$/);
  await expect(page.getByText('Read-only / system pulse')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync master data' })).not.toBeVisible();
});
