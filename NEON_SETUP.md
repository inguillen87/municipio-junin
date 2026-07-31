# 🐘 Configuración Neon PostgreSQL + Prisma
## GovTech Platform — Base de Datos en la Nube

---

## ¿Qué es Neon?

Neon es PostgreSQL serverless gratuito, perfecto para Vercel.
- **Gratis** hasta 512 MB de datos
- **Serverless**: se apaga automáticamente y escala según demanda
- **Compatible** 100% con Prisma, Drizzle, y cualquier cliente PostgreSQL

---

## Paso 1: Crear proyecto en Neon

1. Ir a https://neon.tech
2. Registrarse con GitHub o Google
3. Crear nuevo proyecto:
   - **Name**: `govtech-municipal`
   - **Region**: `South America (São Paulo)` → más cercano a Argentina
   - **PostgreSQL version**: 16
4. Clic en **Create project**

---

## Paso 2: Obtener la Connection String

1. En el dashboard de Neon → **Connection Details**
2. Seleccionar **Prisma** en el dropdown
3. Copiar las dos URLs:

```
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

> ⚠️ **DATABASE_URL** usa el connection pooler (para Vercel serverless)
> ⚠️ **DIRECT_URL** se usa para las migraciones de Prisma

---

## Paso 3: Configurar en el proyecto local

```bash
# Copiar el .env.example
cd backend
cp .env.example .env

# Editar .env con tus URLs de Neon
nano .env
# Pegar DATABASE_URL y DIRECT_URL
```

---

## Paso 4: Ejecutar migraciones

```bash
cd backend

# Instalar dependencias
npm install

# Generar el cliente Prisma
npm run db:generate

# Crear las tablas en Neon (primera vez)
npm run db:migrate
# → Te pedirá un nombre para la migración: init

# Cargar datos iniciales
npm run db:seed
```

---

## Paso 5: Configurar en Vercel

1. Ir a https://vercel.com → tu proyecto → **Settings** → **Environment Variables**
2. Agregar **exactamente** estas variables:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | (con pgbouncer=true, para serverless) |
| `DIRECT_URL` | (sin pgbouncer, para migraciones) |
| `JWT_SECRET` | (string de 64+ caracteres aleatorios) |

3. Hacer redeploy:
```bash
vercel deploy --prod --yes
```

---

## Verificar que funciona

```bash
# Test de conexión
curl https://municipio-junin.vercel.app/api/data/db-status

# Debería responder:
# { "ok": true, "connected": true, "type": "postgresql" }
```

---

## Credenciales iniciales del sistema

Después del seed, estos usuarios estarán disponibles:

| Usuario | Email | Contraseña | Rol |
|---------|-------|-----------|-----|
| Super Admin | `superadmin@govtech.ar` | `SuperAdmin2026!` | SUPER_ADMIN |
| Intendente | `intendente@junin.gob.ar` | `Junin2026!` | TENANT_ADMIN |
| Hacienda | `hacienda@junin.gob.ar` | `Hacienda2026!` | TENANT_USER |
| IT | `it@junin.gob.ar` | `IT2026!` | TENANT_ADMIN |
| Demo | `demo@demo.com` | `demo123` | DEMO |

> ⚠️ **Cambiar todas las contraseñas antes de ir a producción real**

---

## Estructura de la base de datos

Ver `prisma/schema.prisma` para el schema completo.

Tablas principales:
- `tenants` → Municipios registrados en la plataforma
- `users` → Usuarios con roles por tenant
- `tenant_modules` → Módulos habilitados por municipio
- `audit_logs` → Log de todas las acciones
- `invitations` → Invitaciones pendientes

---

## Comandos útiles

```bash
# Ver datos en interfaz visual
npm run db:studio
# → Abre http://localhost:5555

# Reset completo (cuidado en producción)
npx prisma migrate reset

# Ver status de migraciones
npx prisma migrate status
```
