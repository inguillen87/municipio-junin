const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));

  const serverDir = path.resolve('.');
  const http = require('http');
  const server = http.createServer((req, res) => {
    const urlPath = req.url.replace(/^\//, '') || 'index.html';
    const file = path.join(serverDir, urlPath);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      let c = 'text/html';
      if (file.endsWith('.js')) c = 'application/javascript';
      if (file.endsWith('.css')) c = 'text/css';
      res.setHeader('content-type', c);
      res.end(fs.readFileSync(file));
    } else {
      res.statusCode = 404; res.end('not found');
    }
  });
  await new Promise(r => server.listen(9123, r));

  try {
    await page.goto('http://127.0.0.1:9123/index.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // dump visible bot button presence
    const hasFAB = await page.$eval('[data-botia-toggle], .botia-toggle, [aria-label*="bot"], [aria-label*="Bot"]', el => el ? 'FOUND' : null).catch(() => null);
    console.log('BotIA toggle button:', hasFAB || 'not found');

    // open widget
    let opened = false;
    try {
      await page.click('[data-botia-toggle]');
      opened = true;
    } catch (e) {
      try { await page.click('.botia-toggle button'); opened = true; } catch {}
    }
    console.log('Widget opened:', opened);

    if (opened) {
      await page.waitForSelector('.botia-chat, .botia-window, .ai-chat, textarea, input[placeholder*="Pregunta"]', { timeout: 3000 }).catch(() => {});
      const question = '¿Cuándo fue fundado Junín?';
      let typed = false;
      for (const sel of ['textarea.botia-input', 'input.botia-input', 'textarea[placeholder*="Pregunta"]', '.botia-input textarea', 'textarea']) {
        try { await page.fill(sel, ''); await page.type(sel, question, { delay: 40 }); typed = true; break; } catch {}
      }
      console.log('Question typed:', typed);

      if (typed) {
        for (const btn of ['.botia-send button', '.botia-send', '.bot-send', '.send-btn', 'button[type="submit"]', 'button']) {
          try { await page.click(btn); break; } catch {}
        }
        await page.waitForTimeout(2500);
        // read the last assistant bubble
        const resp = await page.$$eval('.botia-msg, .botia-message, .ai-msg, .bot-message .content, [class*="message"]', els =>
          els.map(e => e.textContent).pop()
        ).catch(() => null);
        console.log('Bot response snippet:', (resp + '').slice(0, 200));
      }
    }

    await page.screenshot({ path: 'botia-test.png', fullPage: true });
    console.log('\n--- Console logs ---');
    console.log(logs.join('\n').slice(-1500));
  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
})();
