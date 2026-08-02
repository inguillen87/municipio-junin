import re

with open('analytics.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Change canvas IDs
content = content.replace('id="chartEjecucion"', 'id="chartGastoMensual"')
content = content.replace('id="chartAreas"', 'id="chartPresupuestoDoughnut"')
content = content.replace('id="chartReclamosTipo"', 'id="chartReclamosTipo"')
content = content.replace('id="chartPersonal"', 'id="chartHorasExtra"')

replacement = """document.addEventListener('DOMContentLoaded', function() {
  if (typeof buildSidebar === 'function') buildSidebar('analytics');
  
  // Wait for Chart.js to load
  function initCharts() {
    if (window.Chart && window.MuniCharts) {
      try { MuniCharts.gastoMensual('chartGastoMensual'); } catch(e) { console.error('gastoMensual', e); }
      try { MuniCharts.presupuesto('chartPresupuestoDoughnut'); } catch(e) { console.error('presupuesto', e); }
      try { MuniCharts.reclamosTipo('chartReclamosTipo'); } catch(e) { console.error('reclamosTipo', e); }
      try { MuniCharts.horasExtra('chartHorasExtra'); } catch(e) { console.error('horasExtra', e); }
    } else {
      setTimeout(initCharts, 200);
    }
  }
  setTimeout(initCharts, 500);
});"""

content = re.sub(r"document\.addEventListener\('DOMContentLoaded', function\(\) \{[\s\S]*?setTimeout\(initCharts, 500\);\s*\}\);", replacement, content)

with open('analytics.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("analytics.html canvas updated")
