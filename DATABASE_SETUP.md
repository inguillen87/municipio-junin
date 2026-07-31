# 🗄️ Configuración de Base de Datos
## PostgreSQL — Municipalidad de Junín

---

## Opción A: Supabase (recomendado para piloto)

Supabase es PostgreSQL gratuito en la nube, ideal para los primeros meses.

1. Ir a https://supabase.com → **Nuevo proyecto**
2. Nombre: `municipio-junin`
3. Password: (guardar en lugar seguro)
4. Región: `South America (São Paulo)`
5. Clic en **"Create new project"**

### Obtener la URL de conexión:
- Settings → **Database** → **Connection string** → **URI**
- Copiar y pegar en Vercel como `DATABASE_URL`

### Ejecutar el schema:
- En Supabase → **SQL Editor**
- Copiar y ejecutar el contenido de `backend/db/schema.sql`

---

## Opción B: PostgreSQL remoto de la municipalidad

```bash
# Requerimientos del servidor de la muni:
# - PostgreSQL 13+ installed
# - Puerto 5432 accesible desde internet (o VPN)
# - Usuario de solo lectura para el piloto

# Crear usuario de solo lectura:
psql -U postgres
CREATE USER govtech_readonly WITH PASSWORD 'contraseña-segura';
GRANT CONNECT ON DATABASE nombre_db TO govtech_readonly;
GRANT USAGE ON SCHEMA public TO govtech_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO govtech_readonly;
```

### Configurar en Vercel:
```
DATABASE_URL=postgresql://govtech_readonly:contraseña@ip-servidor:5432/nombre_db?sslmode=require
```

---

## Opción C: Import desde Excel (sin DB)

Si la municipalidad no puede dar acceso remoto, podés importar datos periódicamente:

1. Ir a **/upload.html** en el sistema
2. Subir el archivo Excel o CSV
3. El sistema lo procesa y muestra en los módulos
4. Repetir cuando haya datos nuevos (diario, semanal, etc.)

---

## Schema de la base de datos

Ver archivo `backend/db/schema.sql` para el esquema completo.

### Tablas principales:

| Tabla | Descripción |
|-------|-------------|
| `empleados` | Personal municipal |
| `reclamos` | Reclamos vecinales |
| `contratos` | Contratos IT y servicios |
| `secretarias` | Áreas con presupuesto |
| `alertas` | Alertas del sistema |
| `licitaciones` | Procesos de compra |
| `datos_importados` | Datos cargados desde archivos |

---

## Seguridad recomendada

- ✅ Usar usuario de **solo lectura** durante el piloto
- ✅ Habilitar **SSL** (`?sslmode=require` en la URL)
- ✅ Configurar **IP whitelist** en el firewall del servidor
- ✅ Backup automático diario con `pg_dump`
- ✅ Rotar la contraseña cada 90 días
- ✅ Logs de acceso auditables
