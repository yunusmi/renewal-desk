import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
test.beforeEach(() => { execFileSync(process.execPath, ['e2e/server.cjs', '--reset'], { stdio: 'pipe' }); });
async function login(page: Page, account: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(`${account}@renewaldesk.test`);
  await page.getByLabel('Пароль', { exact: true }).fill('demo1234');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор', exact: true })).toBeVisible();
}
async function logout(page: Page) { if (await page.getByRole('button', { name: 'Меню', exact: true }).isVisible()) await page.getByRole('button', { name: 'Меню', exact: true }).click(); await page.getByRole('button', { name: 'Выйти', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible(); }
async function overflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); }

test('real core flow, dialogs, keyboard, filters, completed + rejected and tenant denial', async ({ page }, info) => {
  await login(page, 'initiator.alpha');
  await page.goto('/requests');
  await expect(page.getByRole('heading', { name: 'Заявки на продление', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Создать заявку', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ресурс', { exact: true }).selectOption('res-a-01');
  await expect(dialog).toContainText('31.03.2027');
  await dialog.getByRole('button', { name: 'Создать заявку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Хранилище A', exact: true })).toBeVisible();
  const requestPath = new URL(page.url()).pathname;
  await expect(page.getByText('Ожидает решения согласующего.', { exact: true })).toBeVisible();
  await overflow(page); await logout(page); await login(page, 'approver.alpha'); await page.goto(requestPath);
  await page.getByRole('button', { name: 'Согласовать…', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Согласовать…', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Согласовать…', exact: true }).click();
  // Native dialog confines keyboard focus.
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true); }
  await page.getByRole('dialog').getByRole('button', { name: 'Согласовать заявку', exact: true }).click();
  await expect(page.getByText('Провайдер подтвердил операцию. Срок ресурса обновлён.', { exact: true })).toBeVisible();
  await expect(page.getByText('Текущий срок ресурса: 31.03.2027', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('completed.png'), fullPage: true }); await overflow(page);
  await logout(page); await login(page, 'initiator.alpha'); await page.goto('/resources');
  await page.getByRole('button', { name: 'Продлить', exact: true }).last().click();
  await page.getByRole('dialog').getByLabel('Ресурс', { exact: true }).selectOption('res-a-02');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать заявку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Сервис B', exact: true })).toBeVisible();
  const rejectedPath = new URL(page.url()).pathname;
  await logout(page); await login(page, 'approver.alpha'); await page.goto(rejectedPath);
  await page.getByRole('button', { name: 'Отклонить…', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Отклонить заявку', exact: true }).click();
  await expect(page.getByText('Заявка отклонена. Срок не изменён, операция провайдеру не отправлялась.', { exact: true })).toBeVisible();
  await page.goto('/requests'); await page.getByRole('textbox', { name: 'Поиск заявок' }).fill('не существует');
  await expect(page.getByRole('status')).toContainText('из 0');
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.screenshot({ path: info.outputPath('requests.png'), fullPage: true }); await overflow(page);
  await page.goto('/audit'); await expect(page.getByRole('heading', { name: 'История операций', exact: true })).toBeVisible();
  await logout(page); await login(page, 'initiator.beta'); await page.goto(requestPath);
  await expect(page.getByRole('alert')).toContainText('workspace_forbidden'); await overflow(page);
});

test('own decision hidden, resource drawer focus, UI 500 retry and 404', async ({ page }) => {
  await login(page, 'universal.alpha'); await page.goto('/resources');
  await page.getByRole('button', { name: 'Хранилище A', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Хранилище A', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Продлить', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Создать заявку', exact: true }).click();
  await expect(page.getByText('Это ваша заявка — согласовать или отклонить её должен другой согласующий.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Согласовать…', exact: true })).toHaveCount(0);
  await page.route('**/api/v1/resources?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ status_code: 500, error_code: 'internal_error', message: 'Внутренняя ошибка сервера' }) }));
  await page.goto('/resources'); await expect(page.getByRole('alert')).toContainText('internal_error');
  await page.unroute('**/api/v1/resources?*'); await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Хранилище A', exact: true })).toBeVisible();
  await page.goto('/requests/RN-999999'); await expect(page.getByRole('alert')).toContainText('404'); await overflow(page);
});

test('filter reset, docs web component, and expired session during CSRF return to login', async ({ page, context }) => {
  await login(page, 'initiator.alpha'); await page.goto('/requests');
  await page.getByRole('button', { name: /^На согласовании/ }).click();
  await page.getByRole('button', { name: /^Все / }).click();
  await expect(page.getByRole('status')).toContainText('из 0');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.goto('/resources');
  await page.getByRole('combobox', { name: 'Наличие активной заявки' }).selectOption('false');
  await page.getByRole('combobox', { name: 'Наличие активной заявки' }).selectOption('');
  await expect(page.getByRole('status')).toContainText('из 2');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.goto('/docs');
  await expect.poll(() => page.evaluate(() => !!customElements.get('elements-api'))).toBe(true);
  await expect.poll(() => page.locator('elements-api').textContent()).toContain('RenewalDesk API');
  await page.goto('/resources');
  await page.getByRole('button', { name: 'Продлить', exact: true }).first().click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Создать заявку', exact: true })).toBeEnabled();
  await context.clearCookies();
  await page.getByRole('dialog').getByRole('button', { name: 'Создать заявку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вход', exact: true })).toBeVisible();
});

test('attention manual retry reconciles a real existing operation and long names do not overflow', async ({ page }, info) => {
  execFileSync(process.execPath, ['e2e/attention-fixture.cjs'], { stdio: 'pipe' });
  await login(page, 'approver.alpha'); await page.goto('/requests/RN-9001');
  await expect(page.getByRole('status')).toContainText('Не удалось подтвердить результат. Операция могла быть выполнена.');
  await overflow(page);
  await page.getByRole('button', { name: 'Повторить обработку…', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Операция могла быть выполнена');
  await page.getByRole('dialog').getByRole('button', { name: 'Повторить обработку', exact: true }).click();
  await expect(page.getByText('Провайдер подтвердил операцию. Срок ресурса обновлён.', { exact: true })).toBeVisible();
  await expect(page.getByText('Текущий срок ресурса: 31.03.2027', { exact: true })).toBeVisible();
  await expect(page.getByText('0 из 3 · всего 3', { exact: true })).toBeVisible();
  await overflow(page); await page.screenshot({ path: info.outputPath('retry-long-name.png'), fullPage: true });
});
