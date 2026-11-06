const { test, expect } = require('@playwright/test');

async function selectQr(page) {
  await page.goto('/?test=' + Date.now());
  await page.locator('#type-sel').click();
  await page.locator('[data-type="QR Code"]').click();
}

async function selectType(page, type) {
  await page.goto('/?test=' + Date.now());
  await page.locator('#type-sel').click();
  await page.locator(`[data-type="${type}"]`).click();
}

async function dragFirstResizeHandle(page, deltaX) {
  const handle = page.locator('.card-resize').first();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const coarsePointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (coarsePointer) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + deltaX, y: startY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaX, startY, { steps: 5 });
    await page.mouse.up();
  }
}

test('QR preview keeps a four-module quiet zone and adjustable separation', async ({ page }) => {
  await selectQr(page);
  await expect(page.locator('#gap-val')).toBeVisible();
  await page.locator('#mod-val').fill('3');
  await page.locator('#gap-val').fill('32');
  await page.locator('#tpl-input').fill('ITEM-{{ 1:1:4 }}');
  await page.locator('#gen-btn2').click();

  const metrics = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const shell = cards[0].querySelector('.qr-shell');
    const rendered = [...shell.querySelectorAll('canvas,img')].find(node => getComputedStyle(node).display !== 'none');
    const first = cards[0].getBoundingClientRect();
    const second = cards[1].getBoundingClientRect();
    return {
      gridGap: getComputedStyle(document.querySelector('#grid')).columnGap,
      quietModules: Number(shell.dataset.quietModules),
      moduleCount: Number(shell.dataset.moduleCount),
      shellWidth: shell.getBoundingClientRect().width,
      canvasWidth: rendered.getBoundingClientRect().width,
      cardGap: Math.round(Math.abs(second.y - first.y) < 1
        ? second.x - (first.x + first.width)
        : second.y - (first.y + first.height)),
    };
  });

  expect(metrics.gridGap).toBe('32px');
  expect(metrics.quietModules).toBe(4);
  expect(metrics.canvasWidth).toBe(metrics.moduleCount * 3);
  expect(metrics.shellWidth).toBe((metrics.moduleCount + 8) * 3);
  expect(metrics.cardGap).toBe(32);
});

test('changing code spacing does not stretch cards to fill the grid', async ({ page }) => {
  await selectQr(page);
  await page.locator('#mod-val').fill('3');
  await page.locator('#tpl-input').fill('FIXED-{{ 1:1:4 }}');

  await page.locator('#gap-val').fill('48');
  await page.locator('#gen-btn2').click();
  const wideGapWidth = await page.locator('.card').first().evaluate(node => node.getBoundingClientRect().width);

  await page.locator('#gap-val').fill('12');
  await page.locator('#gen-btn2').click();
  const narrowGapWidth = await page.locator('.card').first().evaluate(node => node.getBoundingClientRect().width);
  const gridWidth = await page.locator('#grid').evaluate(node => node.getBoundingClientRect().width);

  expect(narrowGapWidth).toBeCloseTo(wideGapWidth, 0);
  expect(narrowGapWidth).toBeLessThan(gridWidth - 40);
});

test('resize control has a phone-sized touch target', async ({ page }) => {
  await selectQr(page);
  await page.locator('#tpl-input').fill('TOUCH-TARGET');
  await page.locator('#gen-btn2').click();

  const box = await page.locator('.card-resize').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('dragging a card corner resizes every generated code together', async ({ page }) => {
  await selectQr(page);
  await page.locator('#mod-val').fill('3');
  await page.locator('#tpl-input').fill('RESIZE-{{ 1:1:4 }}');
  await page.locator('#gen-btn2').click();

  const handles = page.locator('.card-resize');
  await expect(handles).toHaveCount(4);
  await handles.first().scrollIntoViewIfNeeded();
  const before = await page.locator('.card').first().evaluate(node => node.getBoundingClientRect().width);
  const box = await handles.first().boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const coarsePointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (coarsePointer) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + 100, y: startY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY, { steps: 5 });
    await page.mouse.up();
  }

  const result = await page.evaluate(() => ({
    moduleSizes: [...document.querySelectorAll('.qr-shell')].map(node => Number(node.dataset.moduleSize)),
    cardWidths: [...document.querySelectorAll('.card')].map(node => Math.round(node.getBoundingClientRect().width)),
    moduleInput: Number(document.querySelector('#mod-val').value),
  }));

  expect(result.moduleInput).toBeGreaterThan(3);
  expect(new Set(result.moduleSizes).size).toBe(1);
  expect(result.moduleSizes[0]).toBe(result.moduleInput);
  expect(new Set(result.cardWidths).size).toBe(1);
  expect(result.cardWidths[0]).toBeGreaterThan(before);
});

