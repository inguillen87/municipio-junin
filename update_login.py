import re

with open('login.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the USERS array
new_users = """    var USERS = [
  { email:'superadmin@municontrol.com', password:'SuperAdmin2026!', name:'Super Admin', role:'SUPER_ADMIN', roleLabel: 'Super Admin', icon: '⚡', color: '#f59e0b', idRole: 'super', secretaria:'Sistema' },
  { email:'intendente@junin.gob.ar', password:'Junin2026!', name:'Marcelo Gutiérrez', role:'INTENDENTE', roleLabel: '👑 Intendente', icon: '🏛️', color: '#3b82f6', idRole: 'intendente', secretaria:'Intendencia' },
  { email:'hacienda@junin.gob.ar', password:'Hacienda2026!', name:'María García', role:'TENANT_ADMIN', roleLabel: '🏦 Hacienda', icon: '💰', color: '#10b981', idRole: 'hacienda', secretaria:'Hacienda' },
  { email:'rrhh@junin.gob.ar', password:'RRHH2026!', name:'Carlos López', role:'TENANT_USER', roleLabel: '👥 RRHH', icon: '👥', color: '#8b5cf6', idRole: 'rrhh', secretaria:'RRHH' },
  { email:'analista@junin.gob.ar', password:'Analytics2026!', name:'Ana Martínez', role:'TENANT_USER', roleLabel: '📊 Analytics', icon: '📊', color: '#f43f5e', idRole: 'analytics', secretaria:'Analítica' },
  { email:'demo@demo.com', password:'demo123', name:'Usuario Demo', role:'DEMO', roleLabel: '🔰 Demo', icon: '🌐', color: '#06b6d4', idRole: 'demo', secretaria:'Demo' }
];"""

content = re.sub(r'var USERS = \[[\s\S]*?\];', new_users, content)

with open('login.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("login.html updated")
