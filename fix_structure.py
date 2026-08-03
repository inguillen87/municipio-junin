import glob
import os

html_files = glob.glob('*.html')

for path in html_files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # 1. Check <meta charset="UTF-8"> (done by previous script, but let's be sure)
    if '<meta charset="UTF-8"' not in content and '<meta charset="utf-8"' not in content:
        if '<head>' in content:
            content = content.replace('<head>', '<head>\n  <meta charset="UTF-8" />')

    # 2. Check css/dashboard.css
    if 'css/dashboard.css' not in content:
        if '</title>' in content:
            content = content.replace('</title>', '</title>\n  <link rel="stylesheet" href="css/dashboard.css" />')

    # 3. Check theme-switcher.js
    if 'theme-switcher.js' not in content:
        content = content.replace('</body>', '  <script src="js/theme-switcher.js"></script>\n</body>')

    # 4. Check nav.js
    if 'nav.js' not in content:
        content = content.replace('</body>', '  <script src="js/nav.js"></script>\n</body>')

    # 5. Check bottom-nav.js
    if 'bottom-nav.js' not in content and '</body>' in content:
        content = content.replace('</body>', "  <script src='js/bottom-nav.js'></script>\n</body>")

    # 6. Check buildSidebar call
    # If the file has a sidebar div, it should probably call buildSidebar()
    if 'id="sidebar"' in content and 'buildSidebar(' not in content:
        # We find a suitable active ID based on the filename
        page_id = path.replace('.html', '')
        if page_id == 'index': page_id = 'dashboard'
        
        script_call = f"  <script>if(typeof buildSidebar === 'function') buildSidebar('{page_id}');</script>\n</body>"
        content = content.replace('</body>', script_call)

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed structural tags in {path}")

# Fix bottom-nav.js
with open('js/bottom-nav.js', 'r', encoding='utf-8', errors='replace') as f:
    js_content = f.read()

js_original = js_content
js_content = js_content.replace("{ icon: '\ufffd\ufffd', label: 'Inicio'", "{ icon: '🏠', label: 'Inicio'")
js_content = js_content.replace("{ icon: '\ufffd\ufffd', label: 'Presup.'", "{ icon: '💰', label: 'Presup.'")
js_content = js_content.replace("{ icon: '\ufffd\ufffd', label: 'IA'", "{ icon: '🤖', label: 'IA'")
js_content = js_content.replace("{ icon: '\ufffd\ufffd\ufffd', label: 'Vecinos'", "{ icon: '👥', label: 'Vecinos'")
js_content = js_content.replace("{ icon: '\ufffd',  label: 'M", "{ icon: '☰',  label: 'M")

js_content = js_content.replace("M\ufffds", "Más")
js_content = js_content.replace("Navegaci\ufffdn", "Navegación")

if js_content != js_original:
    with open('js/bottom-nav.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
    print("Fixed bottom-nav.js")

