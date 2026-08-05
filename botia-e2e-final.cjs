const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const serverDir = path.resolve('.');
const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? 'index.html' : (req.url.replace(/^\//, '') || 'index.html');
  const file = path.join(serverDir, urlPath);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    let c = 'text/html';
    if (file.endsWith('.js')) c = 'application/javascript';
    if (file.endsWith('.css')) c = 'text/css';
    if (file.endsWith('.png')) c = 'image/png';
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) c = 'image/jpeg';
    if (file.endsWith('.svg')) c = 'image/svg+xml';
    if (file.endsWith('.json')) c = 'application/json';
    res.setHeader('content-type', c);
    res.end(fs.readFileSync(file));
  } else { res.statusCode = 404; res.end('not found ' + file); }
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const logs = [];
  const page = await context.newPage();
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));

  await new Promise(r => server.listen(9128, r));
  try {
    const resp = await page.goto('http://127.0.0.1:9128/index.html', { waitUntil: 'networkidle', timeout: 25000 });
    console.log('Page status:', resp.status());
    await page.waitForTimeout(1200);

    // ai-widget.js creates #aiToggle dynamically; wait for it
    await page.waitForSelector('#aiToggle', { state: 'attached', timeout: 8000 }).catch(e => console.log('waitForSelector #aiToggle:', e.message.slice(0,120)));
    const hasToggle = await page.$('#aiToggle');
    console.log('aiToggle present:', !!hasToggle);

    if (hasToggle) {
      await page.click('#aiToggle');
      await page.waitForTimeout(700);
      const winOpen = await page.$eval('#aiChatWindow', el => el.classList.contains('open') ? 'open' : 'closed').catch(()=>'?');
      console.log('Chat window:', winOpen);

      await page.fill('#aiQuestion', '¿Cuál es la historia de Junín?');
      // click send button, fall back to Enter
      const clicked = await page.$eval('#aiSendBtn', el => el).catch(()=>null);
      if (clicked) await page.click('#aiSendBtn'); else await page.press('#aiQuestion','Enter');
      await page.waitForTimeout(2200);

      const msgs = await page.$$eval('#aiMessages .message, #aiMessages .ai-message, .message.user, .message.bot', els =>
        els.map(e => e.textContent.trim()).filter(Boolean)
      ).catch(()=>[]);
      console.log('\n=== Mensajes del chat ===');
      console.log((msgs.length ? msgs.join('\n---\n') : '(no bubbles found)') + '');

      fs.writeFileSync('debug_loaded.html', await page.content());
      await page.screenshot({ path: 'botia-test.png', fullPage: true });
    }

    console.log('\n=== Console logs (últimos 25) ===');
    console.log(logs.slice(-25).join('\n') || '(empty)');
  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
})();
