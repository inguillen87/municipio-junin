import os

def update_index():
    with open('index.html', 'r', encoding='latin-1') as file:
        content = file.read()
    if 'notifications.js' not in content:
        content = content.replace('</body>', '  <script src=\'js/notifications.js\'></script>\n</body>')
    kpi_script = """
<script>
// Load LIVE KPI data from MuniDB
function loadLiveKPIs() {
  if (!window.MuniDB) return;
  
  // Empleados activos
  try {
    const empleados = MuniDB.getAll('empleados');
    const activos = empleados.filter(e => e.estado === 'activo').length;
    const totalSalarios = empleados.reduce((s,e) => s + (e.salario||0), 0);
    const el = document.getElementById('kpi-empleados-val') || document.querySelector('[data-kpi="empleados"] .kpi-value');
    if (el) el.textContent = activos.toLocaleString('es-AR');
  } catch(e) {}
  
  // Reclamos pendientes
  try {
    const reclamos = MuniDB.getAll('reclamos');
    const pendientes = reclamos.filter(r => r.estado !== 'resuelto').length;
    const el2 = document.querySelector('[data-kpi="reclamos"] .kpi-value, #kpi-reclamos-val');
    if (el2) el2.textContent = pendientes;
  } catch(e) {}

  // Pagos del mes
  try {
    const pagos = MuniDB.getAll('pagos');
    const totalPagos = pagos.reduce((s,p) => s + (p.monto||0), 0);
    const el3 = document.querySelector('[data-kpi="pagos"] .kpi-value, #kpi-gastos-val');
    if (el3) el3.textContent = '$' + (totalPagos/1000000).toFixed(1) + 'M';
  } catch(e) {}
  
  // Obras en ejecucion
  try {
    const obras = MuniDB.getAll('obras');
    const enEjecucion = obras.filter(o => o.estado === 'en_ejecucion').length;
    const el4 = document.querySelector('[data-kpi="obras"] .kpi-value, #kpi-obras-val');
    if (el4) el4.textContent = enEjecucion;
  } catch(e) {}
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(loadLiveKPIs, 500);
});
</script>
</body>"""
    if 'loadLiveKPIs' not in content:
        content = content.replace('</body>', kpi_script)
    with open('index.html', 'w', encoding='utf-8') as file:
        file.write(content)

update_index()
