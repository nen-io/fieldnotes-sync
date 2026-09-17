import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const storageKey = 'fieldnotes.simulation.v1';
const laptop = (page: Page) => page.getByTestId('client-laptop');
const pocket = (page: Page) => page.getByTestId('client-pocket');
async function save(pane: Locator, body: string) {
  await pane.getByLabel('Your note', { exact: true }).fill(body);
  await pane.getByRole('button', { name: 'Save locally' }).click();
}
async function synchronize(pane: Locator) {
  await pane.getByRole('button', { name: 'Sync device' }).click();
}
async function conflict(page: Page) {
  await save(laptop(page), 'Walk slowly. Take the riverside path and bring a small notebook.');
  await save(pocket(page), 'Leave early. Meet by the little coffee shop, then follow the river.');
  await synchronize(laptop(page));
  await synchronize(pocket(page));
  await expect(
    pocket(page).getByRole('group', { name: 'Pocket conflict resolution' }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('offline saves survive reload, pull preserves pending work, and explicit conflict resolution converges', async ({
  page,
}) => {
  await laptop(page).getByRole('switch').click();
  await pocket(page).getByRole('switch').click();
  await save(laptop(page), 'Laptop wrote this offline.');
  await save(pocket(page), 'Pocket wrote a different ending.');
  await page.reload();
  await expect(laptop(page).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect(laptop(page).getByText('1 pending', { exact: true })).toBeVisible();
  await expect(pocket(page).getByLabel('Your note', { exact: true })).toHaveValue(
    'Pocket wrote a different ending.',
  );
  await laptop(page).getByRole('switch').click();
  await synchronize(laptop(page));
  await pocket(page).getByRole('switch').click();
  await pocket(page).getByRole('button', { name: 'Pull only' }).click();
  await expect(pocket(page).getByText('1 pending', { exact: true })).toBeVisible();
  await expect(pocket(page).getByLabel('Your note', { exact: true })).toHaveValue(
    'Pocket wrote a different ending.',
  );
  await synchronize(pocket(page));
  await expect(pocket(page).getByRole('region', { name: 'Pocket Original base' })).toContainText(
    'Take the long way',
  );
  await expect(
    pocket(page).getByRole('region', { name: 'Pocket Authority now · r2' }),
  ).toContainText('Laptop wrote this offline.');
  await expect(
    pocket(page).getByRole('region', { name: 'Pocket Your latest version' }),
  ).toContainText('Pocket wrote a different ending.');
  await pocket(page).getByRole('button', { name: 'Keep my version' }).click();
  await synchronize(pocket(page));
  await laptop(page).getByRole('button', { name: 'Pull only' }).click();
  await page.reload();
  for (const pane of [laptop(page), pocket(page)]) {
    await expect(pane.getByLabel('Your note', { exact: true })).toHaveValue(
      'Pocket wrote a different ending.',
    );
    await expect(pane.getByText('0 pending', { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('authority-note-walk')).toContainText('r3');
});

test('lost ACK retries reuse the receipt; later saves coalesce only into the unsent successor', async ({
  page,
}) => {
  await save(laptop(page), 'This version commits exactly once.');
  await laptop(page).getByRole('button', { name: 'Lose next ACK' }).click();
  await synchronize(laptop(page));
  await expect(page.getByTestId('authority-note-walk')).toContainText('r2');
  await expect(laptop(page).getByText('1 pending', { exact: true })).toBeVisible();
  await page.reload();
  await save(laptop(page), 'Successor one.');
  await save(laptop(page), 'The final successor.');
  await expect(laptop(page).getByText('2 pending', { exact: true })).toBeVisible();
  await synchronize(laptop(page));
  await expect(page.getByTestId('authority-note-walk')).toContainText('r3');
  await expect(page.getByRole('region', { name: 'Synchronization event history' })).toContainText(
    'original acknowledgement reused',
  );
  await expect(page.getByText('2 / 256', { exact: true })).toBeVisible();
  await expect(laptop(page).getByText('0 pending', { exact: true })).toBeVisible();
  await page.reload();
  await expect(laptop(page).getByLabel('Your note', { exact: true })).toHaveValue(
    'The final successor.',
  );
});

test('a tombstone survives stale edits; keeping content creates a new identity', async ({
  page,
}) => {
  await save(pocket(page), 'This idea deserves its own new page.');
  await laptop(page).getByRole('button', { name: 'Delete note' }).click();
  await synchronize(laptop(page));
  await synchronize(pocket(page));
  await pocket(page).getByRole('button', { name: 'Keep as new copy' }).click();
  await synchronize(pocket(page));
  await page.reload();
  await expect(page.getByTestId('authority-note-walk')).toContainText('Tombstone');
  await expect(page.getByTestId('authority-note-walk')).toContainText('r2');
  await expect(pocket(page).getByLabel('Your note', { exact: true })).toHaveValue(
    'This idea deserves its own new page.',
  );
  await expect(pocket(page).getByLabel('IN THIS NOTEBOOK')).not.toHaveValue('note-walk');
  await expect(page.locator('.authority-list details')).toHaveCount(4);
});

test('pull preserves an unsaved draft and its original revision until explicit server choice', async ({
  page,
}) => {
  await laptop(page)
    .getByLabel('Your note', { exact: true })
    .fill('An unsaved thought from revision one.');
  await save(pocket(page), 'A newer authoritative version.');
  await synchronize(pocket(page));
  await laptop(page).getByRole('button', { name: 'Pull only' }).click();
  await page.reload();
  await expect(laptop(page).getByText('Unsaved draft', { exact: true })).toBeVisible();
  await expect(laptop(page).getByText('base r1', { exact: true })).toBeVisible();
  await expect(laptop(page).getByLabel('Your note', { exact: true })).toHaveValue(
    'An unsaved thought from revision one.',
  );
  await laptop(page).getByRole('button', { name: 'Save locally' }).click();
  await synchronize(laptop(page));
  await laptop(page).getByRole('button', { name: 'Use server version' }).click();
  await expect(laptop(page).getByLabel('Your note', { exact: true })).toHaveValue(
    'A newer authoritative version.',
  );
  await expect(laptop(page).getByText('0 pending', { exact: true })).toBeVisible();
});

test('invalid titles retain drafts; HTML-like text stays inert through commit, export and reload', async ({
  page,
}) => {
  await laptop(page).getByLabel('Note title', { exact: true }).fill('');
  await laptop(page).getByRole('button', { name: 'Save locally' }).click();
  await expect(page.getByRole('alert')).toContainText('title');
  await expect(laptop(page).getByText('Unsaved draft', { exact: true })).toBeVisible();
  const title = '<img src=x onerror="window.untrustedRan=true">';
  const body = '<script>window.untrustedRan=true</script>\nA plain text notebook.';
  await laptop(page).getByLabel('Note title', { exact: true }).fill(title);
  await save(laptop(page), body);
  await synchronize(laptop(page));
  await page.reload();
  await expect(laptop(page).getByLabel('Note title', { exact: true })).toHaveValue(title);
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => 'untrustedRan' in window)).toBe(false);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export notebook' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fieldnotes-simulation.json');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.authority.find((note: { id: string }) => note.id === 'note-walk')).toMatchObject({
    title,
    body,
    revision: 2,
  });
});

test('corrupt or denied storage shows recovery while local editing remains usable', async ({
  page,
}) => {
  await page.evaluate((key) => localStorage.setItem(key, '{broken-json'), storageKey);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('safe sample was restored');
  await expect(laptop(page).getByLabel('Note title', { exact: true })).toHaveValue(
    'A slower kind of morning',
  );
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage access denied');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Storage access denied');
    };
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Local saving is unavailable');
  await save(laptop(page), 'Still editable in this tab.');
  await expect(laptop(page).getByText('1 pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Saving unavailable', { exact: true })).toBeVisible();
});

test('keyboard navigation and 200 percent text fit narrow viewports without hiding actions', async ({
  page,
}) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to notebooks' })).toBeFocused();
  await page.keyboard.press('Enter');
  for (const width of [1440, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(laptop(page).getByRole('button', { name: 'Save locally' })).toBeVisible();
    await expect(laptop(page).getByRole('switch')).toBeVisible();
  }
  await page.getByRole('region', { name: 'Synchronization event history' }).focus();
  await expect(page.getByRole('region', { name: 'Synchronization event history' })).toBeFocused();
});

test('captures representative desktop and mobile protocol states without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await conflict(page);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: 'docs/screenshots/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('production policy is present and does not block the app or require external resources', async ({
  page,
}) => {
  const failures: string[] = [];
  const external: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(page.url()).origin) external.push(request.url());
  });
  await page.reload();
  if (process.env.FIELDNOTES_PRODUCTION === '1') {
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /connect-src 'none'/,
    );
  } else {
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(0);
  }
  await save(laptop(page), 'A local-only production check.');
  await synchronize(laptop(page));
  await expect(page.getByTestId('authority-note-walk')).toContainText('r2');
  expect(external).toEqual([]);
  expect(failures).toEqual([]);
});
