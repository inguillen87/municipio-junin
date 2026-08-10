-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'TRIAL', 'DEMO');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Argentina',
    "population" INTEGER,
    "logoUrl" TEXT,
    "themePrimary" TEXT NOT NULL DEFAULT '#3b82f6',
    "themeAccent" TEXT NOT NULL DEFAULT '#6366f1',
    "themeBackground" TEXT NOT NULL DEFAULT '#060b18',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'DEMO',
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TENANT_USER',
    "tenantId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "avatar" TEXT,
    "lastLogin" TIMESTAMP(3),
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleados" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legajo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "dni" TEXT,
    "cargo" TEXT NOT NULL,
    "categoria" TEXT,
    "secretaria" TEXT NOT NULL,
    "area" TEXT,
    "tipoContrato" TEXT NOT NULL DEFAULT 'Planta Permanente',
    "salarioBruto" DOUBLE PRECISION NOT NULL,
    "salarioNeto" DOUBLE PRECISION,
    "fechaIngreso" TIMESTAMP(3),
    "fechaNacimiento" TIMESTAMP(3),
    "email" TEXT,
    "telefono" TEXT,
    "domicilio" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT,
    "proveedor" TEXT NOT NULL,
    "cuit" TEXT,
    "concepto" TEXT NOT NULL,
    "secretaria" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "fecha" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'Pagado',
    "categoria" TEXT,
    "comprobanteUrl" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "secretaria" TEXT NOT NULL,
    "codigo" TEXT,
    "programa" TEXT,
    "asignado" DOUBLE PRECISION NOT NULL,
    "ejecutado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reclamos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "subcategoria" TEXT,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "prioridad" TEXT NOT NULL DEFAULT 'Media',
    "barrio" TEXT,
    "domicilio" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "nombre" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "agente" TEXT,
    "fechaAsignado" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reclamos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obras" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "contratista" TEXT,
    "monto" DOUBLE PRECISION,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "avance" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'En ejecucion',
    "barrio" TEXT,
    "domicilio" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "fechaInicio" TIMESTAMP(3),
    "fechaFinEstimada" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "licitacionId" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licitaciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Licitacion Publica',
    "objeto" TEXT NOT NULL,
    "montoBase" DOUBLE PRECISION,
    "adjudicadoA" TEXT,
    "montoAdjudicado" DOUBLE PRECISION,
    "estado" TEXT NOT NULL DEFAULT 'En preparacion',
    "fechaApertura" TIMESTAMP(3),
    "fechaAdjudicacion" TIMESTAMP(3),
    "secretaria" TEXT,
    "expediente" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER,
    "mimeType" TEXT,
    "modulo" TEXT,
    "entidadId" TEXT,
    "subidoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "modulo" TEXT,
    "href" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TENANT_USER',
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ausencias_grh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "dias" DOUBLE PRECISION,
    "fechaRegreso" TIMESTAMP(3),
    "motivoId" TEXT,
    "motivoCodigo" TEXT,
    "observaciones" TEXT,
    "periodo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ausencias_grh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barrios" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barrios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_grh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abrev" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_grh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciudadanos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sexo" TEXT,
    "fechaNac" TIMESTAMP(3),
    "dni" TEXT,
    "cuil" TEXT,
    "calle" TEXT,
    "numero" TEXT,
    "barrio" TEXT,
    "localidad" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "telefono" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciudadanos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convenios_grh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convenios_grh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleados_grh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legajo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sexo" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "dni" TEXT,
    "cuil" TEXT,
    "grupoSanguineo" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "calle" TEXT,
    "numero" TEXT,
    "piso" TEXT,
    "dpto" TEXT,
    "barrioNombre" TEXT,
    "localidad" TEXT,
    "provincia" TEXT DEFAULT 'Mendoza',
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "fechaIngreso" TIMESTAMP(3),
    "fechaEgreso" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sueldoBasico" DOUBLE PRECISION,
    "antiguedadAnios" INTEGER,
    "antiguedadMeses" INTEGER,
    "horasDiarias" DOUBLE PRECISION,
    "horasMensuales" DOUBLE PRECISION,
    "lugarTrabajo" TEXT,
    "concursado" BOOLEAN,
    "profesion" TEXT,
    "sectorId" TEXT,
    "categoriaId" TEXT,
    "gremioId" TEXT,
    "convenioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empleados_grh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "familiares_grh" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "vinculo" TEXT NOT NULL,
    "fechaNac" TIMESTAMP(3),
    "cuil" TEXT,
    "sexo" TEXT,
    "discapacidad" BOOLEAN NOT NULL DEFAULT false,
    "escolaridad" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "familiares_grh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gremios_grh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abrev" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gremios_grh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licencias_grh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" TEXT,
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "dias" INTEGER,
    "periodo" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licencias_grh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localidades" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "localidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivos_ausencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "diasMax" INTEGER,
    "conGoce" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motivos_ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sectores_grh" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abrev" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectores_grh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_tenantId_legajo_key" ON "empleados"("tenantId", "legajo");

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_tenantId_secretaria_periodo_key" ON "presupuestos"("tenantId", "secretaria", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "reclamos_tenantId_numero_key" ON "reclamos"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "licitaciones_tenantId_numero_key" ON "licitaciones"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "ausencias_grh_empleadoId_idx" ON "ausencias_grh"("empleadoId");

