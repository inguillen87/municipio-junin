# 🏛️ Sistema de Gestión Municipal — Municipio de Junín

[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://municipio-junin.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stack: Vanilla JS](https://img.shields.io/badge/Stack-HTML%2FCSS%2FJS-orange)](https://developer.mozilla.org)

Sistema de gestión municipal moderno, open source y soberano. Desarrollado para el **Municipio de Junín** bajo la dirección del Jefe de Tecnología, con el objetivo de reemplazar sistemas privativos de terceros, reducir costos y garantizar la soberanía de los datos municipales.

---

## 🚀 Demo en vivo

**[https://municipio-junin.vercel.app](https://municipio-junin.vercel.app)**

> ⚠️ Esta versión es un **MVP de demostración** con datos de muestra. La versión de producción se conectará a la base de datos PostgreSQL local del municipio.

---

## 📦 Módulos

| Módulo | Descripción |
|--------|-------------|
| 📊 Dashboard | KPIs ejecutivos en tiempo real para el intendente y jefes de área |
| 👥 Recursos Humanos | Nómina, legajos, sueldos, horas extra, exportación de recibos |
| 🏘️ Atención Vecinal | Reclamos, turnos, clasificación automática con IA |
| 🔧 Talleres Municipales | Órdenes de trabajo, stock de insumos, control de flota |
| ⛽ Est. de Servicios | Control de combustible, niveles de tanque, consumo por vehículo |
| 🤖 Asistente IA | Chat, OCR de documentos, reconocimiento de voz |
| 🤗 IA Lab HuggingFace | Clasificación, sentimientos, NER, Q&A, Whisper, Embeddings |
| 📑 Exportar Reportes | Informes en PDF/Excel con membrete municipal |
| 📂 Análisis de Archivos | Carga masiva Excel/PDF/Word con métricas automáticas |
| 📚 Manuales | Documentación técnica y procedimientos para el equipo IT |

---

## ⚡ Tecnologías

- **Frontend:** HTML5, CSS3, JavaScript vanilla (sin frameworks)
- **IA en el browser:** [Transformers.js](https://huggingface.co/docs/transformers.js) (HuggingFace, modelos ONNX)
- **OCR:** [Tesseract.js](https://tesseract.projectnaptha.com/)
- **Gráficos:** [Chart.js](https://chartjs.org)
- **PDF:** [jsPDF](https://github.com/parallax/jsPDF) + [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable)
- **Excel:** [SheetJS (xlsx)](https://sheetjs.com/)
- **Word:** [Mammoth.js](https://github.com/mwilliamson/mammoth.js)
- **PDF lectura:** [PDF.js](https://mozilla.github.io/pdf.js/)
- **Voz:** Web Speech API (nativo del browser)

> **Todo open source. Sin APIs de pago. Sin dependencias externas en producción.**

---

## 🖥️ Correr localmente

```bash
# Opción 1: Python (recomendado)
python -m http.server 8181

# Opción 2: Node.js
npx serve . -l 8181

# Abrir en el navegador
# http://localhost:8181
```

---

## 🏗️ Arquitectura

```
MVP actual (demo)
└── Archivos estáticos HTML/CSS/JS
    └── Datos de muestra en js/data.js

Producción (Municipio de Junín)
├── Nginx — Servidor web
├── Node.js — API REST (puerto 3001)
├── PostgreSQL 16 — Base de datos
├── Redis — Caché y sesiones
├── MinIO — Almacenamiento de archivos
└── Ollama — LLM local (llama3, mistral)
```

---

## 🗺️ Roadmap

- [x] MVP visual completo (10 módulos)
- [x] IA local con HuggingFace Transformers.js
- [x] OCR con Tesseract.js
- [x] Exportación PDF/Excel profesional
- [x] Análisis masivo de archivos
- [x] Manuales de procedimiento completos
- [ ] Autenticación de usuarios (login por roles)
- [ ] API Node.js + PostgreSQL
- [ ] Conexión a datos reales del municipio
- [ ] Deploy en rack local con Docker Compose
- [ ] Integración con lector RFID (asistencia)
- [ ] App móvil para inspectores de campo

---

## 👥 Equipo

- **Intendente:** Mario Abed — Municipio de Junín, Buenos Aires, Argentina
- **Jefe de Tecnología:** [@inguillen87](https://github.com/inguillen87)

---

## 📄 Licencia

MIT — Libre para uso, modificación y distribución. Software público para el bien común.
