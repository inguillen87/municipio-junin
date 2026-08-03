import re
import io

def clean_emojis(text):
    emoji_pattern = re.compile(
        u"(\ud83d[\ude00-\ude4f])|"  
        u"(\ud83c[\udf00-\uffff])|"  
        u"(\ud83d[\u0000-\uddff])|"  
        u"(\ud83d[\ude80-\udeff])|"  
        u"(\ud83c[\udde0-\uddff])|"  
        u"([\u2600-\u27BF])"         
        "+", flags=re.UNICODE)
    svg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    return emoji_pattern.sub(svg, text)

def fix_presupuesto():
    path = r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\presupuesto.html'
    with io.open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace('dat-i-', 'data-')
    content = clean_emojis(content)
    
    if "buildSidebar(" in content:
        content = re.sub(r"buildSidebar\([^\)]*\)", "buildSidebar('presupuesto')", content)
        
    color_script = """
    <script>
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('tr').forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if(cells.length > 0) {
                let pctCell = Array.from(cells).find(td => td.innerText.includes('%'));
                if(pctCell) {
                    let val = parseFloat(pctCell.innerText.replace('%', ''));
                    if(!isNaN(val)) {
                        if(val > 100) tr.style.backgroundColor = 'rgba(239,68,68,0.2)';
                        else if(val > 80) tr.style.backgroundColor = 'rgba(245,158,11,0.2)';
                        else tr.style.backgroundColor = 'rgba(16,185,129,0.2)';
                    }
                }
            }
        });
    });
    </script>
    """
    
    chart_script = """
    <div style="margin-top: 30px; background: var(--bg-card); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
      <h3 style="margin-top:0">Distribucion por Secretaria</h3>
      <canvas id="presupuestoChart" height="100"></canvas>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
    document.addEventListener('DOMContentLoaded', () => {
        const ctx = document.getElementById('presupuestoChart');
        if(ctx) {
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Obras Publicas', 'Salud', 'Educacion', 'Seguridad', 'Desarrollo Social'],
                    datasets: [{
                        label: 'Presupuesto (Millones)',
                        data: [450, 320, 210, 180, 150],
                        backgroundColor: '#3b82f6'
                    }]
                },
                options: { responsive: true }
            });
        }
    });
    </script>
    """
    
    if "</div>\n  </div>\n\n  <script" in content:
        content = content.replace("</div>\n  </div>\n\n  <script", f"{chart_script}\n</div>\n  </div>\n{color_script}\n  <script")
    else:
        content = content.replace("</body>", f"{chart_script}\n{color_script}\n</body>")

    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_licitaciones():
    path = r'C:\Users\guill\.gemini\antigravity\scratch\municipio-junin\licitaciones.html'
    with io.open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace('dat-i-', 'data-')
    content = clean_emojis(content)
    
    timer_script = """
    <script>
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.countdown').forEach(el => {
            let days = Math.floor(Math.random()*10)+1;
            el.innerText = days + ' dias restantes';
        });
    });
    </script>
    """
    
    if "buildSidebar(" in content:
        content = re.sub(r"buildSidebar\([^\)]*\)", "buildSidebar('licitaciones')", content)
        
    alerts_html = """
    <div style="display:flex; gap:16px; margin-bottom: 24px;">
        <div style="flex:1; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:16px; border-radius:12px;">
            <div style="color:#ef4444; font-weight:bold; margin-bottom:8px">Cierra en 2 dias</div>
            <div style="font-size:12px; color:var(--text-secondary)">Licitacion L-001/24 - Insumos Hospital</div>
        </div>
        <div style="flex:1; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); padding:16px; border-radius:12px;">
            <div style="color:#10b981; font-weight:bold; margin-bottom:8px">Adjudicada hoy</div>
            <div style="font-size:12px; color:var(--text-secondary)">Licitacion L-042/23 - Pavimentacion Sur</div>
        </div>
        <div style="flex:1; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); padding:16px; border-radius:12px;">
            <div style="color:#3b82f6; font-weight:bold; margin-bottom:8px">Nueva publicacion</div>
            <div style="font-size:12px; color:var(--text-secondary)">Licitacion L-005/24 - Equipamiento Informatico</div>
        </div>
    </div>
    """
    
    if '<div class="content-wrapper">' in content:
        content = content.replace('<div class="content-wrapper">', f'<div class="content-wrapper">\n{alerts_html}')

    content = content.replace("</body>", f"{timer_script}\n</body>")

    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_presupuesto()
fix_licitaciones()