-- CreateIndex
CREATE INDEX "ausencias_grh_tenantId_fecha_idx" ON "ausencias_grh"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "barrios_tenantId_nombre_key" ON "barrios"("tenantId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_grh_tenantId_codigo_key" ON "categorias_grh"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ciudadanos_dni_idx" ON "ciudadanos"("dni");

-- CreateIndex
CREATE INDEX "ciudadanos_tenantId_idx" ON "ciudadanos"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "convenios_grh_tenantId_codigo_key" ON "convenios_grh"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "empleados_grh_categoriaId_idx" ON "empleados_grh"("categoriaId");

-- CreateIndex
CREATE INDEX "empleados_grh_sectorId_idx" ON "empleados_grh"("sectorId");

-- CreateIndex
CREATE INDEX "empleados_grh_tenantId_activo_idx" ON "empleados_grh"("tenantId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_grh_tenantId_legajo_key" ON "empleados_grh"("tenantId", "legajo");

-- CreateIndex
CREATE INDEX "familiares_grh_empleadoId_idx" ON "familiares_grh"("empleadoId");

-- CreateIndex
CREATE UNIQUE INDEX "gremios_grh_tenantId_codigo_key" ON "gremios_grh"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "licencias_grh_empleadoId_idx" ON "licencias_grh"("empleadoId");

-- CreateIndex
CREATE INDEX "licencias_grh_tenantId_idx" ON "licencias_grh"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "localidades_tenantId_nombre_key" ON "localidades"("tenantId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "motivos_ausencia_tenantId_codigo_key" ON "motivos_ausencia"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sectores_grh_tenantId_codigo_key" ON "sectores_grh"("tenantId", "codigo");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamos" ADD CONSTRAINT "reclamos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obras" ADD CONSTRAINT "obras_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitaciones" ADD CONSTRAINT "licitaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausencias_grh" ADD CONSTRAINT "ausencias_grh_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados_grh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausencias_grh" ADD CONSTRAINT "ausencias_grh_motivoId_fkey" FOREIGN KEY ("motivoId") REFERENCES "motivos_ausencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barrios" ADD CONSTRAINT "barrios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calles" ADD CONSTRAINT "calles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_grh" ADD CONSTRAINT "categorias_grh_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciudadanos" ADD CONSTRAINT "ciudadanos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenios_grh" ADD CONSTRAINT "convenios_grh_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados_grh" ADD CONSTRAINT "empleados_grh_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_grh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados_grh" ADD CONSTRAINT "empleados_grh_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios_grh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados_grh" ADD CONSTRAINT "empleados_grh_gremioId_fkey" FOREIGN KEY ("gremioId") REFERENCES "gremios_grh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados_grh" ADD CONSTRAINT "empleados_grh_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectores_grh"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados_grh" ADD CONSTRAINT "empleados_grh_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "familiares_grh" ADD CONSTRAINT "familiares_grh_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados_grh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gremios_grh" ADD CONSTRAINT "gremios_grh_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licencias_grh" ADD CONSTRAINT "licencias_grh_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados_grh"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localidades" ADD CONSTRAINT "localidades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motivos_ausencia" ADD CONSTRAINT "motivos_ausencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sectores_grh" ADD CONSTRAINT "sectores_grh_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
