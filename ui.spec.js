import { test, expect } from '@playwright/test';
import { simulateComparison } from '../public/simulation.js';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Usuario', { exact: true }).fill('browser-test');
  await page.getByLabel('Contraseña', { exact: true }).fill(process.env.NODO_BROWSER_PASSWORD);
  await page.getByRole('button', { name: /Entrar al laboratorio/ }).click();
  await expect(page.locator('#simulate')).toBeVisible();
}

test('authentication protects assets, accepts authorized login, and logout revokes access', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/simulation.js')).status()).toBe(401);
  await page.getByLabel('Usuario', { exact: true }).fill('browser-test');
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrect-password-for-test');
  await page.getByRole('button', { name: /Entrar al laboratorio/ }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo iniciar');
  await login(page);
  expect((await page.request.get('/simulation.js')).status()).toBe(200);
  await page.getByRole('button', { name: /Salir/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/simulation.js')).status()).toBe(401);
});

test('simulation controls, functional charts, exact metrics, scenarios, playback and invalid inputs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await login(page);
  const expected = simulateComparison();
  const formatted = expected.adaptive.metrics.meanWait.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  await expect(page.locator('.metric-value').first()).toContainText(formatted);
  await expect(page.locator('#queue-chart polyline')).toHaveCount(2);
  await page.getByRole('button', { name: 'Intenso', exact: true }).click();
  await expect(page.locator('#demandNS')).toHaveValue('1850');
  await expect(page.locator('#scenario-notice')).toContainText('supera la capacidad');
  await page.locator('#timeline').fill('110');
  await expect(page.locator('#playback-time')).toContainText('01:50');
  await expect(page.locator('#playback')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#greenNS').fill('0');
  await page.locator('#simulate').click();
  await expect(page.locator('#config-error')).toBeVisible();
  await page.getByRole('button', { name: 'Restablecer escenario', exact: true }).click();
  await expect(page.locator('#config-error')).toBeHidden();
  await page.locator('#demandNS').fill('0');
  await page.locator('#demandEW').fill('0');
  await page.locator('#simulate').click();
  await expect(page.locator('.metric-value').first()).toContainText('0.0');
  await expect(page.locator('#metrics')).not.toContainText('NaN');
  await page.getByRole('button', { name: /02 Resultados/ }).click();
  await expect(page.locator('#view-resultados')).toBeVisible();
  await expect(page.locator('#view-resultados tbody tr').first()).toContainText('0 veh');
  expect(errors).toEqual([]);
});

test('results downloads carry configuration and real time-series data; sensitivity actually executes', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /02 Resultados/ }).click();
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar escenario JSON/ }).click()]);
  const stream = await jsonDownload.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported.config.seed).toBe(42);
  expect(exported.adaptive.passed + exported.adaptive.remaining).toBe(exported.adaptive.arrived);
  expect(exported.source).toContain('Sin acceso a Waze');
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar resultados CSV/ }).click()]);
  const csvStream = await csvDownload.createReadStream();
  const csvChunks = [];
  for await (const chunk of csvStream) csvChunks.push(chunk);
  const csv = Buffer.concat(csvChunks).toString('utf8');
  expect(csv.split('\r\n')).toHaveLength(902);
  expect(csv.split('\r\n').at(-1).split(',')[0]).toBe('900');
  await page.getByRole('button', { name: 'Comprobar 20 semillas' }).click();
  await expect(page.locator('#sweep-output')).toContainText('20 semillas: espera menor');
  await expect(page.locator('#sweep-output')).not.toContainText('Aún no');
});

test('project includes methodology, editable PERT, consistent duration, error handling and reset', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await login(page);
  await page.getByRole('button', { name: /03 Proyecto/ }).click();
  await expect(page.locator('#view-proyecto')).toContainText('Scrum ligero + CRISP-DM');
  await expect(page.locator('[data-pert-duration]')).toHaveText('34');
  await expect(page.locator('[data-pert-buffer]')).toHaveText('39.1');
  await expect(page.locator('.project-pert-graph svg')).toBeVisible();
  const inputs = page.locator('.project-pert-table input');
  expect(await inputs.count()).toBe(42);
  await inputs.nth(2).fill('9');
  await inputs.nth(2).dispatchEvent('change');
  await expect(page.locator('[data-pert-duration]')).not.toHaveText('34');
  await inputs.nth(0).fill('20');
  await inputs.nth(0).dispatchEvent('change');
  await expect(page.locator('.project-pert-error')).toBeVisible();
  await page.locator('.project-reset').click();
  await expect(page.locator('[data-pert-duration]')).toHaveText('34');
  await expect(page.locator('.project-pert-error')).toBeHidden();
  await page.getByRole('button', { name: /04 Datos y supuestos/ }).click();
  await expect(page.locator('#view-datos')).toContainText('Sin acceso a Waze');
  await expect(page.locator('#view-datos')).toContainText('no es un modelo de ML');
  expect(errors).toEqual([]);
});

test('mobile viewport retains controls, metrics, project tables and keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await expect(page.locator('#playback')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Ligero', exact: true }).click();
  await expect(page.locator('#demandNS')).toHaveValue('350');
  await page.getByRole('button', { name: /03 Proyecto/ }).click();
  await expect(page.locator('.project-pert-graph')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /04 Datos y supuestos/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-datos')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
