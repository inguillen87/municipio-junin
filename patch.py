import re

content = open('licitaciones.html', 'r', encoding='utf-8').read()

# 1. RBAC
rbac_code = '''    document.getElementById('btnNuevaLic').onclick = () => {
      const user = window.MuniDB ? window.MuniDB.getAll('session')[0] : null;
      if (user && user.role !== 'admin') {
        window.toast && toast('Acceso denegado', 'Solo administradores pueden crear licitaciones', 'error');
        return;
      }
      document.getElementById('modalNuevaLic').style.display = 'flex';
    };'''
content = re.sub(r"document\.getElementById\('btnNuevaLic'\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*document\.getElementById\('modalNuevaLic'\)\.style\.display\s*=\s*'flex';\s*\};", rbac_code, content)

# 2. Countdowns
countdown_logic = '''function colorBadgeDias(dias) {
  if (dias > 30) return { bg: 'rgba(16,185,129,0.1)', color: '#10b981' };
  if (dias > 7) return { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' };
  if (dias > 0) return { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' };
  return { bg: 'rgba(100,116,139,0.1)', color: '#64748b' };
}
function diasHasta(dateStr) {
  const d = new Date(dateStr);
  const diff = Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}
function addCountdowns() {
    document.querySelectorAll('[data-vencimiento]').forEach(function(el) {
        if(el.querySelector('span.badge-dias')) return; 
        const dias = diasHasta(el.dataset.vencimiento);
        const style = colorBadgeDias(dias);
        const badge = document.createElement('span');
        badge.className = 'badge-dias';
        badge.style.cssText = `font-size:10px;font-weight:800;padding:2px 8px;border-radius:99px;margin-left:6px;background:${style.bg};color:${style.color}`;
        badge.textContent = dias < 0 ? 'VENCIDA' : 'Faltan ' + dias + 'd';
        el.appendChild(badge);
    });
}'''

content = re.sub(r'function addCountdowns\(\) \{.*?\}(?=\s*const oldRender|\s*</script>)', countdown_logic, content, flags=re.DOTALL)

# 3. Sortable headers
sort_script = '''
let currentSort = { col: null, asc: true };
function sortTable(colIdx, type) {
  const tbody = document.getElementById('tbodyLicitaciones');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  currentSort.asc = currentSort.col === colIdx ? !currentSort.asc : true;
  currentSort.col = colIdx;
  
  rows.sort((a, b) => {
    let valA = a.cells[colIdx].innerText.replace(/[\$,]/g, '').trim();
    let valB = b.cells[colIdx].innerText.replace(/[\$,]/g, '').trim();
    if (type === 'num') {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
      return currentSort.asc ? valA - valB : valB - valA;
    }
    return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });
  
  tbody.innerHTML = '';
  rows.forEach(r => tbody.appendChild(r));
  setTimeout(addCountdowns, 50);
}
'''
content = content.replace('// Table Logic', sort_script + '\n      // Table Logic')

headers = '''                <tr>
                  <th style="cursor:pointer" onclick="sortTable(0, 'str')">ID ↕</th>
                  <th style="cursor:pointer" onclick="sortTable(1, 'str')">Título ↕</th>
                  <th style="cursor:pointer" onclick="sortTable(2, 'str')">Tipo ↕</th>
                  <th style="cursor:pointer" onclick="sortTable(3, 'num')">Monto ↕</th>
                  <th style="cursor:pointer" onclick="sortTable(4, 'str')">Secretaría ↕</th>
                  <th style="cursor:pointer" onclick="sortTable(5, 'str')">Estado ↕</th>
                  <th style="cursor:pointer" onclick="sortTable(6, 'str')">Apertura ↕</th>
                  <th style="cursor:pointer" onclick="sortTable(7, 'str')">Vencimiento ↕</th>
                  <th>Acciones</th>
                </tr>'''

content = re.sub(r'<tr>\s*<th>ID</th>\s*<th>T.*?Acciones</th>\s*</tr>', headers, content, flags=re.DOTALL)

with open('licitaciones.html', 'w', encoding='utf-8') as f:
    f.write(content)
