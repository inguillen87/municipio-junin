# 🏛️ Sistema de Gestión Municipal — Junín, Mendoza

> **Jefatura de Tecnología · Plan de Choque 30 Días**

## 🌐 Sistema online

| URL | Descripción |
|-----|-------------|
| **[municipio-junin.vercel.app/login.html](https://municipio-junin.vercel.app/login.html)** | 🔐 Acceso al sistema |
| [/control.html](https://municipio-junin.vercel.app/control.html) | 🏛️ Junín Control (Torre de Gastos) |
| [/index.html](https://municipio-junin.vercel.app/index.html) | 📊 Dashboard principal |
| [/presentacion.html](https://municipio-junin.vercel.app/presentacion.html) | 🎯 Presentación ejecutiva Day 30 |
| [/proveedores.html](https://municipio-junin.vercel.app/proveedores.html) | 🏢 Auditoría de proveedores |

## 🔐 Credenciales de acceso

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| `demo@demo.com` | `demo123` | Demo — Acceso completo |
| `intendente@junin.gob.ar` | `junin2026` | Intendente (→ Junín Control) |
| `tecnologia@junin.gob.ar` | `tech2026` | Jefe de Tecnología |

## 📋 Módulos implementados

| Módulo | Archivo | Estado |
|--------|---------|--------|
| 🔐 Login premium | `login.html` | ✅ |
| 📊 Dashboard | `index.html` | ✅ |
| 🏛️ Junín Control (Torre Gastos) | `control.html` | ✅ |
| 🎯 Presentación Ejecutiva | `presentacion.html` | ✅ |
| 🏢 Auditoría Proveedores | `proveedores.html` | ✅ |
| 👥 RRHH | `rrhh.html` | ✅ |
| 🏘️ Atención Vecinal | `vecinos.html` | ✅ |
| 🔧 Talleres Municipales | `talleres.html` | ✅ |
| ⛽ Estación de Servicios | `servicios.html` | ✅ |
| 🤖 Asistente IA | `ia.html` | ✅ |
| 🤗 IA HuggingFace Lab | `ia-hf.html` | ✅ |
| 📂 Carga de Archivos | `upload.html` | ✅ |
| 📑 Exportar Reportes | `exportar.html` | ✅ |
| 📋 Manuales de Sistema | `manuales.html` | ✅ |
| 💰 Gastos y Costos | `gastos.html` | ✅ |

## 🐳 Deploy local (rack municipal)

```bash
# Requisitos: Docker Engine 24+ y Docker Compose v2
cd infra
cp .env.example .env
# Editar .env con contraseñas reales
docker compose up -d

# Acceder en: http://localhost
# PgAdmin en: http://localhost:5050
# Ollama en: http://localhost:11434
```

Ver [DEPLOY_LOCAL.md](docs/DEPLOY_LOCAL.md) para instrucciones completas.

## 🏗️ Arquitectura

```
📱 Frontend (HTML/CSS/JS) ← Vercel (demo) / Nginx (producción)
    ↓
🔧 API Node.js           ← Express + JWT Auth
    ↓
🐘 PostgreSQL 16         ← Base de datos principal
🔴 Redis                 ← Caché y sesiones
🤖 Ollama (Llama 3.1)   ← IA completamente local
📦 MinIO                 ← Almacenamiento de archivos
```

## 💰 Impacto del Plan de Choque (Día 1-30)

| Métrica | Valor |
|---------|-------|
| Gasto tecnológico mensual relevado | **$3.113.000** |
| Gasto anualizado | **$37.356.000** |
| Ahorro potencial detectado | **$15.804.000/año** |
| Ahorro ya ejecutado | **$480.000** (hosting migrado) |
| Contratos relevados | **12 contratos** |
| Oportunidades de ahorro | **7 activas** |

## 📁 Estructura del proyecto

```
municipio-junin/
├── login.html              # 🔐 Portal de acceso
├── index.html              # 📊 Dashboard principal
├── control.html            # 🏛️ Torre de Control (Plan 30 días)
├── presentacion.html       # 🎯 Presentación ejecutiva
├── proveedores.html        # 🏢 Auditoría de proveedores
├── rrhh.html               # 👥 Recursos Humanos
├── vecinos.html            # 🏘️ Atención Vecinal
├── talleres.html           # 🔧 Talleres Municipales
├── servicios.html          # ⛽ Estación de Servicios
├── ia.html                 # 🤖 Asistente IA Municipal
├── ia-hf.html              # 🤗 IA HuggingFace Lab
├── upload.html             # 📂 Carga masiva de archivos
├── exportar.html           # 📑 Centro de exportación
├── manuales.html           # 📋 Manuales de procedimiento
├── gastos.html             # 💰 Gastos y Costos
├── css/
│   ├── dashboard.css       # Estilos globales
│   ├── control.css         # Torre de control
│   └── [módulo].css        # Estilos por módulo
├── js/
│   ├── nav.js              # Sidebar + autenticación
│   ├── data.js             # Datos mock compartidos
│   └── [módulo].js         # Lógica por módulo
├── infra/
│   ├── docker-compose.yml  # 🐳 Deploy local completo
│   ├── nginx/default.conf  # Reverse proxy
│   └── .env.example        # Variables de entorno
└── database/
    └── migrations/
        └── 001_initial.sql # Esquema PostgreSQL completo
```

## 🔒 Seguridad

- Todas las páginas requieren autenticación (`sessionStorage`)
- Botón de logout en sidebar con confirmación
- Sesión con timestamp visible
- Credenciales auditadas (preparado para JWT en backend)
- Datos sensibles solo en servidor local (Docker Compose)

---

*Municipalidad de Junín · Mendoza · Jefatura de Tecnología · 2026*
