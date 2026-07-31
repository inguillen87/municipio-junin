-- ============================================================
-- Migración 001 — Esquema inicial
-- Municipalidad de Junín
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Búsqueda de texto

-- ── USUARIOS DEL SISTEMA ────────────────────────────
CREATE TABLE usuarios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      VARCHAR(200) NOT NULL,
  email       VARCHAR(200) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,  -- bcrypt hash
  rol         VARCHAR(50) NOT NULL DEFAULT 'operador',
  area        VARCHAR(100),
  activo      BOOLEAN DEFAULT true,
  creado_en   TIMESTAMP DEFAULT NOW(),
  ultimo_login TIMESTAMP
);

COMMENT ON TABLE usuarios IS 'Usuarios con acceso al sistema de gestión municipal';

-- ── PROVEEDORES ───────────────────────────────────
CREATE TABLE proveedores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  razon_social    VARCHAR(200) NOT NULL,
  cuit            VARCHAR(20) UNIQUE NOT NULL,
  contacto        VARCHAR(200),
  email           VARCHAR(200),
  telefono        VARCHAR(50),
  rubro           VARCHAR(100),
  riesgo_salida   VARCHAR(20) DEFAULT 'Medio',
  notas           TEXT,
  creado_en       TIMESTAMP DEFAULT NOW(),
  actualizado_en  TIMESTAMP DEFAULT NOW()
);

-- ── CONTRATOS ───────────────────────────────────
CREATE TABLE contratos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proveedor_id        UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  sistema             VARCHAR(300) NOT NULL,
  categoria           VARCHAR(100),
  costo_mensual       DECIMAL(12,2) NOT NULL DEFAULT 0,
  inicio              DATE,
  vencimiento         DATE,
  renovacion_auto     BOOLEAN DEFAULT false,
  responsable         VARCHAR(200),
  datos_propios       VARCHAR(20) DEFAULT 'No',
  tiene_sla           BOOLEAN DEFAULT false,
  tiene_backup        BOOLEAN DEFAULT false,
  licencias_contrat   INTEGER DEFAULT 0,
  licencias_activas   INTEGER DEFAULT 0,
  notas               TEXT,
  expediente          VARCHAR(100),
  creado_en           TIMESTAMP DEFAULT NOW(),
  actualizado_en      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contratos_vencimiento ON contratos(vencimiento);
CREATE INDEX idx_contratos_proveedor ON contratos(proveedor_id);

-- ── PAGOS ──────────────────────────────────────
CREATE TABLE pagos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID REFERENCES contratos(id) ON DELETE SET NULL,
  proveedor_id    UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha           DATE NOT NULL,
  monto           DECIMAL(12,2) NOT NULL,
  concepto        TEXT,
  expediente      VARCHAR(100),
  orden_pago      VARCHAR(100),
  estado          VARCHAR(30) DEFAULT 'Pagado',
  creado_en       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pagos_fecha ON pagos(fecha);
CREATE INDEX idx_pagos_proveedor ON pagos(proveedor_id);

-- ── OPORTUNIDADES DE AHORRO ────────────────────────
CREATE TABLE oportunidades_ahorro (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  descripcion         TEXT NOT NULL,
  proveedor_id        UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  contrato_id         UUID REFERENCES contratos(id) ON DELETE SET NULL,
  estado              VARCHAR(30) DEFAULT 'Detectado',
  ahorro_anual_estim  DECIMAL(12,2) DEFAULT 0,
  costo_implementar   DECIMAL(12,2) DEFAULT 0,
  responsable         VARCHAR(200),
  evidencia           TEXT,
  fecha_esperada      DATE,
  tipo                VARCHAR(30) DEFAULT 'recurrente',
  creado_en           TIMESTAMP DEFAULT NOW(),
  actualizado_en      TIMESTAMP DEFAULT NOW()
);

-- ── EMPLEADOS ────────────────────────────────────
CREATE TABLE empleados (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legajo          VARCHAR(20) UNIQUE NOT NULL,
  nombre          VARCHAR(200) NOT NULL,
  apellido        VARCHAR(200) NOT NULL,
  dni             VARCHAR(20) UNIQUE,
  cuil            VARCHAR(20),
  area            VARCHAR(100),
  secretaria      VARCHAR(100),
  cargo           VARCHAR(150),
  categoria       VARCHAR(50),
  situacion       VARCHAR(50) DEFAULT 'Planta Permanente',
  fecha_ingreso   DATE,
  sueldo_bruto    DECIMAL(12,2),
  email           VARCHAR(200),
  telefono        VARCHAR(50),
  activo          BOOLEAN DEFAULT true,
  creado_en       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_empleados_area ON empleados(area);
CREATE INDEX idx_empleados_activo ON empleados(activo);

-- ── RECLAMOS VECINOS ──────────────────────────────
CREATE TABLE reclamos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero          SERIAL,
  vecino_dni      VARCHAR(20),
  vecino_nombre   VARCHAR(200),
  vecino_tel      VARCHAR(50),
  tipo            VARCHAR(100) NOT NULL,
  area            VARCHAR(100),
  direccion       TEXT,
  descripcion     TEXT,
  estado          VARCHAR(30) DEFAULT 'Pendiente',
  prioridad       VARCHAR(20) DEFAULT 'Normal',
  resolucion      TEXT,
  creado_en       TIMESTAMP DEFAULT NOW(),
  resuelto_en     TIMESTAMP
);

CREATE INDEX idx_reclamos_estado ON reclamos(estado);
CREATE INDEX idx_reclamos_tipo ON reclamos(tipo);

-- ── CARGAS DE COMBUSTIBLE ──────────────────────────
CREATE TABLE cargas_combustible (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehiculo_pat    VARCHAR(20) NOT NULL,
  vehiculo_desc   VARCHAR(200),
  tipo            VARCHAR(20) NOT NULL,
  litros          DECIMAL(8,2) NOT NULL,
  precio_litro    DECIMAL(8,2),
  conductor       VARCHAR(200),
  km_actual       INTEGER,
  fecha           TIMESTAMP DEFAULT NOW()
);

-- ── LOG DE AUDITORÍA ──────────────────────────────
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  UUID REFERENCES usuarios(id),
  accion      VARCHAR(100) NOT NULL,
  tabla       VARCHAR(100),
  registro_id TEXT,
  detalle     JSONB,
  ip          VARCHAR(50),
  creado_en   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_usuario ON audit_log(usuario_id);
CREATE INDEX idx_audit_fecha ON audit_log(creado_en);

-- ── DATOS INICIALES (DEMO) ───────────────────────────
INSERT INTO usuarios (nombre, email, password, rol) VALUES
  ('Administrador Demo', 'demo@demo.com', '$2b$10$placeholder_bcrypt_hash', 'admin'),
  ('Mario Abed', 'intendente@junin.gob.ar', '$2b$10$placeholder_bcrypt_hash', 'intendente'),
  ('Jefe de Tecnologia', 'tecnologia@junin.gob.ar', '$2b$10$placeholder_bcrypt_hash', 'admin');

SELECT 'Base de datos Municipalidad de Junin inicializada correctamente' AS resultado;
