# 🔧 Backend API — Municipalidad de Junín

## Inicio rápido

```bash
cd backend
npm install
cp .env.example .env
npm run dev
# API disponible en http://localhost:3001
```

## Endpoints principales

| Método | URL | Descripción |
|--------|-----|-------------|
| POST | `/api/auth/login` | Login con email/password → JWT |
| GET | `/api/auth/me` | Usuario actual (requiere Bearer token) |
| GET | `/api/contratos` | Lista de contratos |
| POST | `/api/contratos` | Crear contrato |
| GET | `/api/empleados` | Lista de empleados |
| POST | `/api/empleados` | Crear empleado |
| GET | `/api/reclamos` | Lista de reclamos |
| POST | `/api/reclamos` | Crear reclamo |
| POST | `/api/archivos/upload` | Subir y parsear archivo (Excel/PDF/Word/CSV) |
| GET | `/api/health` | Estado del servidor y DB |

## Autenticación

Todos los endpoints (excepto `/api/auth/login` y `/api/health`) requieren header:
```
Authorization: Bearer <JWT_TOKEN>
```

## Archivos soportados

- **.xlsx / .xls** — Excel (todas las hojas)
- **.csv** — CSV con separador auto-detectado (coma o punto y coma)
- **.pdf** — Extracción de texto
- **.docx / .doc** — Word
- **.txt** — Texto plano
- **.json** — JSON estructurado

## Modo demo (sin PostgreSQL)

Si no hay base de datos configurada, el backend corre con datos en memoria.
Todos los datos se resetean al reiniciar el servidor.
Para persistencia real: configurar `DATABASE_URL` en `.env`.

## Conectar PostgreSQL

```bash
# Con Docker (recomendado):
docker run -d --name junin_pg \
  -e POSTGRES_DB=junin_db \
  -e POSTGRES_USER=junin_user \
  -e POSTGRES_PASSWORD=tu_password \
  -p 5432:5432 postgres:16-alpine

# Luego en .env:
DATABASE_URL=postgresql://junin_user:tu_password@localhost:5432/junin_db

# Crear tablas:
psql $DATABASE_URL -f ../database/migrations/001_initial.sql

# Sembrar datos demo:
npm run seed
```
