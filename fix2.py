import glob

def fix_file(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Simple text replacements
    replaces = {
        'Licitaciones y Compras ? MuniControl': 'Licitaciones y Compras | MuniControl',
        'Municipal Jun?n': 'Municipal Junín',
        'Licitaci?n': 'Licitación',
        'licitaci?n': 'licitación',
        'Evaluaci?n': 'Evaluación',
        'T?tulo': 'Título',
        '?rea': 'Área',
        'descripci?n': 'descripción',
        'Descripci?n': 'Descripción',
        'a?o': 'año',
        'p?blico': 'público',
        'Informaci?n': 'Información',
        'Gesti?n': 'Gestión',
        'N?mero': 'Número',
        'n?mero': 'número',
        'D?a': 'Día',
        'd?a': 'día',
        'veh?culo': 'vehículo',
        'Veh?culo': 'Vehículo',
        'Tel?fono': 'Teléfono',
        'tel?fono': 'teléfono',
        'Atenci?n': 'Atención',
        'Inversi?n': 'Inversión',
        'Participaci?n': 'Participación',
        'Ejecuci?n': 'Ejecución',
        'Ubicaci?n': 'Ubicación',
        'Acci?n': 'Acción',
        'Direcci?n': 'Dirección',
        'Secci?n': 'Sección',
        'Asignaci?n': 'Asignación',
        'Pr?ximo': 'Próximo',
        'pr?ximo': 'próximo',
        'tr?mite': 'trámite',
        'Tr?mite': 'Trámite',
        'Categor?a': 'Categoría',
        'categor?a': 'categoría',
        'Pol?tica': 'Política',
        'Ocupaci?n': 'Ocupación',
        'Asociaci?n': 'Asociación',
        'aprobaci?n': 'aprobación',
        'Aprobaci?n': 'Aprobación',
        'p?gina': 'página',
        'P?gina': 'Página',
        'B?squeda': 'Búsqueda',
        'b?squeda': 'búsqueda',
        'Comit?': 'Comité',
        'comit?': 'comité',
        'est?': 'está',
        'Est?': 'Está',
        'aqu?': 'aquí',
        'Aqu?': 'Aquí',
        'seg?n': 'según',
        'Seg?n': 'Según',
        'Tambi?n': 'También',
        'tambi?n': 'también',
        'qu?': 'qué',
        'Qu?': 'Qué',
        'c?mo': 'cómo',
        'C?mo': 'Cómo',
        'cu?ndo': 'cuándo',
        'Cu?ndo': 'Cuándo',
        'd?nde': 'dónde',
        'D?nde': 'Dónde',
        'qui?n': 'quién',
        'Qui?n': 'Quién',
        'cu?l': 'cuál',
        'Cu?l': 'Cuál',
        'cu?ntos': 'cuántos',
        'Cu?ntos': 'Cuántos',
        'cu?nto': 'cuánto',
        'Cu?nto': 'Cuánto',
        'podr?a': 'podría',
        'Podr?a': 'Podría',
        'ser?': 'será',
        'Ser?': 'Será',
        'har?': 'hará',
        'Har?': 'Hará',
        'habr?': 'habrá',
        'Habr?': 'Habrá',
        'tendr?': 'tendrá',
        'Tendr?': 'Tendrá',
        'est?n': 'están',
        'Est?n': 'Están',
        'ser?n': 'serán',
        'Ser?n': 'Serán',
        'har?n': 'harán',
        'Har?n': 'Harán',
        'habr?n': 'habrán',
        'Habr?n': 'Habrán',
        'tendr?n': 'tendrán',
        'Tendr?n': 'Tendrán',
        'podr?n': 'podrán',
        'Podr?n': 'Podrán',
        'deber?': 'deberá',
        'Deber?': 'Deberá',
        'deber?n': 'deberán',
        'Deber?n': 'Deberán',
        'tambi?n': 'también',
        'Tambi?n': 'También',
        'adem?s': 'además',
        'Adem?s': 'Además',
        'despu?s': 'después',
        'Despu?s': 'Después',
        'atr?s': 'atrás',
        'Atr?s': 'Atrás',
        'm?s': 'más',
        'M?s': 'Más',
        'a?n': 'aún',
        'A?n': 'Aún',
        's?lo': 'sólo',
        'S?lo': 'Sólo',
        'S?': 'Sí',
        's?': 'sí',
        'M?': 'Mí',
        'm?': 'mí',
        'T?': 'Tú',
        't?': 'tú',
        'El?': 'Él',
        'el?': 'él',
        'c?digo': 'código',
        'C?digo': 'Código',
        'art?culo': 'artículo',
        'Art?culo': 'Artículo',
        'pr?ctica': 'práctica',
        'Pr?ctica': 'Práctica',
        't?rmino': 'término',
        'T?rmino': 'Término',
        '?ltimo': 'último',
        '?ltimo': 'Último',
        '?nico': 'único',
        '?nico': 'Único',
        'r?pido': 'rápido',
        'R?pido': 'Rápido',
        'f?cil': 'fácil',
        'F?cil': 'Fácil',
        'dif?cil': 'difícil',
        'Dif?cil': 'Difícil',
        '?til': 'útil',
        '?til': 'Útil',
        'D?lar': 'Dólar',
        'd?lar': 'dólar',
        'c?lculo': 'cálculo',
        'C?lculo': 'Cálculo',
        'an?lisis': 'análisis',
        'An?lisis': 'Análisis',
        'estad?stica': 'estadística',
        'Estad?stica': 'Estadística',
        'pol?tica': 'política',
        'Pol?tica': 'Política',
        'econ?mico': 'económico',
        'Econ?mico': 'Económico',
        'p?liza': 'póliza',
        'P?liza': 'Póliza',
        'tr?nsito': 'tránsito',
        'Tr?nsito': 'Tránsito',
        'v?a': 'vía',
        'V?a': 'Vía',
        'R?o': 'Río',
        'r?o': 'río',
        'Comisi?n': 'Comisión',
        'comisi?n': 'comisión',
        'versi?n': 'versión',
        'Versi?n': 'Versión',
        'opci?n': 'opción',
        'Opci?n': 'Opción',
        'situaci?n': 'situación',
        'Situaci?n': 'Situación',
        'condici?n': 'condición',
        'Condici?n': 'Condición',
        'soluci?n': 'solución',
        'Soluci?n': 'Solución',
        'petici?n': 'petición',
        'Petici?n': 'Petición',
        'decisi?n': 'decisión',
        'Decisi?n': 'Decisión',
        'posici?n': 'posición',
        'Posici?n': 'Posición',
        'funci?n': 'función',
        'Funci?n': 'Función',
        'reuni?n': 'reunión',
        'Reuni?n': 'Reunión',
        'opini?n': 'opinión',
        'Opini?n': 'Opinión',
        'relaci?n': 'relación',
        'Relaci?n': 'Relación',
        'cuesti?n': 'cuestión',
        'Cuesti?n': 'Cuestión',
        'creaci?n': 'creación',
        'Creaci?n': 'Creación',
        'formaci?n': 'formación',
        'Formaci?n': 'Formación',
        'presentaci?n': 'presentación',
        'Presentaci?n': 'Presentación',
        'representaci?n': 'representación',
        'Representaci?n': 'Representación',
        'operaci?n': 'operación',
        'Operaci?n': 'Operación',
        'organizaci?n': 'organización',
        'Organizaci?n': 'Organización',
        'administraci?n': 'administración',
        'Administraci?n': 'Administración',
        'comunicaci?n': 'comunicación',
        'Comunicaci?n': 'Comunicación',
        'aplicaci?n': 'aplicación',
        'Aplicaci?n': 'Aplicación',
        'publicaci?n': 'publicación',
        'Publicaci?n': 'Publicación',
        'clasificaci?n': 'clasificación',
        'Clasificaci?n': 'Clasificación',
        'certificaci?n': 'certificación',
        'Certificaci?n': 'Certificación',
        'planificaci?n': 'planificación',
        'Planificaci?n': 'Planificación',
        'modificaci?n': 'modificación',
        'Modificaci?n': 'Modificación',
        'evaluaci?n': 'evaluación',
        'Evaluaci?n': 'Evaluación',
        '?? Nueva Licitación': '📋 Nueva Licitación',
        '?? Exportar': '📥 Exportar',
        '?? Flujo': '🔄 Flujo',
        '?? Registro': '📋 Registro',
        '?? Activas': '✅ Activas',
        '?? Proveedores': '🏢 Proveedores',
        '?? Calendario': '📅 Calendario',
        '?? AI Pliegos': '🤖 AI Pliegos',
        '?? AI Auditor': '🔍 AI Auditor',
        '?? IA': '🤖 IA',
        '?? Guardar': '💾 Guardar',
        '?? Crear': '✅ Crear',
        '?? Nuevo': '➕ Nuevo',
        '?? Buscar': '🔍 Buscar',
        '?? Filtrar': '🎛️ Filtrar',
        '?? Cancelar': '❌ Cancelar',
        '?? Editar': '✏️ Editar',
        '?? Eliminar': '🗑️ Eliminar',
        '?? Detalles': '📄 Detalles',
        '?? Descargar': '⬇️ Descargar',
        '?? Subir': '⬆️ Subir',
        '?? Analizar': '📊 Analizar'
    }

    import re
    # We do a basic replacement of all literal ?? and ?
    original = content
    
    # First, handle ?? + space + word replacements broadly
    def emoji_repl(match):
        w = match.group(1).strip()
        word = w.lower()
        if 'guardar' in word: return '💾 ' + w
        if 'crear' in word: return '✅ ' + w
        if 'nuevo' in word: return '➕ ' + w
        if 'exportar' in word: return '📥 ' + w
        if 'importar' in word: return '📤 ' + w
        if 'imprimir' in word: return '🖨️ ' + w
        if 'buscar' in word: return '🔍 ' + w
        if 'eliminar' in word: return '🗑️ ' + w
        if 'editar' in word: return '✏️ ' + w
        if 'cancelar' in word: return '❌ ' + w
        if 'confirmar' in word: return '✅ ' + w
        if 'volver' in word: return '⬅️ ' + w
        if 'siguiente' in word: return '➡️ ' + w
        if 'anterior' in word: return '⬅️ ' + w
        if 'inicio' in word: return '🏠 ' + w
        if 'ajustes' in word: return '⚙️ ' + w
        if 'perfil' in word: return '👤 ' + w
        if 'notificaciones' in word: return '🔔 ' + w
        if 'mensajes' in word: return '✉️ ' + w
        if 'ayuda' in word: return '❓ ' + w
        if 'salir' in word: return '🚪 ' + w
        if 'entrar' in word: return '🔑 ' + w
        if 'subir' in word: return '⬆️ ' + w
        if 'descargar' in word: return '⬇️ ' + w
        if 'adjuntar' in word: return '📎 ' + w
        if 'compartir' in word: return '🔗 ' + w
        if 'copiar' in word: return '📋 ' + w
        if 'pegar' in word: return '📋 ' + w
        if 'agregar' in word: return '➕ ' + w
        if 'más' in word or 'm?s' in word: return '➕ ' + w
        if 'menos' in word: return '➖ ' + w
        if 'actualizar' in word: return '🔄 ' + w
        if 'cargar' in word: return '🔄 ' + w
        if 'generar' in word: return '⚡ ' + w
        if 'procesar' in word: return '⚙️ ' + w
        if 'analizar' in word: return '📊 ' + w
        if 'evaluar' in word: return '⚖️ ' + w
        if 'aprobar' in word: return '✅ ' + w
        if 'rechazar' in word: return '❌ ' + w
        if 'enviar' in word: return '📤 ' + w
        if 'recibir' in word: return '📥 ' + w
        if 'pagar' in word: return '💳 ' + w
        if 'cobrar' in word: return '💰 ' + w
        if 'facturar' in word: return '🧾 ' + w
        if 'impresión' in word: return '🖨️ ' + w
        if 'reporte' in word: return '📊 ' + w
        if 'estadísticas' in word: return '📈 ' + w
        if 'gráficos' in word: return '📉 ' + w
        if 'mapa' in word: return '🗺️ ' + w
        if 'ubicación' in word: return '📍 ' + w
        if 'dirección' in word: return '📍 ' + w
        if 'ciudadano' in word: return '👤 ' + w
        if 'vecino' in word: return '👤 ' + w
        if 'usuario' in word: return '👤 ' + w
        if 'administrador' in word: return '👨‍💼 ' + w
        if 'personal' in word: return '🧑‍🤝‍🧑 ' + w
        if 'rrhh' in word: return '👥 ' + w
        if 'hacienda' in word: return '💰 ' + w
        if 'obras' in word: return '🏗️ ' + w
        if 'servicios' in word: return '🔧 ' + w
        if 'control' in word: return '🚦 ' + w
        if 'manuales' in word: return '📚 ' + w
        if 'talleres' in word: return '🛠️ ' + w
        if 'presentación' in word: return '🎬 ' + w
        if 'landing' in word: return '🛬 ' + w
        if 'upload' in word: return '⬆️ ' + w
        if 'forms' in word: return '📝 ' + w
        if 'analytics' in word: return '📊 ' + w
        if 'presupuesto' in word: return '💰 ' + w
        if 'cuentas' in word: return '🧾 ' + w
        if 'claras' in word: return '✨ ' + w
        if 'offline' in word: return '📶 ' + w
        if 'whatsapp' in word: return '💬 ' + w
        if 'error' in word: return '❌ ' + w
        if 'éxito' in word: return '✅ ' + w
        if 'advertencia' in word: return '⚠️ ' + w
        if 'info' in word: return 'ℹ️ ' + w
        if 'pregunta' in word: return '❓ ' + w
        if 'ai' in word or 'ia ' in word: return '🤖 ' + w
        if 'licita' in word: return '📋 ' + w
        if 'proveedor' in word: return '🏢 ' + w
        if 'calendario' in word: return '📅 ' + w
        if 'registro' in word: return '📋 ' + w
        if 'activas' in word: return '✅ ' + w
        if 'flujo' in word: return '🔄 ' + w
        return '🔹 ' + w

    content = re.sub(r'\?\?\s*([A-Za-z0-9_ÁÉÍÓÚáéíóúÑñ\?]+)', emoji_repl, content)

    # Next, the specific ones
    for k, v in replaces.items():
        content = content.replace(k, v)

    # Any remaining ??
    content = content.replace('??', '🔹')

    # Fix meta and scripts
    if '<meta charset="UTF-8"' not in content and '<meta charset="utf-8"' not in content:
        content = content.replace('<head>', '<head>\n  <meta charset="UTF-8" />')
        
    if 'css/dashboard.css' not in content:
        content = content.replace('</title>', '</title>\n  <link rel="stylesheet" href="css/dashboard.css" />')
        
    if 'js/theme-switcher.js' not in content:
        content = content.replace('</body>', '  <script src="js/theme-switcher.js"></script>\n</body>')
        
    if 'js/nav.js' not in content:
        content = content.replace('</body>', '  <script src="js/nav.js"></script>\n</body>')

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {path}")

for f in glob.glob('*.html'):
    fix_file(f)
