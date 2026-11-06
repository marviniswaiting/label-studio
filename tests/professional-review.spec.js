const { test, expect } = require('@playwright/test');

async function selectType(page, type) {
  await page.locator('#type-sel').click();
  await page.locator(`[data-type="${type}"]`).click();
}

test('runtime dependencies are served locally and the PWA makes no third-party requests', async ({ page }) => {
  const external = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') external.push(request.url());
  });
  await page.goto('/?local-assets=' + Date.now());
  await page.waitForLoadState('networkidle');

  expect(external).toEqual([]);
  const scriptSources = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
  expect(scriptSources.every(src => src.startsWith('./vendor/'))).toBe(true);
});

test('service worker cache revision is updated for the resizable-card release', async ({ request }) => {
  const source = await (await request.get('/sw.js')).text();
  expect(source).toContain("label-studio-pwa-v4");
});

test('product copy does not claim unsupported GS1 Data Matrix encoding', async ({ page, request }) => {
  await page.goto('/?copy=' + Date.now());
  await expect(page.locator('.nav-sub')).not.toContainText('GS1');
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest.description).not.toMatch(/GS1/i);
});

test('EAN-13 rejects malformed values and keeps encoded data equal to the displayed label', async ({ page }) => {
  await page.goto('/?ean=' + Date.now());
  await selectType(page, 'EAN-13');

  await page.locator('#tpl-input').fill('ABC-123');
  await page.locator('#gen-btn2').click();
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#sr-text')).toContainText('EAN-13');

  await page.locator('#tpl-input').fill('400638133393');
  await page.locator('#gen-btn2').click();
  await expect(page.locator('.card-lbl')).toHaveText('4006381333931');
  await expect(page.locator('.card-bc svg')).toHaveAttribute('data-encoded-value', '4006381333931');

  await page.locator('#tpl-input').fill('4006381333932');
  await page.locator('#gen-btn2').click();
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#sr-text')).toContainText('check digit');
});

test('Data Matrix PDF export preserves a square symbol', async ({ page }) => {
  await page.goto('/?dm=' + Date.now());
  await selectType(page, 'Data Matrix');
  await page.locator('#tpl-input').fill('DM-1234567890');
  await page.locator('#gen-btn2').click();
  await page.evaluate(() => {
    window.__pdfImages = [];
    window.__pdfSaved = false;
    window.jspdf.jsPDF = function FakePdf() {
      this.addPage = () => {};
      this.addImage = (...args) => window.__pdfImages.push(args);
      this.setFontSize = () => {};
      this.setTextColor = () => {};
      this.text = () => {};
      this.save = () => { window.__pdfSaved = true; };
    };
  });
  await page.locator('#exp-btn').click();
  await page.locator('#exp-pdf').click();
  await page.waitForFunction(() => window.__pdfSaved);
  const dimensions = await page.evaluate(() => ({
    width: window.__pdfImages[0][4],
    height: window.__pdfImages[0][5],
  }));
  expect(Math.abs(dimensions.width - dimensions.height)).toBeLessThan(0.1);
});

test('installed PWA reloads and generates QR codes while offline', async ({ page, context }) => {
  await page.goto('/?offline=' + Date.now());
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await selectType(page, 'QR Code');
  await page.locator('#tpl-input').fill('OFFLINE-QR');
  await page.locator('#gen-btn2').click();
  await expect(page.locator('.qr-shell canvas:visible, .qr-shell img:visible')).toHaveCount(1);
  await context.setOffline(false);
});

test('oversized QR PDF output is scaled inside the printable A4 area', async ({ page }) => {
  await page.goto('/?large-pdf=' + Date.now());
  await selectType(page, 'QR Code');
  await page.locator('#mod-val').fill('20');
  await page.locator('#tpl-input').fill('X'.repeat(200));
  await page.locator('#gen-btn2').click();
  await page.evaluate(() => {
    window.__pdfImages = [];
    window.__pdfSaved = false;
    window.jspdf.jsPDF = function FakePdf() {
      this.addPage = () => {};
      this.addImage = (...args) => window.__pdfImages.push(args);
      this.setFontSize = () => {};
      this.setTextColor = () => {};
      this.text = () => {};
      this.save = () => { window.__pdfSaved = true; };
    };
  });
  await page.locator('#exp-btn').click();
  await page.locator('#exp-pdf').click();
  await page.waitForFunction(() => window.__pdfSaved);
  const dimensions = await page.evaluate(() => ({ width: window.__pdfImages[0][4], height: window.__pdfImages[0][5] }));
  expect(dimensions.width).toBeLessThanOrEqual(190.01);
  expect(dimensions.height).toBeLessThanOrEqual(277);
  expect(Math.abs(dimensions.width - dimensions.height)).toBeLessThan(0.1);
});

test('PDF export reports an error instead of saving when no symbols render', async ({ page }) => {
  await page.goto('/?failed-pdf=' + Date.now());
  await selectType(page, 'Code 39');
  await page.locator('#tpl-input').fill('😀');
  await page.locator('#gen-btn2').click();
  await page.evaluate(() => {
    window.__pdfSaved = false;
    window.jspdf.jsPDF = function FakePdf() {
      this.addPage = () => {};
      this.addImage = () => {};
      this.setFontSize = () => {};
      this.setTextColor = () => {};
      this.text = () => {};
      this.save = () => { window.__pdfSaved = true; };
    };
  });
  await page.locator('#exp-btn').click();
  await page.locator('#exp-pdf').click();
  await expect(page.locator('#toast')).toContainText('could not be rendered');
  expect(await page.evaluate(() => window.__pdfSaved)).toBe(false);
});

test('range templates reject unsafe integers before expansion', async ({ page }) => {
  await page.goto('/?unsafe-range=' + Date.now());

  for (const template of [
    '{{999999999999999999999:1:999999999999999999999}}',
    '{{9999999999999998:1:10000000000000000}}',
  ]) {
    await page.locator('#tpl-input').fill(template);
    await page.locator('#gen-btn2').click();
    await expect(page.locator('.card')).toHaveCount(0);
    await expect(page.locator('#sr-text')).toContainText('safe integers');
  }

  await page.locator('#tpl-input').fill('{{9007199254740990:1:9007199254740991}}');
  await page.locator('#gen-btn2').click();
  await expect(page.locator('.card-lbl')).toHaveText(['9007199254740990', '9007199254740991']);
});
