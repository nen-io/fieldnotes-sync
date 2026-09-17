import { expect, test } from '@playwright/test';

test('a new notebook page puts keyboard focus in its title so typing starts on that page', async ({
  page,
}) => {
  await page.goto('/');
  const pane = page.getByTestId('client-laptop');
  await pane.getByRole('button', { name: 'New note on Laptop' }).click();
  await expect(pane.getByLabel('Note title', { exact: true })).toBeFocused();
  await page.keyboard.type('The next page');
  await expect(pane.getByLabel('Note title', { exact: true })).toHaveValue('The next page');
});

test('local work exposes hidden drafts and uncertain operations without acknowledging them', async ({
  page,
}) => {
  await page.goto('/');
  const pane = page.getByTestId('client-laptop');
  await pane.getByLabel('Your note', { exact: true }).fill('Saved first version.');
  await pane.getByLabel('Your note', { exact: true }).press('Control+s');
  await expect(pane.getByLabel('Your note', { exact: true })).toBeFocused();
  await pane.getByRole('button', { name: 'Lose next ACK' }).click();
  await pane.getByRole('button', { name: 'Sync device' }).click();
  await pane
    .getByLabel('Your note', { exact: true })
    .fill('A newer draft while the ACK is unknown.');
  await pane.getByLabel('IN THIS NOTEBOOK').selectOption('note-ideas');
  await pane.getByLabel('Your note', { exact: true }).fill('Another unsaved idea.');
  const work = pane.getByRole('region', { name: 'Laptop local work', exact: true });
  await expect(work).toContainText('ACK unknown · retry Sync · newer draft');
  await expect(work).toContainText('Draft · not yet queued');
  await page.reload();
  await work.getByRole('button', { name: /A slower kind of morning/ }).click();
  await expect(pane.getByLabel('Your note', { exact: true })).toHaveValue(
    'A newer draft while the ACK is unknown.',
  );
  await expect(pane.getByText('1 pending', { exact: true })).toBeVisible();
  await expect(page.getByTestId('authority-note-walk')).toContainText('r2');
  await pane.getByRole('button', { name: 'Sync device' }).click();
  await expect(pane.getByText('0 pending', { exact: true })).toBeVisible();
  await expect(work).not.toContainText('ACK unknown');
  await expect(work.getByRole('button', { name: /A slower kind of morning/ })).toContainText(
    'Draft · not yet queued',
  );
  await expect(work.getByRole('button', { name: /Things worth making/ })).toBeVisible();
});

test('local work finds a conflict on an unselected page and resolution returns focus to the editor', async ({
  page,
}) => {
  await page.goto('/');
  const laptop = page.getByTestId('client-laptop');
  const pocket = page.getByTestId('client-pocket');
  for (const [pane, body] of [
    [laptop, 'Laptop branch'],
    [pocket, 'Pocket branch'],
  ] as const) {
    await pane.getByLabel('Your note', { exact: true }).fill(body);
    await pane.getByRole('button', { name: 'Save locally' }).click();
  }
  await pocket.getByLabel('IN THIS NOTEBOOK').selectOption('note-ideas');
  await laptop.getByRole('button', { name: 'Sync device' }).click();
  await pocket.getByRole('button', { name: 'Sync device' }).click();
  const conflict = pocket
    .getByRole('region', { name: 'Pocket local work', exact: true })
    .getByRole('button', { name: /Needs a decision/ });
  await conflict.focus();
  await page.keyboard.press('Enter');
  await pocket.getByRole('button', { name: 'Keep my version' }).click();
  await expect(pocket.getByLabel('Your note', { exact: true })).toBeFocused();
  await expect(
    pocket.getByRole('region', { name: 'Pocket local work', exact: true }),
  ).toContainText('Queued · not yet sent');
});

test('new local-work states fit mobile and enlarged text with keyboard-visible actions', async ({
  page,
}) => {
  await page.goto('/');
  await page.setViewportSize({ width: 320, height: 844 });
  const pane = page.getByTestId('client-laptop');
  await pane.getByRole('button', { name: 'New note on Laptop' }).click();
  await pane.getByLabel('Note title', { exact: true }).fill('');
  await expect(pane.getByLabel('Note title', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(pane.getByText('Add a title before saving this draft.')).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pane.getByRole('region', { name: 'Laptop pending notes' }).focus();
  await expect(pane.getByRole('region', { name: 'Laptop pending notes' })).toBeFocused();
});
