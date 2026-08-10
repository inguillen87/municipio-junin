import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { buildPortableGrhViews } from './lib/grh-portable-bundle.js';
import tenantPresentationPolicy from '../shared/tenant-presentation-policy.cjs';

const REPORT_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
const JUNIN_PRESENTATION = tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' });

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value, maximumFractionDigits = 0) {
  if (!Number.isFinite(value)) return 'No publicado';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits }).format(value);
}

function formatCurrencyCents(value) {
  if (!Number.isSafeInteger(value) || value < 0) return 'No publicado';
  return new Intl.NumberFormat(JUNIN_PRESENTATION.locale, {
    style: 'currency',
    currency: JUNIN_PRESENTATION.displayCurrencyCode,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100).replace(/\s+/g, ' ');
}

function latestReleasedCompensation(executive) {
  return executive.compensation.series
    .filter(row => row.privacyStatus === 'released')
    .slice()
    .sort((left, right) => left.period.localeCompare(right.period))
    .at(-1) || null;
}

export function buildGrhPrintableHtml(bundle, {
  generatedAt = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }),
} = {}) {
  const { executive, quality } = buildPortableGrhViews(bundle);
  const latestControl = latestReleasedCompensation(executive);
  if (!latestControl) {
    const error = new Error('No hay un período de compensación liberado por privacidad.');
    error.code = 'GRH_PRINTABLE_PERIOD_UNAVAILABLE';
    throw error;
  }

  const netControlCents = latestControl.amounts.netPayrollCents;
  const reconciliation = quality.reconciliation.scorePct;
  const tolerance = quality.quality.risks.latestCalculationControlWithinRoundingTolerance;
  const policyLabel = `${executive.policyVersion} · k=${executive.privacy.portableThreshold}`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Informe Ejecutivo GRH — MuniControl</title>
  <style>
    @page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;background:#eef2f7;color:#172033;font:14px/1.5 Inter,Arial,sans-serif}.toolbar{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#101b31;color:#fff}.toolbar button{border:0;border-radius:8px;padding:10px 16px;background:#2f7de1;color:#fff;font-weight:700;cursor:pointer}.sheet{max-width:900px;margin:24px auto;background:#fff;padding:42px;border:1px solid #d9e1ec;border-radius:16px;box-shadow:0 18px 48px rgba(22,39,67,.12)}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #2f7de1;padding-bottom:20px}h1{font-size:25px;margin:0 0 6px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#2f7de1;font-weight:800}.muted{color:#65748b}.status{padding:7px 11px;border:1px solid #e1a94d;background:#fff8e8;color:#805810;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:28px 0}.metric{padding:18px;background:#f6f8fc;border:1px solid #e0e6ef;border-radius:12px}.metric strong{display:block;font-size:22px;margin-top:5px}.metric span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6a788d;font-weight:800}.note{padding:16px 18px;border-left:4px solid #2f7de1;background:#eef6ff;border-radius:8px;margin:20px 0}.quality{width:100%;border-collapse:collapse;margin-top:16px}.quality th,.quality td{text-align:left;padding:10px;border-bottom:1px solid #e3e8f0}.quality th{font-size:11px;text-transform:uppercase;color:#68788f}.source{margin-top:28px;padding-top:18px;border-top:1px solid #dfe5ee;font:11px/1.6 ui-monospace,Consolas,monospace;color:#637188;overflow-wrap:anywhere}@media(max-width:700px){.sheet{margin:0;border-radius:0;padding:24px}.grid{grid-template-columns:1fr}header{flex-direction:column}}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;padding:0;border:0;box-shadow:none;max-width:none}}
  </style>
</head>
<body>
  <div class="toolbar"><span>Vista imprimible · Informe portable gobernado</span><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <main class="sheet">
    <header>
      <div><div class="eyebrow">Municipalidad de Junín · MuniControl</div><h1>Informe Ejecutivo GRH</h1><div class="muted">Generado ${escapeHtml(generatedAt)}</div></div>
      <div class="status">Snapshot · no tiempo real</div>
    </header>
    <section class="grid" aria-label="Indicadores principales">
      <div class="metric"><span>Legajos registrados</span><strong>${formatNumber(quality.referential.legajo.rows)}</strong></div>
      <div class="metric"><span>Participantes · ${escapeHtml(latestControl.period)}</span><strong>${formatNumber(latestControl.participantCount)}</strong></div>
      <div class="metric"><span>Neto de control · ARS</span><strong>${formatCurrencyCents(netControlCents)}</strong></div>
      <div class="metric"><span>Calidad del extracto</span><strong>${formatNumber(quality.quality.score, 2)}/100</strong></div>
      <div class="metric"><span>Cuarentena temporal</span><strong>${formatNumber(quality.quality.risks.quarantinedTemporalRows)}</strong></div>
      <div class="metric"><span>Conciliación cross-source</span><strong>${formatNumber(reconciliation, 2)}%</strong></div>
    </section>
    <div class="note"><strong>Lectura responsable.</strong> “Legajos registrados” no equivale a empleados activos. Junín configura la presentación en pesos argentinos (ARS), aunque el dump original no declara un código de moneda. Los importes son controles agregados de períodos con al menos ${executive.privacy.portableThreshold} participantes y no acreditan pago bancario.</div>
    <h2>Controles de calidad</h2>
    <table class="quality">
      <thead><tr><th>Control</th><th>Resultado</th></tr></thead>
      <tbody>
        <tr><td>Integridad referencial</td><td>${formatNumber(quality.quality.components.referentialIntegrity.score, 2)}/100</td></tr>
        <tr><td>Validez temporal</td><td>${formatNumber(quality.quality.components.temporalValidity.score, 2)}/100</td></tr>
        <tr><td>Conciliación cálculo ↔ totpago</td><td>${formatNumber(reconciliation, 2)}/100</td></tr>
        <tr><td>Estado de la serie totpago</td><td>Sólo diagnóstica · no ejecutiva</td></tr>
        <tr><td>Control más reciente dentro de tolerancia</td><td>${tolerance ? 'Sí' : 'No'}</td></tr>
        <tr><td>PII publicada</td><td>No · salida agregada portable</td></tr>
      </tbody>
    </table>
    <div class="source">Fuente canónica: ${escapeHtml(quality.source.sourceFile)}<br>Corte: ${escapeHtml(quality.source.snapshotAsOf)}<br>SHA-256: ${escapeHtml(quality.source.sourceSha256)}<br>Contratos: ${escapeHtml(quality.lineage.profileSchemaVersion)} + ${escapeHtml(quality.lineage.semanticSchemaVersion)} + ${escapeHtml(executive.schemaVersion)} + ${escapeHtml(quality.schemaVersion)}<br>Privacidad: ${escapeHtml(policyLabel)}<br>personas_junin: excluida</div>
  </main>
</body>
</html>`;
}

export function createPdfReportHandler({
  requireRoleImpl = requireRole,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
} = {}) {
  return async function handler(req, res) {
    noStore(res);
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }

    const caller = await requireRoleImpl(req, res, REPORT_ROLES);
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    const type = String(req.query?.type || 'rrhh').toLowerCase();
    if (!['rrhh', 'resumen'].includes(type)) {
      return res.status(422).json({
        error: 'No existe una fuente gobernada para este informe',
        code: 'REPORT_TYPE_NOT_AVAILABLE',
        availableReports: ['rrhh', 'resumen'],
      });
    }

    try {
      const bundle = await readArtifactBundleImpl(process.env.GRH_TENANT_ID);
      const html = buildGrhPrintableHtml(bundle);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="informe-ejecutivo-grh.html"');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
      return res.status(200).send(html);
    } catch (error) {
      console.error('[GRH-PDF] Proyección portable no disponible');
      return res.status(503).json({
        error: 'Informe GRH no disponible',
        code: 'GRH_PRINTABLE_CONTRACT_UNAVAILABLE',
      });
    }
  };
}

export default createPdfReportHandler();
