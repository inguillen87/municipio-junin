# 🏛️ GovTech Platform — Sistema Municipal
## Municipalidad de Junín, Mendoza · Argentina

[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://municipio-junin.vercel.app)
[![GitHub](https://img.shields.io/badge/Repo-GitHub-blue?logo=github)](https://github.com/inguillen87/municipio-junin)
[![Version](https://img.shields.io/badge/Version-2.0-green)](#)
[![License](https://img.shields.io/badge/License-Privado-red)](#)

> **Torre de Control Municipal**: Sistema de gestión y control administrativo para municipios. Desarrollado para la Municipalidad de Junín, Mendoza. Diseñado para escalar a cualquier gobierno del mundo.

---

## 📋 Índice

1. [Visión General](#-visión-general)
2. [Acceso al Sistema](#-acceso-al-sistema)
3. [Arquitectura](#-arquitectura)
4. [Módulos](#-módulos)
5. [Backend API](#-backend-api)
6. [Base de Datos](#-base-de-datos)
7. [WhatsApp Bot](#-whatsapp-bot)
8. [Email Automático](#-email-automático)
9. [PWA / Mobile](#-pwa--mobile)
10. [Deploy](#-deploy)
11. [Variables de Entorno](#-variables-de-entorno)
12. [Roadmap](#-roadmap)
13. [Multi-Tenant](#-multi-tenant)
14. [Contribución](#-contribución)

---

## 🎯 Visión General

Sistema de gestión municipal con IA integrada que permite a intendentes, contadores y administradores:

- **Controlar gastos** en tiempo real vs presupuesto anual
- **Gestionar RRHH**: empleados, horas extra, ausentismo
- **Seguir licitaciones**: desde la necesidad hasta el cierre del contrato
- **Atender vecinos**: reclamos georeferenciados con mapa de calor
- **Consultar al Asistente IA**: respuestas con datos reales en lenguaje natural
- **Recibir alertas**: WhatsApp + Email automático ante situaciones críticas
- **Exportar informes**: PDF y Excel profesionales con un click

### Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | HTML5 + CSS3 + Vanilla JS (sin framework) |
| Gráficos | Chart.js 4.4 |
| Mapas | Leaflet.js 1.9 + OpenStreetMap |
| Backend | Node.js + Express.js |
| Base de Datos | PostgreSQL (prod) / In-memory demo |
| Auth | JWT (jsonwebtoken) |
| Documentos | PDF.js · SheetJS · Tesseract.js · jsPDF |
| Deploy | Vercel (frontend + serverless) |
| WhatsApp | Meta Cloud API v18 |
| Email | Nodemailer (SMTP) |
| PWA | Service Worker + Web App Manifest |
| Fuentes | Google Fonts: Inter + Outfit |

---

## 🔐 Acceso al Sistema

**URL Producción:** https://municipio-junin.vercel.app

### Credenciales Demo
| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `demo@demo.com` | `demo123` | Intendente (acceso completo) |
| `admin@junin.gob.ar` | `admin2026` | Administrador IT |
| `hacienda@junin.gob.ar` | `hacienda2026` | Hacienda (solo finanzas) |

> ⚠️ **Cambiar contraseñas antes de conectar datos reales**. Ver [`backend/routes/auth.js`](backend/routes/auth.js).

### Protección de Rutas
Todas las páginas están protegidas por `nav.js` → si no hay sesión activa en `sessionStorage`, redirige a `login.html`.

```javascript
// Ejemplo: cómo está implementado en nav.js
(function checkAuth() {
  if (!sessionStorage.getItem('mjunin_user')) {
    window.location.href = 'login.html';
  }
})();
```

---

## 🧱 Arquitectura

```
municipio-junin/
├── 📄 *.html                    # Módulos del frontend
├── css/
│   ├── dashboard.css            # Estilos principales + Mobile responsive
│   ├── shared.css               # Botones, modales, formularios globales
│   ├── login.css                # Pantalla de login
│   └── [modulo].css             # Estilos específicos por módulo
├── js/
│   ├── nav.js                   # Sidebar + Auth guard (incluir en TODAS las páginas)
│   ├── data.js                  # MUNICIPAL_DATA: datos demo centralizados
│   ├── ia.js                    # Motor IA: procesa consultas en lenguaje natural
│   ├── ia2.js                   # Chat IA: UI + OCR + Voz + Export
│   ├── pwa.js                   # PWA: SW registration + mobile nav + install prompt
│   ├── toast.js                 # Sistema de notificaciones toast
│   └── [modulo].js              # Lógica específica por módulo
├── backend/
│   ├── server.js                # Express server (puerto 3001)
│   ├── .env.example             # Variables de entorno requeridas
│   ├── package.json             # Dependencias Node.js
│   ├── db/
│   │   ├── connection.js        # Conector PostgreSQL / fallback in-memory
│   │   └── schema.sql           # Schema de la base de datos
│   └── routes/
│       ├── auth.js              # POST /api/auth/login
│       ├── contratos.js         # CRUD contratos IT
│       ├── empleados.js         # CRUD empleados
│       ├── reclamos.js          # CRUD reclamos vecinales
│       ├── archivos.js          # Upload + parsing de archivos
│       ├── whatsapp.js          # Meta WhatsApp webhook + bot
│       └── notifications.js     # Email automático (Nodemailer)
├── manifest.json                # PWA manifest
├── sw.js                        # Service Worker PWA
└── vercel.json                  # Config de deploy Vercel
```

### Flujo de datos

```
Usuario (browser/celular)
       ↓
  Páginas HTML (frontend)
       ↓
  js/data.js (MUNICIPAL_DATA) ←── Demo mode (sin backend)
       ↓ (si backend disponible)
  backend/server.js :3001
       ↓
  PostgreSQL (datos reales)
```

---

## 📦 Módulos

### 1. Dashboard Ejecutivo `/index.html`
- KPIs principales del municipio en tiempo real
- Gráficos de gasto vs presupuesto por secretaría
- Alertas críticas con semáforo visual
- Mapa de calor de áreas por porcentaje de ejecución
- **Datos**: `MUNICIPAL_DATA.presupuesto`, `.gastos`, `.alertas`

### 2. Junín Control `/control.html`
- Torre de control del Plan de Choque 30 días
- Estado de cada iniciativa de ahorro
- Tracking de ahorros proyectados vs realizados
- **Objetivo Sprint 1**: detectar $15.8M de ahorro anual

### 3. Asistente IA `/ia.html`
- Chat con IA municipal (responde en lenguaje natural)
- OCR de imágenes con Tesseract.js
- Reconocimiento de voz (Web Speech API)
- Upload y análisis de Excel, PDF, Word, CSV
- Export de conversación a PDF/Excel
- **Motor**: `js/ia.js` → `INTENTS` pattern → respuestas HTML estructuradas

#### Intenciones reconocidas por el motor IA:
| Palabras clave | Respuesta |
|----------------|----------|
| saldo, dinero libre, disponible | KPI de saldo disponible |
| gasto, ejecutado, erogación | Tabla de gastos por secretaría |
| empleados, plantel, personal | Distribución por área |
| horas extra | Ranking por área con costo |
| alertas, crítico, urgente | Lista de alertas activas |
| ahorro, reducir, oportunidad | Tabla de oportunidades |
| reclamos, vecinos | Estadísticas de reclamos |
| flota, combustible | Estado de vehículos |
| IT, tecnología, contratos | Contratos con riesgo |
| presupuesto, secretaría | Ejecución por área |
| informe, resumen, ejecutivo | Reporte completo |

### 4. RRHH `/rrhh.html`
- Plantel de 1.247 empleados
- Horas extra por área (4.312 hs = $18.4M)
- Tabla de licencias activas
- Ausentismo y análisis de costos

### 5. Licitaciones `/licitaciones.html`
- Flujo completo: Necesidad → Pliego → Publicación → Evaluación → Adjudicación → Contrato
- Evaluación comparativa de ofertas con puntaje ponderado por IA
- Timeline de vencimientos con alertas automáticas
- Registro de proveedores con rating y CUIT

### 6. Atención Vecinal `/vecinos.html`
- Registro y gestión de 318 reclamos
- Filtros por tipo, área y estado
- KPIs: pendientes (89), resueltos (229), tiempo promedio (3.2 días)
- Satisfacción vecinal: 84%

### 7. Mapa de Reclamos `/mapa.html`
- Leaflet.js + OpenStreetMap (tema oscuro)
- Marcadores por tipo con colores diferenciados
- Filtros en tiempo real por tipo y estado
- Popups con acciones (escalar / resolver)
- Sidebar con estadísticas dinámicas

### 8. Proveedores `/proveedores.html`
- Auditoría de contratos IT activos
- Alertas de contratos por vencer
- Análisis de duplicados y sobrecostos
- $15.8M de ahorro potencial identificado

### 9. Exportar Reportes `/exportar.html`
- PDF ejecutivo con jsPDF + AutoTable
- Excel con múltiples hojas (SheetJS)
- Plantillas profesionales por módulo

---

## 🔌 Backend API

### Iniciar el backend local
```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales
npm install
npm run dev
# API disponible en http://localhost:3001
```

### Endpoints disponibles

#### Auth
```
POST /api/auth/login
Body: { email, password }
Response: { token, user }
```

#### Contratos IT
```
GET    /api/contratos         # Listar todos
POST   /api/contratos         # Crear contrato
PUT    /api/contratos/:id     # Actualizar
DELETE /api/contratos/:id     # Eliminar
```

#### Empleados
```
GET  /api/empleados           # Listar (con filtros: ?area=&cargo=)
POST /api/empleados           # Crear
GET  /api/empleados/:id       # Detalle
```

#### Reclamos
```
GET  /api/reclamos            # Listar (con filtros: ?tipo=&estado=)
POST /api/reclamos            # Crear reclamo
PUT  /api/reclamos/:id/estado # Cambiar estado
```

#### Archivos
```
POST /api/archivos/upload     # Upload multipart (max 50MB)
# Soporta: xlsx, xls, csv, pdf, doc, docx, txt, png, jpg
# Response: { text, data, columns, rows, summary }
```

#### WhatsApp Bot
```
GET  /api/whatsapp/webhook    # Verificación Meta (hub.challenge)
POST /api/whatsapp/webhook    # Recepción de mensajes
POST /api/whatsapp/send-alert # Enviar alerta proactiva
POST /api/whatsapp/send-weekly # Informe semanal masivo
```

#### Notificaciones Email
```
POST /api/notifications/check          # Verificar y disparar todas las alertas
POST /api/notifications/send/:alertaId # Enviar alerta específica
POST /api/notifications/weekly-report  # Informe semanal
POST /api/notifications/custom         # Email personalizado
GET  /api/notifications/alertas        # Listar alertas configuradas
```

#### Health Check
```
GET /api/health
# Response: { ok, version, db, mode, ts }
```

---

## 🗄️ Base de Datos

### Modo Demo (sin configuración)
El sistema arranca automáticamente en modo demo con datos en memoria. No requiere PostgreSQL. Ideal para desarrollo y presentaciones.

### Modo Producción (PostgreSQL)

```bash
# En .env:
DATABASE_URL=postgresql://usuario:password@host:5432/municipio_junin
```

### Conectar a DB remota de la Municipalidad

```bash
# Opción 1: PostgreSQL directo
DATABASE_URL=postgresql://readonly_user:pass@192.168.1.100:5432/muni_db

# Opción 2: SSL obligatorio
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Opción 3: Tunnel SSH (más seguro para piloto)
ssh -L 5433:localhost:5432 usuario@servidor-muni.junin.gob.ar
DATABASE_URL=postgresql://user:pass@localhost:5433/db
```

### Schema principal
Ver [`backend/db/schema.sql`](backend/db/schema.sql)

### Importar datos desde Excel/CSV
```
1. Ir a /upload.html
2. Arrastrar el archivo Excel/CSV
3. El sistema procesa automáticamente y muestra preview
4. Confirmar importación
5. Los datos quedan disponibles en el dashboard
```

---

## 📱 WhatsApp Bot

### Configuración paso a paso

1. **Crear App en Meta Developers**
   - Ir a https://developers.facebook.com
   - Crear nueva App → tipo "Business"
   - Agregar producto: WhatsApp

2. **Obtener credenciales**
   ```
   WHATSAPP_PHONE_NUMBER_ID = (Panel Meta → WhatsApp → API Setup)
   WHATSAPP_ACCESS_TOKEN    = (Token permanente de sistema)
   WHATSAPP_VERIFY_TOKEN    = junin-muni-2026  (o el que prefieras)
   ```

3. **Registrar webhook en Meta**
   ```
   URL: https://municipio-junin.vercel.app/api/whatsapp/webhook
   Verify Token: junin-muni-2026
   Campos a suscribir: messages
   ```

4. **Agregar variables en Vercel**
   - Ir a vercel.com → proyecto → Settings → Environment Variables
   - Agregar las 3 variables
   - Re-deploy

### Comandos del Bot
| Mensaje | Respuesta |
|---------|----------|
| `hola` | Menú de ayuda |
| `saldo` | Dinero disponible |
| `gasto` | Gastos del mes |
| `empleados` | Datos de RRHH |
| `reclamos` | Estado de reclamos |
| `alertas` | Situaciones críticas |
| `informe` | Resumen ejecutivo |

---

## 📧 Email Automático

### Configuración SMTP
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sistema@municipio-junin.gob.ar
SMTP_PASS=app-password-aqui
EMAIL_INTENDENTE=intendente@junin.gob.ar
EMAIL_HACIENDA=hacienda@junin.gob.ar
EMAIL_IT=tecnologia@junin.gob.ar
```

### Para Gmail: crear App Password
1. Cuenta Google → Seguridad → Verificación en 2 pasos (activar)
2. Seguridad → Contraseñas de aplicaciones
3. Generar para "Otra aplicación" → copiar la contraseña

### Alertas automáticas configuradas
- `contratos_vencidos` → cuando un contrato vence en ≤ 30 días
- `presupuesto_excedido` → cuando un área supera su presupuesto
- `informe_semanal` → todos los lunes 8am

### Llamar manualmente (testing)
```bash
curl -X POST https://municipio-junin.vercel.app/api/notifications/check
```

---

## 📱 PWA / Mobile

### Instalación como App
- En **Android Chrome**: banner "Instalar" aparece automáticamente después de 3 segundos
- En **iPhone Safari**: Compartir → Agregar a pantalla de inicio

### Features mobile
- Sidebar deslizable (swipe desde borde izquierdo)
- Bottom navigation bar (5 módulos clave)
- Pull-to-refresh
- Funciona offline (datos cacheados)
- Safe areas para iPhone notch

### Service Worker
El archivo `sw.js` implementa:
- **Cache First** para assets y CDNs externas
- **Network First** para endpoints `/api/`
- **Stale-While-Revalidate** para páginas HTML
- **Offline fallback** con página de error elegante

---

## 🚀 Deploy

### Frontend en Vercel (automático)
```bash
git add .
git commit -m "feat: descripción"
git push  # Vercel despliega automáticamente
```

### Backend en Vercel (serverless)
El `vercel.json` configura las rutas para que el backend Express funcione como serverless functions.

### Deploy manual
```bash
vercel deploy --prod --yes
```

### Entornos
| Entorno | URL | Branch |
|---------|-----|--------|
| Producción | https://municipio-junin.vercel.app | main/master |
| Preview | https://municipio-junin-*.vercel.app | feature/* |

---

## ⚙️ Variables de Entorno

Copiar `backend/.env.example` → `backend/.env`

```env
# ── SERVIDOR ────────────────────────────────────
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://municipio-junin.vercel.app

# ── AUTENTICACIÓN ────────────────────────────────
JWT_SECRET=cambiar-por-secreto-seguro-de-64-caracteres

# ── BASE DE DATOS ────────────────────────────────
DATABASE_URL=postgresql://user:pass@host:5432/municipio_junin
# Dejar vacío para modo demo (sin DB)

# ── WHATSAPP META API ────────────────────────────
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=junin-muni-2026

# ── EMAIL (SMTP) ────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_INTENDENTE=intendente@junin.gob.ar
EMAIL_HACIENDA=hacienda@junin.gob.ar
EMAIL_IT=tecnologia@junin.gob.ar

# ── VERCEL (automático) ──────────────────────────
VERCEL_URL=
```

---

## 🗺️ Roadmap

### ✅ Sprint 1 (Semana 1) — COMPLETADO
- [x] Dashboard ejecutivo con KPIs reales
- [x] Login con JWT
- [x] Módulo RRHH completo
- [x] Atención Vecinal + Reclamos
- [x] Asistente IA con 12 intenciones
- [x] OCR de imágenes
- [x] Reconocimiento de voz
- [x] Mapa georreferenciado (Leaflet.js)
- [x] Módulo Licitaciones completo
- [x] WhatsApp Bot (estructura)
- [x] Email automático (Nodemailer)
- [x] PWA (install + offline + mobile nav)
- [x] Responsive mobile completo

### 🔨 Sprint 2 (Semana 2) — EN DESARROLLO
- [ ] Conector PostgreSQL remoto
- [ ] Importador masivo Excel/CSV con IA
- [ ] WhatsApp Bot con datos reales
- [ ] Multi-tenant: nuevo gobierno en 5 min
- [ ] Módulo de Presupuesto detallado

### 📋 Sprint 3 (Semana 3)
- [ ] Mapa financiero (capas: obras, costos, infraestructura)
- [ ] Predicciones de gasto con IA
- [ ] Generador automático de pliegos
- [ ] Auditoría automática de contratos

### 🌍 Sprint 4 (Semana 4)
- [ ] Landing page comercial
- [ ] Onboarding automático (Excel → sistema listo)
- [ ] Sistema de pricing y subscripción
- [ ] Documentación técnica para IT municipales

---

## 🏛️ Multi-Tenant

Para agregar un nuevo municipio:

1. Crear `tenants/[nombre-ciudad]/config.json`
2. Configurar datos locales en `js/data.js` (o conectar su DB)
3. Cambiar logo y colores en `css/dashboard.css` (variables CSS)
4. Deploy en Vercel con su propio dominio

```json
// tenants/ejemplo-ciudad/config.json
{
  "id": "ejemplo-ciudad",
  "name": "Municipalidad de Ejemplo",
  "province": "Mendoza",
  "country": "Argentina",
  "population": 85000,
  "employees": 650,
  "budget_annual": 2800000000,
  "theme": {
    "primary": "#3b82f6",
    "accent": "#6366f1",
    "logo": "🏛️"
  },
  "modules": ["dashboard","rrhh","vecinos","control","ia"],
  "db": {
    "type": "postgresql",
    "url": "${DATABASE_URL_EJEMPLO}"
  }
}
```

---

## 🤝 Contribución

### Para desarrolladores / IA que continúen el proyecto:

1. **Leer este README completo** antes de hacer cambios
2. **Entender la arquitectura**: todo el frontend es HTML + Vanilla JS, sin frameworks
3. **Agregar shared.css** a cualquier página nueva
4. **Agregar pwa.js** a cualquier página nueva (antes de `</body>`)
5. **Agregar el módulo a nav.js** en el array `NAV_ITEMS`
6. **Usar `buildSidebar('id-del-modulo')`** al inicio del JS de cada página
7. **Usar `MUNICIPAL_DATA`** de `data.js` para datos demo
8. **Estilos**: NO inline styles. Usar clases de `shared.css` o `dashboard.css`
9. **Botones**: usar clases `.btn-primary`, `.btn-save`, `.btn-cancel`, `.btn-danger`
10. **Commit convention**: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`

### Estructura de una página nueva
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nuevo Módulo — Municipio de Junín</title>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#3b82f6" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/dashboard.css" />
  <link rel="stylesheet" href="css/shared.css" />
</head>
<body>
  <aside class="sidebar" id="sidebar"></aside>
  <main class="main-content" id="mainContent">
    <header class="topbar">
      <!-- topbar content -->
    </header>
    <div class="content-wrapper">
      <!-- page content -->
    </div>
  </main>
  <script src="js/nav.js"></script>
  <script src="js/toast.js"></script>
  <script src="js/data.js"></script>
  <script src="js/pwa.js"></script>
  <script>
    buildSidebar('id-del-modulo');
    // tu código aquí
  </script>
</body>
</html>
```

---

## 📞 Contacto y Soporte

- **Municipalidad de Junín**: municipio-junin.vercel.app
- **GitHub**: github.com/inguillen87/municipio-junin
- **Stack**: HTML + JS + Node.js + PostgreSQL + Vercel

---

*Desarrollado con ❤️ para la Municipalidad de Junín, Mendoza, Argentina.*  
*GovTech Platform v2.0 — 2026*
