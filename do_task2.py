import re

with open("presupuesto.html", "r", encoding="utf-8") as f:
    content = f.read()

insertion = """          <!-- COMPARISON & ALERTS -->
          <div style="margin-top:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h2 style="font-family:'Outfit',sans-serif;font-size:16px;font-weight:800">📊 Comparativa y Alertas por Secretaría</h2>
            </div>
            <div class="partidas-table">
              <table style="width:100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                    <th style="padding: 12px 16px;">Secretaría</th>
                    <th style="padding: 12px 16px;">Mes Anterior</th>
                    <th style="padding: 12px 16px;">Mes Actual</th>
                    <th style="padding: 12px 16px;">Asignado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr data-secretaria="Obras Públicas" data-ejecutado="12000000" data-asignado="10000000">
                    <td style="padding: 12px 16px; font-weight:bold;">Obras Públicas</td>
                    <td style="padding: 12px 16px;">$8.5M</td>
                    <td style="padding: 12px 16px;">$12.0M</td>
                    <td style="padding: 12px 16px;">$10.0M</td>
                  </tr>
                  <tr data-secretaria="Personal" data-ejecutado="45000000" data-asignado="44000000">
                    <td style="padding: 12px 16px; font-weight:bold;">Personal</td>
                    <td style="padding: 12px 16px;">$43.2M</td>
                    <td style="padding: 12px 16px;">$45.0M</td>
                    <td style="padding: 12px 16px;">$44.0M</td>
                  </tr>
                  <tr data-secretaria="Servicios" data-ejecutado="18000000" data-asignado="25000000">
                    <td style="padding: 12px 16px; font-weight:bold;">Servicios</td>
                    <td style="padding: 12px 16px;">$16.5M</td>
                    <td style="padding: 12px 16px;">$18.0M</td>
                    <td style="padding: 12px 16px;">$25.0M</td>
                  </tr>
                  <tr data-secretaria="Desarrollo Social" data-ejecutado="8500000" data-asignado="9000000">
                    <td style="padding: 12px 16px; font-weight:bold;">Desarrollo Social</td>
                    <td style="padding: 12px 16px;">$8.1M</td>
                    <td style="padding: 12px 16px;">$8.5M</td>
                    <td style="padding: 12px 16px;">$9.0M</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
"""

content = content.replace("          </div>\n        </div>\n\n        <!-- SIDEBAR -->", "          </div>\n" + insertion + "        </div>\n\n        <!-- SIDEBAR -->")

js_insertion = """    }, 50);
  }

  // Color code budget rows based on execution
  setTimeout(() => {
    document.querySelectorAll('.presupuesto-row, tr[data-secretaria]').forEach(function(row) {
        const ejecutado = parseFloat(row.dataset.ejecutado || 0);
        const asignado = parseFloat(row.dataset.asignado || 1);
        const pct = ejecutado / asignado;
        if (pct > 1.0) {
            row.style.borderLeft = '3px solid #ef4444';
            row.style.background = 'rgba(239,68,68,0.04)';
        } else if (pct > 0.9) {
            row.style.borderLeft = '3px solid #f59e0b';
            row.style.background = 'rgba(245,158,11,0.03)';
        } else {
            row.style.borderLeft = '3px solid #10b981';
        }
    });
  }, 100);
"""

content = content.replace("    }, 50);\n  }", js_insertion)

# Since git shows multiple lines diff for the last replace which was buggy, I am replacing the original checkout
import subprocess
subprocess.run(["git", "checkout", "presupuesto.html"])

with open("presupuesto.html", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("          </div>\n        </div>\n\n        <!-- SIDEBAR -->", "          </div>\n" + insertion + "        </div>\n\n        <!-- SIDEBAR -->")
content = content.replace("    }, 50);\n  }", js_insertion)

with open("presupuesto.html", "w", encoding="utf-8") as f:
    f.write(content)
