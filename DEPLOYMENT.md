# 🚀 Guía de Deploy — GovTech Platform
## Municipalidad de Junín · Sistema Municipal v2.0

---

## Opción 1: Deploy en Vercel (recomendado)

Vercel despliega automáticamente cada vez que hacés `git push`.

### Primera vez:
```bash
# 1. Clonar el repositorio
git clone https://github.com/inguillen87/municipio-junin.git
cd municipio-junin

# 2. Instalar Vercel CLI
npm install -g vercel

# 3. Linkear el proyecto
vercel link

# 4. Configurar variables de entorno (ver lista abajo)
vercel env add JWT_SECRET
vercel env add DATABASE_URL
vercel env add WHATSAPP_PHONE_NUMBER_ID
vercel env add WHATSAPP_ACCESS_TOKEN
# etc...

# 5. Deploy a producción
vercel deploy --prod --yes
```

### Deploy continuo:
```bash
git add .
git commit -m "feat: nueva funcionalidad"
git push  # Vercel despliega automáticamente en ~45 segundos
```

### URLs resultantes:
- **Producción**: https://municipio-junin.vercel.app
- **Preview**: https://municipio-junin-[hash]-marcelos-projects.vercel.app

---

## Opción 2: Servidor local (desarrollo)

```bash
# Frontend: cualquier servidor estático
npx serve . -p 8080
# o abrir directamente index.html en el navegador

# Backend:
cd backend
cp .env.example .env
# Editar .env con tus credenciales
npm install
npm run dev
# API en http://localhost:3001
```

---

## Opción 3: Servidor municipal (VPS/On-premise)

```bash
# 1. Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clonar el repo
git clone https://github.com/inguillen87/municipio-junin.git /var/www/municipio-junin
cd /var/www/municipio-junin/backend
npm install --production

# 3. Configurar variables
cp .env.example .env
nano .env  # completar las variables

# 4. Instalar PM2 (process manager)
npm install -g pm2
pm2 start server.js --name municipio-junin
pm2 startup
pm2 save

# 5. Nginx como reverse proxy
sudo nano /etc/nginx/sites-available/municipio-junin
```

```nginx
server {
    listen 80;
    server_name sistema.junin.gob.ar;
    
    location / {
        root /var/www/municipio-junin;
        index login.html;
        try_files $uri $uri/ /login.html;
    }
    
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/municipio-junin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 6. SSL con Certbot
sudo certbot --nginx -d sistema.junin.gob.ar
```

---

## Variables de entorno requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|--------|
| `JWT_SECRET` | Secreto para tokens JWT (64+ chars) | `cambiar-este-secreto-...` |
| `DATABASE_URL` | URL PostgreSQL (opcional, sin = modo demo) | `postgresql://user:pass@host:5432/db` |
| `NODE_ENV` | Entorno | `production` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número WhatsApp | `123456789012345` |
| `WHATSAPP_ACCESS_TOKEN` | Token Meta permanente | `EAABz...` |
| `WHATSAPP_VERIFY_TOKEN` | Token verificación webhook | `junin-muni-2026` |
| `SMTP_HOST` | Servidor SMTP para emails | `smtp.gmail.com` |
| `SMTP_USER` | Usuario SMTP | `sistema@junin.gob.ar` |
| `SMTP_PASS` | Contraseña SMTP/App Password | `xxxx xxxx xxxx xxxx` |
| `EMAIL_INTENDENTE` | Email del intendente | `intendente@junin.gob.ar` |
| `EMAIL_HACIENDA` | Email de hacienda | `hacienda@junin.gob.ar` |
| `EMAIL_IT` | Email de IT | `it@junin.gob.ar` |
| `FRONTEND_URL` | URL del frontend | `https://municipio-junin.vercel.app` |

---

## Checklist de producción

- [ ] Cambiar `JWT_SECRET` por una cadena segura de 64+ caracteres
- [ ] Cambiar contraseñas demo en `backend/routes/auth.js`
- [ ] Conectar PostgreSQL real (`DATABASE_URL`)
- [ ] Configurar SMTP para emails
- [ ] Registrar webhook WhatsApp en Meta Developers
- [ ] Configurar dominio propio (ej: sistema.junin.gob.ar)
- [ ] Activar SSL con Certbot
- [ ] Configurar backup automático de la DB
- [ ] Testear en celular (PWA install)
- [ ] Capacitar a los usuarios (ver manuales.html)
