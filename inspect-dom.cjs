const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const serverDir = path.resolve('.');
const server = http.createServer((req, res) => {
  const urlPath = req.url.replace(/^\//, '') || 'index.html';
  const file = path.join(serverDir, urlPath);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    let c = 'text/html';
    if (file.endsWith('.js')) c = 'application/javascript';
    if (file.endsWith('.css')) c = 'text/css';
    res.setHeader('content-type', c);
    res.end(fs.readFileSync(file));
  } else { res.statusCode = 404; res.end('not found'); }
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const logs = [];
  const page = await context.newPage();
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));

  await new Promise(r => server.listen(9124, r));
  try {
    await page.goto('http://127.0.0.1:9124/index.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1800);

    fs.writeFileSync('index_loaded.html', await page.content());

    // search the whole DOM for anything related to bot IA
    const hints = await page.evaluate(() => {
      const out = {};
      const candidates = document.querySelectorAll('*');
      candidates.forEach(el => {
        const cl = el.className || '';
        const txt = (el.textContent||'').slice(0,40).trim();
        ['botia','bot-ia','ai-widget','chat','asistente','mensajes','bot-toggle','floating'].forEach(k => {
          if (String(cl).toLowerCase().includes(k)) out[k] = out[k] || `${el.tagName}.${cl.replace(/\\s+/g,'.')} > "${txt}"`;
        });
        const id = el.id || '';
        if (id && (id.toLowerCase().includes('bot')||id.toLowerCase().includes('ia')||id.toLowerCase().includes('chat'))) out[id] = `${el.tagName}#${id}`;
      });
      // find elements whose aria-label or text contains bot/ia/asistente
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      btns.forEach(b => {
        const lab = (b.getAttribute('aria-label')||'') + '|' + (b.textContent||'');
        if (/bot|asistente|ia/i.test(lab)) out.btn = `${b.tagName}.${b.className} aria="${b.getAttribute('aria-label')}" txt="${b.textContent.slice(0,20).trim()}"`;
      });
      return out;
    });
    console.log('HINTS:', JSON.stringify(hints, null, 2));

    // also: does ai-widget.js appear loaded / is there an AiWidget global
    const globals = await page.evaluate(() => ({
      AiWidget: typeof window.AiWidget,
      aiWidget: typeof window.aiWidget,
      initAIBot: typeof window.initAIBot,
      initBotIA: typeof window.initBotIA,
      cargarIA: typeof window.cargarIA
    }));
    console.log('GLOBALS:', JSON.stringify(globals));

    console.log('Console logs:');
    console.log(logs.slice(-30).join('\n'));
  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    await browser.close();
    server.close();
  }
})();
