// api/whatsapp-test.js
// Diagnostic endpoint to test WhatsApp API configuration
// Usage: GET /api/whatsapp-test?to=PHONE_NUMBER

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Use GET' });
  }

  const reqUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const targetPhone = reqUrl.searchParams.get('to') || req.query?.to;

  // Step 1: Check env vars
  const diagnostics = {
    timestamp: new Date().toISOString(),
    env: {
      WHATSAPP_ACCESS_TOKEN: token ? ('SET (' + token.length + ' chars, starts: ' + token.substring(0, 10) + '...)') : 'NOT SET',
      WHATSAPP_PHONE_ID: phoneId || 'NOT SET',
      WHATSAPP_VERIFY_TOKEN: verifyToken ? 'SET' : 'NOT SET'
    },
    tests: {}
  };

  if (!token || !phoneId) {
    diagnostics.tests.config = 'FAIL - Missing token or phoneId';
    return res.status(200).json(diagnostics);
  }

  diagnostics.tests.config = 'OK';

  // Step 2: Test token validity by getting phone number info
  try {
    const infoUrl = 'https://graph.facebook.com/v21.0/' + phoneId;
    const infoRes = await fetch(infoUrl, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const infoText = await infoRes.text();
    diagnostics.tests.tokenValid = infoRes.ok ? 'OK' : 'FAIL';
    diagnostics.tests.phoneInfo = infoRes.ok ? JSON.parse(infoText) : infoText;
  } catch (e) {
    diagnostics.tests.tokenValid = 'ERROR: ' + e.message;
  }

  // Step 3: If phone number provided, try to send a test message
  if (targetPhone) {
    try {
      const url = 'https://graph.facebook.com/v21.0/' + phoneId + '/messages';
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: targetPhone,
        type: 'text',
        text: { preview_url: false, body: 'MuniControl Test - Si ves este mensaje, el bot esta funcionando correctamente!' }
      };

      const sendRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const sendText = await sendRes.text();
      diagnostics.tests.sendMessage = {
        status: sendRes.status,
        ok: sendRes.ok,
        to: targetPhone,
        response: sendText
      };

      // If failed with 131030, try alternate format
      if (!sendRes.ok && sendText.indexOf('131030') >= 0) {
        let altNumber = null;
        if (targetPhone.startsWith('549')) {
          altNumber = '54' + targetPhone.substring(3);
        } else if (targetPhone.startsWith('54')) {
          altNumber = '549' + targetPhone.substring(2);
        }

        if (altNumber) {
          const retryPayload = { ...payload, to: altNumber };
          const retryRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retryPayload)
          });
          const retryText = await retryRes.text();
          diagnostics.tests.sendMessageRetry = {
            status: retryRes.status,
            ok: retryRes.ok,
            to: altNumber,
            response: retryText
          };
        }
      }
    } catch (e) {
      diagnostics.tests.sendMessage = 'ERROR: ' + e.message;
    }
  } else {
    diagnostics.tests.sendMessage = 'SKIPPED - Add ?to=PHONE_NUMBER to test sending';
  }

  return res.status(200).json(diagnostics);
}
