'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');

function retiredTenantlessRoute(surface) {
  const router = express.Router();

  router.use(authenticate);
  router.use((req, res) => res.status(410).json({
    ok: false,
    code: 'TENANT_DATASET_REQUIRED',
    surface,
    error: 'Módulo retirado: no existe todavía un contrato de datos aislado por municipio.',
  }));

  return router;
}

module.exports = retiredTenantlessRoute;
