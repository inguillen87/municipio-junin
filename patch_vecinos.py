import re

content = open('vecinos.html', 'r', encoding='utf-8').read()

js_code = '''
document.addEventListener('DOMContentLoaded', () => {
    const btnNuevo = document.getElementById('btnNuevoReclamo');
    if(btnNuevo && !btnNuevo.onclick) {
        btnNuevo.onclick = () => document.getElementById('modalReclamo').style.display = 'flex';
    }
    const btnGuardar = document.getElementById('btnGuardarReclamo');
    if(btnGuardar && !btnGuardar.onclick) {
        btnGuardar.onclick = () => {
            const tipoReclamo = document.getElementById('rTipo') ? document.getElementById('rTipo').value : 'General';
            const descripcionReclamo = document.getElementById('rDesc') ? document.getElementById('rDesc').value : '';
            const direccionReclamo = document.getElementById('rDir') ? document.getElementById('rDir').value : '';
            
            // After creating reclamo object, save to MuniDB
            if (window.MuniDB) {
              try {
                MuniDB.insert('reclamos', {
                  id: 'R-' + Date.now(),
                  tipo: tipoReclamo,
                  descripcion: descripcionReclamo,
                  direccion: direccionReclamo,
                  estado: 'pendiente',
                  prioridad: 'media',
                  barrio: 'Centro',
                  fecha: new Date().toISOString(),
                  sla: 48
                });
                console.log('[Vecinos] Reclamo saved to MuniDB');
              } catch(e) { console.error(e); }
            }
            
            document.getElementById('modalReclamo').style.display = 'none';
            if(window.toast) toast('Reclamo Guardado', 'El reclamo se registró correctamente.', 'success');
        };
    }
});
'''

content = content.replace('</body>', f'<script>\n{js_code}\n</script>\n</body>')

with open('vecinos.html', 'w', encoding='utf-8') as f:
    f.write(content)