test('dragging a card corner inward reduces every QR code', async ({ page }) => {
  await selectQr(page);
  await page.locator('#mod-val').fill('3');
  await page.locator('#tpl-input').fill('SMALL-{{ 1:1:3 }}');
  await page.locator('#gen-btn2').click();

  const handle = page.locator('.card-resize').first();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const coarsePointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (coarsePointer) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y: startY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX - 60, y: startY }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 60, startY, { steps: 5 });
    await page.mouse.up();
  }

  const moduleSizes = await page.locator('.qr-shell').evaluateAll(nodes => nodes.map(node => Number(node.dataset.moduleSize)));
  expect(await page.locator('#mod-val').inputValue()).toBe('2');
  expect(moduleSizes).toEqual([2, 2, 2]);
});

test('dragging inward resizes wide Code 128 cards without fractionally scaling bars', async ({ page }) => {
  await selectType(page, 'Code 128');
  await page.locator('#mod-val').fill('3');
  await page.locator('#tpl-input').fill('CODE128-' + '1234567890'.repeat(12));
  await page.locator('#gen-btn2').click();

  const before = await page.evaluate(() => ({
    card: document.querySelector('.card').getBoundingClientRect().width,
    symbol: document.querySelector('.card-bc svg').getBoundingClientRect().width,
    intrinsic: parseFloat(document.querySelector('.card-bc svg').getAttribute('width')),
  }));
  await dragFirstResizeHandle(page, -80);
  const after = await page.evaluate(() => ({
    card: document.querySelector('.card').getBoundingClientRect().width,
    symbol: document.querySelector('.card-bc svg').getBoundingClientRect().width,
    intrinsic: parseFloat(document.querySelector('.card-bc svg').getAttribute('width')),
  }));

  expect(after.card).toBeLessThan(before.card - 40);
  expect(after.intrinsic).toBeLessThan(before.intrinsic);
  expect(after.symbol).toBe(after.intrinsic);
});

test('oversized symbols can be scrolled from their left edge to their right edge', async ({ page }) => {
  await selectType(page, 'Code 128');
  await page.locator('#mod-val').fill('3');
  await page.locator('#tpl-input').fill('SCROLL-' + '1234567890'.repeat(12));
  await page.locator('#gen-btn2').click();

  const metrics = await page.locator('.card-bc').evaluate(container => {
    const symbol = container.querySelector('svg');
    const containerRect = container.getBoundingClientRect();
    const startRect = symbol.getBoundingClientRect();
    container.scrollLeft = container.scrollWidth;
    const endRect = symbol.getBoundingClientRect();
    return {
      overflows: container.scrollWidth > container.clientWidth,
      startsAtLeftEdge: startRect.left >= containerRect.left,
      reachesRightEdge: endRect.right <= containerRect.right + 1,
    };
  });

  expect(metrics.overflows).toBe(true);
  expect(metrics.startsAtLeftEdge).toBe(true);
  expect(metrics.reachesRightEdge).toBe(true);
});

test('a tiny outward drag never shrinks a card wider than 480 pixels', async ({ page }) => {
  await selectType(page, 'Code 128');
  await page.locator('#mod-val').fill('3');
  await page.locator('#tpl-input').fill('WIDE-' + '1234567890'.repeat(12));
  await page.locator('#gen-btn2').click();

  const before = await page.evaluate(() => ({
    card: document.querySelector('.card').getBoundingClientRect().width,
    module: Number(document.querySelector('#mod-val').value),
  }));
  test.skip(before.card <= 480, 'viewport is not wide enough to exercise the 480px boundary');
  await dragFirstResizeHandle(page, 2);
  const after = await page.evaluate(() => ({
    card: document.querySelector('.card').getBoundingClientRect().width,
    module: Number(document.querySelector('#mod-val').value),
  }));

  expect(after.card).toBeGreaterThanOrEqual(before.card - 1);
  expect(after.module).toBe(before.module);
});

