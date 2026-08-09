'use strict';

const express = require('express');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticate, requireRole('TENANT_ADMIN'));

function retired(req, res) {
  return res.status(410).json({
    ok: false,
    error: 'Canal legacy retirado: use el generador autenticado /api/email-report con datos validados.',
  });
}

router.post('/send', retired);
router.post('/weekly-report', retired);

router.get('/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({
    ok: true,
    legacyDisabled: true,
    canonicalEndpoint: '/api/email-report',
  });
});

module.exports = router;
