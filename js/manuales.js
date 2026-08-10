// ============================================================
// MANUALES.JS — Lógica del manual de procedimientos
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('docs');
  initScrollSpy();
  initCopyButtons();
  initExportPDF();
});

// ── SCROLL SPY — resaltar item del índice según scroll ────
function initScrollSpy() {
  const sections = document.querySelectorAll('.manual-section');
  const links    = document.querySelectorAll('.index-link');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        links.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === '#' + id);
        });
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });

  sections.forEach(s => observer.observe(s));

  // Click suave en los links del índice
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ── COPY BUTTONS ──────────────────────────────────────────
function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code ||
        btn.closest('.code-block')?.querySelector('pre')?.textContent || '';
      navigator.clipboard.writeText(code.trim()).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✅ Copiado';
        setTimeout(() => btn.textContent = orig, 2000);
      });
    });
  });

  // También hacer que todo el bloque de código sea clickeable para copiar
  document.querySelectorAll('.code-block pre').forEach(pre => {
    pre.title = 'Click para copiar';
    pre.style.cursor = 'pointer';
    pre.addEventListener('click', () => {
      navigator.clipboard.writeText(pre.textContent.trim());
      pre.style.outline = '2px solid var(--blue)';
      setTimeout(() => pre.style.outline = '', 1500);
    });
  });
}

