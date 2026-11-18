const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'out1');
const DASHBOARD_DIR = path.join(OUT_DIR, 'dashboard');
const SCREENSHOT_DIR = path.join(OUT_DIR, 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  // 1. Default board view
  console.log('Capturing default board view...');
  await page.goto(`file://${DASHBOARD_DIR}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1-board.png'), fullPage: false });
  console.log('  -> 1-board.png');

  // 2. Detail view of highest-implied FARM row (cian-yield-layer)
  console.log('Capturing detail view for cian-yield-layer...');
  await page.goto(`file://${DASHBOARD_DIR}/index.html?mode=detail&slug=cian-yield-layer`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '2-detail.png'), fullPage: false });
  console.log('  -> 2-detail.png');

  // 3. Filtered view FARM
  console.log('Capturing filtered FARM view...');
  await page.goto(`file://${DASHBOARD_DIR}/index.html?mode=filter&verdict=FARM`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '3-filter.png'), fullPage: false });
  console.log('  -> 3-filter.png');

  await browser.close();

  // Verify screenshots
  const files = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png')).sort();
  console.log('\nScreenshot verification:');
  const stats = files.map(f => {
    const s = fs.statSync(path.join(SCREENSHOT_DIR, f));
    const hash = require('crypto').createHash('md5').update(fs.readFileSync(path.join(SCREENSHOT_DIR, f))).digest('hex');
    console.log(`  ${f}: ${s.size} bytes, md5 ${hash}`);
    return { name: f, size: s.size, md5: hash };
  });

  // Check they're all different
  const md5s = stats.map(s => s.md5);
  const sizes = stats.map(s => s.size);
  if (new Set(md5s).size !== md5s.length) {
    console.error('FAIL: Duplicate md5 hashes!');
    process.exit(1);
  }
  if (new Set(sizes).size !== sizes.length) {
    console.error('FAIL: Duplicate file sizes!');
    process.exit(1);
  }
  if (stats.some(s => s.size > 524288)) {
    console.error('FAIL: Screenshot exceeds 512 KiB!');
    process.exit(1);
  }
  console.log('\nAll screenshots valid and distinct.');
}

takeScreenshots().catch(e => { console.error(e); process.exit(1); });