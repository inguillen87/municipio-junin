import re

with open('hacienda.html', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """    <header class="page-header" style="display:flex; align-items:center;">
      <div style="display:flex; align-items:center; gap:16px;">
        <button class="menu-btn" id="menuBtn" style="font-size:24px; background:none; border:none; color:inherit; cursor:pointer;">&#9776;</button>
        <div>
          <h1 style="margin:0;">Hacienda y Finanzas</h1>
          <p class="text-muted" style="margin:0;">Gestión integral del presupuesto municipal y pagos</p>
        </div>
      </div>"""

content = re.sub(r'<header class="page-header">\s*<div>\s*<h1>Hacienda y Finanzas</h1>\s*<p class="text-muted">Gestión integral del presupuesto municipal y pagos</p>\s*</div>', replacement, content)

with open('hacienda.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("hacienda.html menuBtn added")