// ── EXPORT PDF COMPLETO ───────────────────────────────────
function initExportPDF() {
  document.getElementById('btnExportAllPDF')?.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = 0;

    // PORTADA
    doc.setFillColor(6, 11, 24);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 8, 297, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(255, 255, 255);
    doc.text('MUNICIPIO DE JUNÍN', 20, 80);

    doc.setFontSize(14);
    doc.setTextColor(180, 210, 255);
    doc.text('Sistema de Gestión Municipal', 20, 95);

    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('MANUAL DE PROCEDIMIENTOS', 20, 130);
    doc.text('Y DOCUMENTACIÓN TÉCNICA', 20, 145);

    doc.setFontSize(10);
    doc.setTextColor(120, 150, 200);
    doc.text(`Versión 4.0 · Julio 2026`, 20, 175);
    doc.text('Confidencial — Uso interno del municipio', 20, 185);
    doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 20, 195);

    // Página 2 en adelante: contenido
    doc.addPage();

    const sections = [
      { title: '🚀 ARRANCAR EL SISTEMA', content: [
        ['Paso 1: Iniciar el servidor', 'python -m http.server 8181 --directory "C:\\municipio-junin"'],
        ['Paso 2: Abrir navegador', 'Chrome o Edge → http://localhost:8181'],
        ['Paso 3: Verificar módulos', 'Confirmar que index.html, rrhh.html, vecinos.html, ia-hf.html y exportar.html abren sin errores'],
        ['Nota importante', 'Siempre usar Chrome o Edge. Firefox no es compatible con todos los módulos de IA.'],
      ]},
      { title: '🏗️ ARQUITECTURA', content: [
        ['Capa Frontend', 'HTML + CSS + JavaScript estáticos servidos por Python HTTP Server (dev) o Nginx (producción)'],
        ['IA en el browser', 'HuggingFace Transformers.js corre modelos ONNX en WebAssembly. Sin servidor de IA necesario.'],
        ['Stack de producción', 'Node.js (API) + PostgreSQL 16 (datos) + Ollama (IA) + Nginx (web) + Docker Compose (orquestación)'],
        ['Puerto web dev', '8181 (Python HTTP Server)'],
        ['Puerto API prod', '3001 (Node.js Express)'],
        ['Puerto DB', '5432 (PostgreSQL)'],
        ['Puerto IA', '11434 (Ollama)'],
      ]},
      { title: '👥 RRHH — RECURSOS HUMANOS', content: [
        ['Ver nómina', 'Tabla principal con filtros por secretaría, cargo y estado'],
        ['Nuevo empleado', 'Botón "+ Nuevo Empleado" → Completar formulario → Guardar'],
        ['Generar recibo', 'Click en 📋 en la fila del empleado → Descarga PDF automático'],
        ['Horas extra', 'Tab "Horas Extra" → Ver por secretaría → Exportar Excel'],
        ['Error común', 'Si no aparece un empleado, revisar filtros activos. Click en "Limpiar filtros".'],
      ]},
      { title: '🏘️ ATENCIÓN VECINAL', content: [
        ['Nuevo reclamo', 'Botón "+ Nuevo Reclamo" → Completar DNI, tipo, área, dirección, descripción → Guardar'],
        ['Clasificación IA', 'En ia-hf.html Tab Clasificador: escribir el problema → la IA categoriza automáticamente'],
        ['Cambiar estado', 'Click ✏️ en la fila → Pendiente → En proceso → Resuelto'],
        ['Exportar', 'Ir a exportar.html → Seleccionar "Reclamos Vecinales" → PDF o Excel'],
        ['Gestión turnos', 'Tab "Turnos" → Ver agenda → "Reservar Turno" para agendar'],
      ]},
      { title: '🤖 ASISTENTE IA', content: [
        ['Chat texto', 'Escribir pregunta en el campo inferior → Enter o botón ➤'],
        ['Voz', 'Click en 🎤 → Hablar → Click ⏹ → El texto se envía automáticamente'],
        ['OCR', 'Arrastrar PDF, Excel o imagen al panel izquierdo → La IA lee el documento'],
        ['Exportar respuesta', 'Cada respuesta tiene botones PDF y Excel'],
        ['Conectar Ollama', '1. ollama serve  2. Ir a ia.html → Configuración → Cambiar modelo → Probar conexión'],
      ]},
      { title: '📑 EXPORTAR REPORTES', content: [
        ['Tipos de reporte', 'Ejecutivo, RRHH, Gastos, Reclamos, Flota y Combustible, Talleres, Horas Extra'],
        ['Cómo exportar', 'Elegir tipo → Seleccionar período → Click PDF, Excel o Imprimir'],
        ['PDF', 'Documento A4 profesional con membrete municipal, KPIs y tabla en colores'],
        ['Excel', 'Planilla con hoja de datos + hoja de resumen ejecutivo'],
        ['Error PDF', 'Si no descarga: revisar F12 Console, probar en modo incógnito'],
      ]},
      { title: '💾 BACKUPS', content: [
        ['Estrategia 3-2-1', '3 copias, 2 tipos de almacenamiento, 1 copia externa'],
        ['Script backup', 'pg_dump -U municipio_admin municipio_db > backup_FECHA.sql'],
        ['Frecuencia', 'Diario automático + semanal en disco externo + mensual fuera del edificio'],
        ['Verificación', 'Una vez por mes: restaurar el backup en servidor de prueba y confirmar que los datos estén correctos'],
      ]},
      { title: '🔴 TROUBLESHOOTING', content: [
        ['Sistema no abre', 'Verificar servidor Python corriendo → Probar localhost:8181 → Revisar puerto → Revisar firewall'],
        ['Modelos HF no cargan', 'Verificar internet → F12 Console → Limpiar caché del browser'],
        ['Micrófono no funciona', 'Usar Chrome/Edge → Verificar permisos del browser → Alternativa: usar Whisper en ia-hf.html'],
        ['PDF no se genera', 'F12 → Network → Verificar que jsPDF cargó → Revisar bloqueador de popups'],
        ['OCR lento/incorrecto', 'Usar imagen de buena calidad (150+ DPI) → Texto negro sobre fondo blanco → Esperar hasta 60s'],
        ['DB no conecta', 'docker ps → docker-compose logs db → psql -h localhost -U municipio_admin -d municipio_db'],
      ]},
    ];

    sections.forEach((section, sIdx) => {
      // Header de sección
      doc.setFillColor(17, 29, 53);
      doc.rect(14, y + 10, 182, 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(section.title, 18, y + 19);
      y += 26;

      section.content.forEach(([key, val]) => {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(80, 100, 140);
        doc.text(key + ':', 18, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 60, 80);
        const lines = doc.splitTextToSize(val, 140);
        doc.text(lines, 60, y);
        y += lines.length * 5 + 4;
      });
      y += 8;
    });

    // Footer en cada página
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(240, 243, 248);
      doc.rect(0, 283, 210, 14, 'F');
      doc.setFontSize(7);
      doc.setTextColor(140, 150, 165);
      doc.text('Municipio de Junín · Manual de Procedimientos v4.0 · Documento confidencial de uso interno', 14, 290);
      doc.text(`Página ${i} de ${pages}`, 196, 290, { align: 'right' });
    }

    doc.save(`municipio-junin-manual-procedimientos-v4.pdf`);
  });
}

