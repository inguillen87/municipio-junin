import glob
import re

def fix_file(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    original = content

    # The actual broken characters are often U+FFFD (replacement character)
    # The powershell `?? ` might be `\ufffd\ufffd ` or `\ufffd\ufffd`
    
    # Let's fix specific words that might have \ufffd instead of ?
    replaces = {
        'Licitaciones y Compras \ufffd MuniControl': 'Licitaciones y Compras | MuniControl',
        'Municipal Jun\ufffdn': 'Municipal Junín',
        'Licitaci\ufffdn': 'Licitación',
        'licitaci\ufffdn': 'licitación',
        'Evaluaci\ufffdn': 'Evaluación',
        'T\ufffdtulo': 'Título',
        '\ufffdrea': 'Área',
        'descripci\ufffdn': 'descripción',
        'Descripci\ufffdn': 'Descripción',
        'a\ufffdo': 'año',
        'A\ufffdo': 'Año',
        'p\ufffdblico': 'público',
        'P\ufffdblico': 'Público',
        'Informaci\ufffdn': 'Información',
        'Gesti\ufffdn': 'Gestión',
        'N\ufffdmero': 'Número',
        'n\ufffdmero': 'número',
        'D\ufffda': 'Día',
        'd\ufffda': 'día',
        'veh\ufffdculo': 'vehículo',
        'Veh\ufffdculo': 'Vehículo',
        'Tel\ufffdfono': 'Teléfono',
        'tel\ufffdfono': 'teléfono',
        'Atenci\ufffdn': 'Atención',
        'Inversi\ufffdn': 'Inversión',
        'Participaci\ufffdn': 'Participación',
        'Ejecuci\ufffdn': 'Ejecución',
        'Ubicaci\ufffdn': 'Ubicación',
        'Acci\ufffdn': 'Acción',
        'Direcci\ufffdn': 'Dirección',
        'Secci\ufffdn': 'Sección',
        'Asignaci\ufffdn': 'Asignación',
        'Pr\ufffdximo': 'Próximo',
        'pr\ufffdximo': 'próximo',
        'tr\ufffdmite': 'trámite',
        'Tr\ufffdmite': 'Trámite',
        'Categor\ufffda': 'Categoría',
        'categor\ufffda': 'categoría',
        'Pol\ufffdtica': 'Política',
        'Ocupaci\ufffdn': 'Ocupación',
        'Asociaci\ufffdn': 'Asociación',
        'aprobaci\ufffdn': 'aprobación',
        'Aprobaci\ufffdn': 'Aprobación',
        'p\ufffdgina': 'página',
        'P\ufffdgina': 'Página',
        'B\ufffdsqueda': 'Búsqueda',
        'b\ufffdsqueda': 'búsqueda',
        'Comit\ufffd': 'Comité',
        'comit\ufffd': 'comité',
        'est\ufffd': 'está',
        'Est\ufffd': 'Está',
        'aqu\ufffd': 'aquí',
        'Aqu\ufffd': 'Aquí',
        'seg\ufffdn': 'según',
        'Seg\ufffdn': 'Según',
        'Tambi\ufffdn': 'También',
        'tambi\ufffdn': 'también',
        'qu\ufffd': 'qué',
        'Qu\ufffd': 'Qué',
        'c\ufffdmo': 'cómo',
        'C\ufffdmo': 'Cómo',
        'cu\ufffdndo': 'cuándo',
        'Cu\ufffdndo': 'Cuándo',
        'd\ufffdnde': 'dónde',
        'D\ufffdnde': 'Dónde',
        'qui\ufffdn': 'quién',
        'Qui\ufffdn': 'Quién',
        'cu\ufffdl': 'cuál',
        'Cu\ufffdl': 'Cuál',
        'cu\ufffdntos': 'cuántos',
        'Cu\ufffdntos': 'Cuántos',
        'cu\ufffdnto': 'cuánto',
        'Cu\ufffdnto': 'Cuánto',
        'podr\ufffda': 'podría',
        'Podr\ufffda': 'Podría',
        'ser\ufffd': 'será',
        'Ser\ufffd': 'Será',
        'har\ufffd': 'hará',
        'Har\ufffd': 'Hará',
        'habr\ufffd': 'habrá',
        'Habr\ufffd': 'Habrá',
        'tendr\ufffd': 'tendrá',
        'Tendr\ufffd': 'Tendrá',
        'est\ufffdn': 'están',
        'Est\ufffdn': 'Están',
        'ser\ufffdn': 'serán',
        'Ser\ufffdn': 'Serán',
        'har\ufffdn': 'harán',
        'Har\ufffdn': 'Harán',
        'habr\ufffdn': 'habrán',
        'Habr\ufffdn': 'Habrán',
        'tendr\ufffdn': 'tendrán',
        'Tendr\ufffdn': 'Tendrán',
        'podr\ufffdn': 'podrán',
        'Podr\ufffdn': 'Podrán',
        'deber\ufffd': 'deberá',
        'Deber\ufffd': 'Deberá',
        'deber\ufffdn': 'deberán',
        'Deber\ufffdn': 'Deberán',
        'tambi\ufffdn': 'también',
        'Tambi\ufffdn': 'También',
        'adem\ufffds': 'además',
        'Adem\ufffds': 'Además',
        'despu\ufffds': 'después',
        'Despu\ufffds': 'Después',
        'atr\ufffds': 'atrás',
        'Atr\ufffds': 'Atrás',
        'm\ufffds': 'más',
        'M\ufffds': 'Más',
        'a\ufffdn': 'aún',
        'A\ufffdn': 'Aún',
        's\ufffdlo': 'sólo',
        'S\ufffdlo': 'Sólo',
        'S\ufffd': 'Sí',
        's\ufffd': 'sí',
        'M\ufffd': 'Mí',
        'm\ufffd': 'mí',
        'T\ufffd': 'Tú',
        't\ufffd': 'tú',
        'El\ufffd': 'Él',
        'el\ufffd': 'él',
        'c\ufffddigo': 'código',
        'C\ufffddigo': 'Código',
        'art\ufffdculo': 'artículo',
        'Art\ufffdculo': 'Artículo',
        'pr\ufffdctica': 'práctica',
        'Pr\ufffdctica': 'Práctica',
        't\ufffdrmino': 'término',
        'T\ufffdrmino': 'Término',
        '\ufffdltimo': 'último',
        '\ufffdltimo': 'Último',
        '\ufffdnico': 'único',
        '\ufffdnico': 'Único',
        'r\ufffdpido': 'rápido',
        'R\ufffdpido': 'Rápido',
        'f\ufffdcil': 'fácil',
        'F\ufffdcil': 'Fácil',
        'dif\ufffdcil': 'difícil',
        'Dif\ufffdcil': 'Difícil',
        '\ufffdtil': 'útil',
        '\ufffdtil': 'Útil',
        'D\ufffdlar': 'Dólar',
        'd\ufffdlar': 'dólar',
        'c\ufffdlculo': 'cálculo',
        'C\ufffdlculo': 'Cálculo',
        'an\ufffdlisis': 'análisis',
        'An\ufffdlisis': 'Análisis',
        'estad\ufffdstica': 'estadística',
        'Estad\ufffdstica': 'Estadística',
        'pol\ufffdtica': 'política',
        'Pol\ufffdtica': 'Política',
        'econ\ufffdmico': 'económico',
        'Econ\ufffdmico': 'Económico',
        'p\ufffdliza': 'póliza',
        'P\ufffdliza': 'Póliza',
        'tr\ufffdnsito': 'tránsito',
        'Tr\ufffdnsito': 'Tránsito',
        'v\ufffda': 'vía',
        'V\ufffda': 'Vía',
        'R\ufffdo': 'Río',
        'r\ufffdo': 'río',
        'Comisi\ufffdn': 'Comisión',
        'comisi\ufffdn': 'comisión',
        'versi\ufffdn': 'versión',
        'Versi\ufffdn': 'Versión',
        'opci\ufffdn': 'opción',
        'Opci\ufffdn': 'Opción',
        'situaci\ufffdn': 'situación',
        'Situaci\ufffdn': 'Situación',
        'condici\ufffdn': 'condición',
        'Condici\ufffdn': 'Condición',
        'soluci\ufffdn': 'solución',
        'Soluci\ufffdn': 'Solución',
        'petici\ufffdn': 'petición',
        'Petici\ufffdn': 'Petición',
        'decisi\ufffdn': 'decisión',
        'Decisi\ufffdn': 'Decisión',
        'posici\ufffdn': 'posición',
        'Posici\ufffdn': 'Posición',
        'funci\ufffdn': 'función',
        'Funci\ufffdn': 'Función',
        'reuni\ufffdn': 'reunión',
        'Reuni\ufffdn': 'Reunión',
        'opini\ufffdn': 'opinión',
        'Opini\ufffdn': 'Opinión',
        'relaci\ufffdn': 'relación',
        'Relaci\ufffdn': 'Relación',
        'cuesti\ufffdn': 'cuestión',
        'Cuesti\ufffdn': 'Cuestión',
        'creaci\ufffdn': 'creación',
        'Creaci\ufffdn': 'Creación',
        'formaci\ufffdn': 'formación',
        'Formaci\ufffdn': 'Formación',
        'presentaci\ufffdn': 'presentación',
        'Presentaci\ufffdn': 'Presentación',
        'representaci\ufffdn': 'representación',
        'Representaci\ufffdn': 'Representación',
        'operaci\ufffdn': 'operación',
        'Operaci\ufffdn': 'Operación',
        'organizaci\ufffdn': 'organización',
        'Organizaci\ufffdn': 'Organización',
        'administraci\ufffdn': 'administración',
        'Administraci\ufffdn': 'Administración',
        'comunicaci\ufffdn': 'comunicación',
        'Comunicaci\ufffdn': 'Comunicación',
        'aplicaci\ufffdn': 'aplicación',
        'Aplicaci\ufffdn': 'Aplicación',
        'publicaci\ufffdn': 'publicación',
        'Publicaci\ufffdn': 'Publicación',
        'clasificaci\ufffdn': 'clasificación',
        'Clasificaci\ufffdn': 'Clasificación',
        'certificaci\ufffdn': 'certificación',
        'Certificaci\ufffdn': 'Certificación',
        'planificaci\ufffdn': 'planificación',
        'Planificaci\ufffdn': 'Planificación',
        'modificaci\ufffdn': 'modificación',
        'Modificaci\ufffdn': 'Modificación',
        'evaluaci\ufffdn': 'evaluación',
        'Evaluaci\ufffdn': 'Evaluación'
    }

    for k, v in replaces.items():
        content = content.replace(k, v)

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
        if 'más' in word or 'm\ufffds' in word: return '➕ ' + w
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

    content = re.sub(r'\ufffd\ufffd\s*([A-Za-z0-9_ÁÉÍÓÚáéíóúÑñ\ufffd]+)', emoji_repl, content)
    content = re.sub(r'\?\?\s*([A-Za-z0-9_ÁÉÍÓÚáéíóúÑñ\ufffd]+)', emoji_repl, content)
    
    content = content.replace('\ufffd\ufffd', '🔹')
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