test('dragging inward resizes wide Data Matrix cards without fractionally scaling modules', async ({ page }) => {
  await selectType(page, 'Data Matrix');
  await page.locator('#mod-val').fill('12');
  await page.locator('#tpl-input').fill('DATAMATRIX-' + '1234567890'.repeat(12));
  await page.locator('#gen-btn2').click();

  const before = await page.evaluate(() => ({
    card: document.querySelector('.card').getBoundingClientRect().width,
    symbol: document.querySelector('.card-bc canvas').getBoundingClientRect().width,
    intrinsic: document.querySelector('.card-bc canvas').width,
  }));
  await dragFirstResizeHandle(page, -80);
  const after = await page.evaluate(() => ({
    card: document.querySelector('.card').getBoundingClientRect().width,
    symbol: document.querySelector('.card-bc canvas').getBoundingClientRect().width,
    intrinsic: document.querySelector('.card-bc canvas').width,
  }));

  expect(after.card).toBeLessThan(before.card - 40);
  expect(after.intrinsic).toBeLessThan(before.intrinsic);
  expect(after.symbol).toBe(after.intrinsic);
});

test('generated labels render hostile input as text rather than HTML', async ({ page }) => {
  await selectQr(page);
  const payload = '<img src=x onerror="window.__labelXss=1">';
  await page.locator('#tpl-input').fill(payload);
  await page.locator('#gen-btn2').click();

  await expect(page.locator('.card-lbl')).toHaveText(payload);
  await expect(page.locator('.card-lbl img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__labelXss || 0)).toBe(0);
});

test('QR PDF export includes the quiet zone and honours the selected spacing', async ({ page }) => {
  await selectQr(page);
  await page.locator('#mod-val').fill('3');
  await page.locator('#gap-val').fill('48');
  await page.locator('#tpl-input').fill('PDF-{{ 1:1:2 }}');
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
  await page.waitForFunction(() => window.__pdfSaved === true);

  const result = await page.evaluate(async () => {
    const calls = window.__pdfImages;
    const img = new Image();
    img.src = calls[0][0];
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const quietPx = 12;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let borderIsWhite = true;
    for (let y = 0; y < canvas.height && borderIsWhite; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (x >= quietPx && x < canvas.width - quietPx && y >= quietPx && y < canvas.height - quietPx) continue;
        const i = (y * canvas.width + x) * 4;
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) { borderIsWhite = false; break; }
      }
    }
    return {
      borderIsWhite,
      imageWidth: img.naturalWidth,
      firstX: calls[0][2],
      firstWidthMm: calls[0][4],
      secondX: calls[1][2],
    };
  });

  expect(result.borderIsWhite).toBe(true);
  expect(result.imageWidth).toBeGreaterThan(60);
  expect(result.secondX - result.firstX - result.firstWidthMm).toBeGreaterThanOrEqual(48 * 0.264 - 0.1);
});

test('presets preserve the chosen spacing', async ({ page }) => {
  await selectQr(page);
  await page.locator('#gap-val').fill('44');
  await page.locator('#presets-btn').click();
  await page.locator('#preset-name').fill('Warehouse QR');
  await page.locator('#preset-save-btn').click();

  const savedGap = await page.evaluate(() => JSON.parse(localStorage.getItem('lsp_presets_v1'))[0].gap);
  expect(savedGap).toBe(44);

  await page.locator('#gap-val').fill('24');
  await page.locator('.preset-info').click();
  await expect(page.locator('#gap-val')).toHaveValue('44');
});

test('template validation rejects non-progressing and excessive expansions', async ({ page }) => {
  await page.goto('/?validation=' + Date.now());
  const errors = await page.evaluate(() => {
    function message(template) {
      try { validateExpansion(parseTpl(template)); return ''; }
      catch (error) { return error.message; }
    }
    return {
      zeroStep: message('{{ 1:0:5 }}'),
      excessive: message('{{ repeat:A,B:600 }}'),
    };
  });
  expect(errors.zeroStep).toBe('Range step must be greater than zero.');
  expect(errors.excessive).toBe('A template can generate at most 1000 codes.');
});

test('repeat templates retain compact metadata before validation', async ({ page }) => {
  await page.goto('/?repeat=' + Date.now());
  const token = await page.evaluate(() => parseTpl('{{ repeat:A,B:3 }}')[0]);
  expect(token.items).toEqual(['A', 'B']);
  expect(token.repeat).toBe(3);
});
