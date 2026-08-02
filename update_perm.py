import re

with open('js/permissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """    INTENDENTE: {
      'dashboard': ['read','export'],
      'presupuesto': ['read','export'],
      'rrhh': ['read','export'],
      'licitaciones': ['read','export'],
      'vecinos': ['read','export'],
      'mapa': ['read','export'],
      'analytics': ['read','export'],
      'reportes': ['read','export'],
      'control': ['read','export'],
      'hacienda': ['read','export'],
      'exportar': ['read','export'],
      'ia': ['read','write'],
      'whatsapp': ['read'],
      'obras': ['read','export'],
      'proveedores': ['read'],
      'pagos': ['read','export'],
      'cuentas-claras': ['read','export'],
      'ciudadano': ['read'],
      'index': ['read']
    },"""

content = re.sub(r'INTENDENTE:\s*\{[\s\S]*?\},', replacement + '\n', content)

with open('js/permissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("permissions updated")
