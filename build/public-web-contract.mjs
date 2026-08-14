export const PUBLIC_LEGACY_HTML_FILES = Object.freeze([
  '404.html',
  'admin.html',
  'analytics.html',
  'areas-grh.html',
  'auditoria.html',
  'ciudadano.html',
  'configuracion.html',
  'control.html',
  'cuentas-claras.html',
  'dashboard.html',
  'decisiones-grh.html',
  'exportar.html',
  'form-public.html',
  'forms.html',
  'grh-ejecutivo.html',
  'hacienda.html',
  'ia.html',
  'ia-hf.html',
  'importar.html',
  'index_loaded.html',
  'informe-rrhh.html',
  'inicio.html',
  'inteligencia.html',
  'landing.html',
  'licitaciones.html',
  'login.html',
  'manuales.html',
  'movimientos-grh.html',
  'mapa.html',
  'obras.html',
  'offline.html',
  'organigrama.html',
  'presentacion.html',
  'presupuesto.html',
  'proveedores.html',
  'reportes.html',
  'roles.html',
  'rrhh.html',
  'rrhh-sync.html',
  'servicios.html',
  'talleres.html',
  'upload.html',
  'vecinos.html',
  'whatsapp.html',
]);

export const GOVERNED_LEGACY_HTML_FILES = Object.freeze([
  'login.html',
  'dashboard.html',
  'inicio.html',
  'areas-grh.html',
  'decisiones-grh.html',
  'movimientos-grh.html',
  'roles.html',
  'manuales.html',
]);

export const GOVERNED_VITE_HTML_FILES = Object.freeze([
  'calidad.html',
  'conceptos-fijos.html',
  'corridas-grh.html',
  'ejecutivo.html',
  'estructura.html',
  'gestiones.html',
  'jardines.html',
  'trayectoria.html',
  'territorio.html',
]);

export const GOVERNED_HTML_FILES = Object.freeze([
  ...GOVERNED_LEGACY_HTML_FILES,
  ...GOVERNED_VITE_HTML_FILES,
]);

export const VITE_ENTRY_HTML_FILES = Object.freeze([...GOVERNED_VITE_HTML_FILES]);

export const PUBLIC_DIRECTORIES = Object.freeze(['css', 'js', 'img']);

export const PUBLIC_ROOT_FILES = Object.freeze([
  'manifest.json',
  'sw.js',
  'favicon.jpg',
  'botia-test.png',
]);

const allowedHtmlByLowerName = new Map(
  PUBLIC_LEGACY_HTML_FILES.map(fileName => [fileName.toLowerCase(), fileName]),
);

export function assertClassifiedRootHtmlNames(fileNames) {
  if (!Array.isArray(fileNames) || !fileNames.every(fileName => typeof fileName === 'string')) {
    throw new TypeError('La clasificacion web requiere una lista de nombres de archivo.');
  }

  const actualHtml = fileNames
    .filter(fileName => fileName.toLowerCase().endsWith('.html'))
    .sort((left, right) => left.localeCompare(right));
  const indexEntry = actualHtml.find(fileName => fileName.toLowerCase() === 'index.html');
  if (indexEntry) {
    throw new Error('index.html esta prohibido: la raiz publica se gobierna por rewrite hacia /login.');
  }

  const unexpected = actualHtml.filter(fileName => !allowedHtmlByLowerName.has(fileName.toLowerCase()));
  if (unexpected.length > 0) {
    throw new Error(`HTML raiz no clasificado para publicacion: ${unexpected.join(', ')}.`);
  }

  const actualByLowerName = new Map();
  for (const fileName of actualHtml) {
    const lowerName = fileName.toLowerCase();
    if (actualByLowerName.has(lowerName)) {
      throw new Error(`HTML raiz duplicado por mayusculas/minusculas: ${fileName}.`);
    }
    actualByLowerName.set(lowerName, fileName);
  }

  const missing = PUBLIC_LEGACY_HTML_FILES.filter(fileName => !actualByLowerName.has(fileName.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`Falta HTML legacy clasificado en la raiz: ${missing.join(', ')}.`);
  }

  const wrongCase = PUBLIC_LEGACY_HTML_FILES.filter(fileName => (
    actualByLowerName.get(fileName.toLowerCase()) !== fileName
  ));
  if (wrongCase.length > 0) {
    throw new Error(`HTML legacy con nombre no canonico: ${wrongCase.join(', ')}.`);
  }

  return Object.freeze([...PUBLIC_LEGACY_HTML_FILES]);
}
