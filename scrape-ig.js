const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEST = path.join(__dirname, 'assets', 'instagram');
if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'es-ES',
    // Disable webdriver flag
    javaScriptEnabled: true,
  });

  // Remove automation fingerprints
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  console.log('Navigating to Instagram...');
  await page.goto('https://www.instagram.com/currozooo/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Wait for content
  await page.waitForTimeout(5000);

  // Dismiss popups/cookie banners
  const dismissTexts = ['Rechazar cookies opcionales', 'Declinar cookies opcionales', 'Rechazar todo', 'Ahora no', 'Not Now', 'Cerrar'];
  for (const txt of dismissTexts) {
    try {
      const btn = page.getByRole('button', { name: txt }).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click();
        await page.waitForTimeout(1000);
        console.log(`Dismissed: ${txt}`);
      }
    } catch {}
  }

  await page.waitForTimeout(2000);

  // Check what page we're on
  const url = page.url();
  const title = await page.title();
  console.log(`URL: ${url}`);
  console.log(`Title: ${title}`);

  // Full page screenshot for debug
  await page.screenshot({
    path: path.join(DEST, 'ig-debug.jpg'),
    type: 'jpeg', quality: 80,
    fullPage: false
  });
  console.log('Debug screenshot saved');

  // Find all visible images >= 200px
  const imgHandles = await page.$$('img');
  console.log(`Total img tags: ${imgHandles.length}`);

  let saved = 0;
  let profileDone = false;

  for (const img of imgHandles) {
    if (saved >= 9 && profileDone) break;
    try {
      const box = await img.boundingBox();
      if (!box || box.width < 100 || box.height < 100) continue;

      const alt = await img.getAttribute('alt') || '';
      const isProfile = alt.toLowerCase().includes('perfil') && alt.toLowerCase().includes('currozooo');
      const isPost = box.width >= 200 && box.height >= 200 && !isProfile;

      if (isProfile && !profileDone) {
        await img.screenshot({ path: path.join(DEST, 'profile.jpg'), type: 'jpeg', quality: 95 });
        console.log(`✓ profile.jpg — ${Math.round(box.width)}x${Math.round(box.height)} — "${alt.substring(0,50)}"`);
        profileDone = true;
      } else if (isPost && saved < 9) {
        const fname = `post-${saved + 1}.jpg`;
        await img.screenshot({ path: path.join(DEST, fname), type: 'jpeg', quality: 92 });
        console.log(`✓ ${fname} — ${Math.round(box.width)}x${Math.round(box.height)} — "${alt.substring(0,50)}"`);
        saved++;
      }
    } catch {}
  }

  console.log(`\nResult: ${saved} posts + ${profileDone ? 1 : 0} profile`);
  await browser.close();
})();
