import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { IncomingForm } from 'formidable';

import { noStore, requireRole } from './lib/auth.js';
import {
  SOURCE_INTAKE_METADATA_KEYS,
  SOURCE_INTAKE_MODES,
  buildSourceIntakeEnvelope,
  normalizeProfiledSourceIntake,
} from './lib/source-intake-contract.js';
import {
  SOURCE_INTAKE_ALLOWED_EXTENSIONS,
  SOURCE_INTAKE_MAX_FILE_BYTES,
  profileSourceIntake,
  validateSourceIntakeMetadata,
} from './lib/source-intake-profiler.js';
import sourceIntakeStore from './lib/source-intake-store.js';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { isPublishedDemoIdentity } = publishedDemoPolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const CONTRACT_VALUE = API_CONTRACTS['/api/source-intake'] || 'municipal-source-intake-v1';
const PRIVATE_ROLES = Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']);
const PUBLISHED_AUTH_METHOD = 'published-evaluation-jwt-db';
const MAX_FIELDS_BYTES = 16 * 1024;
const MULTIPART_CONTENT_TYPE = /^multipart\/form-data\s*;\s*boundary=(?:"[^"]{1,200}"|[^\s;]{1,200})(?:\s*;.*)?$/i;
const NORMALIZED_ALLOWED_EXTENSIONS = new Set(
  [...SOURCE_INTAKE_ALLOWED_EXTENSIONS].map(value => String(value).replace(/^\./, '').toLowerCase()),
);

export const config = Object.freeze({
  api: Object.freeze({ bodyParser: false }),
});

function setHeaders(res) {
  res.setHeader(HEADER_NAME, CONTRACT_VALUE);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

function boundedIdentity(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 &&
    value.length <= 160 && !/[\u0000-\u0020\u007f]/u.test(value);
}

function hasUnsupportedQuery(req) {
  try {
    const query = req?.query;
    return (query && typeof query === 'object' && Reflect.ownKeys(query).length > 0) ||
      (query !== undefined && query !== null && typeof query !== 'object' && String(query).length > 0) ||
      (typeof req?.url === 'string' && req.url.includes('?'));
  } catch {
    return true;
  }
}

function isPublishedEvaluation(caller, identityCheck = isPublishedDemoIdentity) {
  return caller?.authMethod === PUBLISHED_AUTH_METHOD || identityCheck(caller?.email);
}

function normalizeFieldValue(fields, key) {
  const raw = fields[key];
  if (!Array.isArray(raw) || raw.length !== 1 || typeof raw[0] !== 'string') {
    throw new Error('SOURCE_INTAKE_MULTIPART_INVALID');
  }
  if (key === 'containsPersonalData') {
    if (raw[0] === 'true') return true;
    if (raw[0] === 'false') return false;
    throw new Error('SOURCE_INTAKE_MULTIPART_INVALID');
  }
  return raw[0];
}

function normalizeMultipartResult(fields, files) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) ||
      !files || typeof files !== 'object' || Array.isArray(files)) {
    throw new Error('SOURCE_INTAKE_MULTIPART_INVALID');
  }
  const fieldKeys = Reflect.ownKeys(fields);
  if (fieldKeys.length !== SOURCE_INTAKE_METADATA_KEYS.length ||
      fieldKeys.some(key => typeof key !== 'string' || !SOURCE_INTAKE_METADATA_KEYS.includes(key))) {
    throw new Error('SOURCE_INTAKE_MULTIPART_INVALID');
  }
  const fileKeys = Reflect.ownKeys(files);
  if (fileKeys.length !== 1 || fileKeys[0] !== 'file') {
    throw new Error('SOURCE_INTAKE_MULTIPART_INVALID');
  }
  const fileList = Array.isArray(files.file) ? files.file : [files.file];
  if (fileList.length !== 1 || !fileList[0] || typeof fileList[0] !== 'object') {
    throw new Error('SOURCE_INTAKE_MULTIPART_INVALID');
  }
  const file = fileList[0];
  const filePath = file.filepath || file.path;
  const originalFilename = file.originalFilename || file.name;
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) ||
      path.dirname(path.resolve(filePath)) !== path.resolve(os.tmpdir()) ||
      typeof originalFilename !== 'string' || originalFilename.length < 1 || originalFilename.length > 255) {
    throw new Error('SOURCE_INTAKE_MULTIPART_INVALID');
  }
  const extension = path.extname(originalFilename).slice(1).toLowerCase();
  if (!NORMALIZED_ALLOWED_EXTENSIONS.has(extension)) {
    const error = new Error('SOURCE_INTAKE_EXTENSION_UNSUPPORTED');
    error.code = 'SOURCE_INTAKE_EXTENSION_UNSUPPORTED';
    throw error;
  }
  return {
    filePath,
    extension,
    metadata: Object.fromEntries(
      SOURCE_INTAKE_METADATA_KEYS.map(key => [key, normalizeFieldValue(fields, key)]),
    ),
  };
}

async function removeUploadedFiles(files, removeFile = fs.rm) {
  if (!files || typeof files !== 'object') return;
  const paths = [];
  for (const entry of Object.values(files)) {
    const list = Array.isArray(entry) ? entry : [entry];
    for (const file of list) {
      const filePath = file?.filepath || file?.path;
      if (typeof filePath === 'string' && path.isAbsolute(filePath)) paths.push(filePath);
    }
  }
  await Promise.allSettled([...new Set(paths)].map(filePath => removeFile(filePath, { force: true })));
}

