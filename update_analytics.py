import re

with open('analytics.html', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """    document.addEventListener('DOMContentLoaded', function() {
      if (typeof buildSidebar === 'function') buildSidebar('analytics');
      
      // Wait for Chart.js to load
      function initCharts() {
        if (window.Chart && window.MuniCharts) {
          try { MuniCharts.gastoMensual('chartEjecucion'); } catch(e) { console.error('gastoMensual', e); }
          try { MuniCharts.presupuesto('chartAreas'); } catch(e) { console.error('presupuesto', e); }
          try { MuniCharts.reclamosTipo('chartReclamosTipo'); } catch(e) { console.error('reclamosTipo', e); }
          try { MuniCharts.horasExtra('chartPersonal'); } catch(e) { console.error('horasExtra', e); }
        } else {
          setTimeout(initCharts, 200);
        }
      }
      setTimeout(initCharts, 500);
    });"""

content = re.sub(r"document\.addEventListener\('DOMContentLoaded', function\(\) \{\s*if \(typeof buildSidebar === 'function'\) buildSidebar\('analytics'\);\s*setTimeout\(function\(\) \{\s*if \(window\.MuniCharts\) \{[\s\S]*?\}\s*\}, 300\);\s*\}\);", replacement, content)

with open('analytics.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("analytics.html updated")
