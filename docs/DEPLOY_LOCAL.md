# 🐳 Deploy Local — Rack Municipal
## Municipalidad de Junín · Jefatura de Tecnología

## Requisitos previos

- Docker Engine 24+ y Docker Compose v2
- 8 GB RAM mínimo (16 GB recomendado para Ollama)
- 50 GB disco libre
- Puerto 80 y 443 disponibles

## Instalación en un comando

```bash
# 1. Clonar el repositorio
git clone https://github.com/inguillen87/municipio-junin.git
cd municipio-junin/infra

# 2. Configurar variables de entorno
cp .env.example .env
nano .env   # Editar passwords

# 3. Levantar todo
docker compose up -d

# 4. Ver logs
docker compose logs -f

# 5. Abrir en el navegador
open http://localhost
```

## Servicios disponibles

| Servicio | Puerto | URL |
|----------|--------|-----|
| Sistema web | 80/443 | http://localhost |
| API REST | 3001 | http://localhost/api |
| PostgreSQL | 5432 | psql -h localhost |
| PgAdmin | 5050 | http://localhost:5050 |
| MinIO | 9001 | http://localhost:9001 |
| Ollama | 11434 | http://localhost:11434 |

## Comandos útiles

```bash
# Ver estado de todos los servicios
docker compose ps

# Reiniciar un servicio
docker compose restart api

# Ver logs de PostgreSQL
docker compose logs postgres -f

# Backup de la base de datos
docker compose exec postgres pg_dump -U junin_user junin_db > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker compose exec -T postgres psql -U junin_user junin_db < backup.sql

# Actualizar el sistema
git pull
docker compose up -d --build

# Descargar modelo de IA (Llama 3.1)
docker compose exec ollama ollama pull llama3.1:8b

# Detener todo
docker compose down
```

## Certificados SSL

```bash
# Generar certificado autofirmado (desarrollo)
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/C=AR/ST=Mendoza/L=Junin/O=Municipalidad/CN=gestion.municipiojunin.gob.ar"

# Para producción: usar Let's Encrypt con Certbot
# certbot certonly --nginx -d gestion.municipiojunin.gob.ar
```

## Soberanía de datos

Todos los datos residen exclusivamente en el servidor del municipio.
Ningún dato sale a la nube. La IA (Ollama) corre 100% localmente.