export async function parseSourceIntakeMultipart(req, {
  IncomingFormClass = IncomingForm,
  removeFile = fs.rm,
} = {}) {
  const contentType = req?.headers?.['content-type'];
  if (typeof contentType !== 'string' || contentType.length > 320 || !MULTIPART_CONTENT_TYPE.test(contentType)) {
    const error = new Error('SOURCE_INTAKE_CONTENT_TYPE_INVALID');
    error.code = 'SOURCE_INTAKE_CONTENT_TYPE_INVALID';
    throw error;
  }

  const form = new IncomingFormClass({
    uploadDir: os.tmpdir(),
    multiples: false,
    maxFiles: 1,
    maxFields: SOURCE_INTAKE_METADATA_KEYS.length,
    maxFieldsSize: MAX_FIELDS_BYTES,
    maxFileSize: SOURCE_INTAKE_MAX_FILE_BYTES,
    maxTotalFileSize: SOURCE_INTAKE_MAX_FILE_BYTES,
    allowEmptyFiles: false,
    minFileSize: 1,
    keepExtensions: false,
  });

  let parsedFiles;
  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (error, parsedFields, currentFiles) => {
        parsedFiles = currentFiles;
        if (error) reject(error);
        else resolve([parsedFields, currentFiles]);
      });
    });
    return normalizeMultipartResult(fields, files);
  } catch (error) {
    await removeUploadedFiles(parsedFiles, removeFile);
    throw error;
  }
}

function profilerErrorStatus(error) {
  const code = error?.code || error?.message;
  if (code === 'SOURCE_INTAKE_FILE_TOO_LARGE' || error?.httpCode === 413 ||
      code === 1009 || code === 1016) return 413;
  if (['SOURCE_INTAKE_EXTENSION_UNSUPPORTED', 'SOURCE_INTAKE_CONTENT_TYPE_INVALID'].includes(code)) return 415;
  return 422;
}

function respondInputError(res, error) {
  const status = profilerErrorStatus(error);
  return res.status(status).json({
    error: status === 413
      ? 'El archivo supera el limite de 4 MiB.'
      : status === 415
        ? 'El formato de carga no esta permitido.'
        : 'La carga no cumple el contrato de ingreso gobernado.',
    code: status === 413
      ? 'SOURCE_INTAKE_FILE_TOO_LARGE'
      : status === 415
        ? 'SOURCE_INTAKE_FORMAT_UNSUPPORTED'
        : 'SOURCE_INTAKE_INPUT_INVALID',
  });
}

function respondUnavailable(res) {
  return res.status(503).json({
    error: 'El registro de ingresos gobernados no esta disponible.',
    code: 'SOURCE_INTAKE_UNAVAILABLE',
  });
}

export function createSourceIntakeHandler({
  requireRoleImpl = requireRole,
  parseMultipartImpl = parseSourceIntakeMultipart,
  validateMetadataImpl = validateSourceIntakeMetadata,
  profileSourceImpl = profileSourceIntake,
  storeImpl = sourceIntakeStore,
  isPublishedDemoIdentityImpl = isPublishedDemoIdentity,
  removeFileImpl = fs.rm,
} = {}) {
  return async function handler(req, res) {
    setHeaders(res);
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (hasUnsupportedQuery(req)) {
      return res.status(400).json({
        error: 'Este contrato no admite parametros de consulta.',
        code: 'SOURCE_INTAKE_QUERY_UNSUPPORTED',
      });
    }

    const caller = await requireRoleImpl(req, res, PRIVATE_ROLES);
    if (!caller) return;
    const published = isPublishedEvaluation(caller, isPublishedDemoIdentityImpl);
    if (published && req.method === 'POST') {
      return res.status(403).json({
        error: 'La evaluacion publicada es solo lectura y no procesa archivos.',
        code: 'SOURCE_INTAKE_PUBLISHED_PREVIEW_DISABLED',
      });
    }
    if (published && caller.role !== 'TENANT_ADMIN') {
      return res.status(403).json({
        error: 'La evaluacion publicada no habilita esta operacion para el perfil.',
        code: 'SOURCE_INTAKE_PUBLISHED_ROLE_DENIED',
      });
    }
    if (!boundedIdentity(caller.tenantId) || !boundedIdentity(caller.id)) {
      return res.status(403).json({
        error: 'La identidad no tiene un tenant operativo valido.',
        code: 'SOURCE_INTAKE_TENANT_REQUIRED',
      });
    }

    const mode = published ? SOURCE_INTAKE_MODES.PREVIEW : SOURCE_INTAKE_MODES.PERSISTENT;
    if (req.method === 'GET') {
      if (published) {
        return res.status(200).json(buildSourceIntakeEnvelope({ mode, receipts: [] }));
      }
      try {
        const receipts = await storeImpl.listReceipts({ tenantId: caller.tenantId });
        return res.status(200).json(buildSourceIntakeEnvelope({ mode, receipts }));
      } catch {
        return respondUnavailable(res);
      }
    }

    let upload;
    try {
      upload = await parseMultipartImpl(req);
      const metadata = validateMetadataImpl(upload.metadata);
      const profiled = await profileSourceImpl({
        filePath: upload.filePath,
        extension: upload.extension,
        metadata,
      });
      normalizeProfiledSourceIntake(profiled);

      try {
        const receipt = await storeImpl.appendReceipt({
          tenantId: caller.tenantId,
          userId: caller.id,
          profiled,
        });
        return res.status(201).json(buildSourceIntakeEnvelope({ mode, receipt }));
      } catch {
        return respondUnavailable(res);
      }
    } catch (error) {
      return respondInputError(res, error);
    } finally {
      if (upload?.filePath) {
        await removeFileImpl(upload.filePath, { force: true }).catch(() => {});
      }
    }
  };
}

export default createSourceIntakeHandler();
