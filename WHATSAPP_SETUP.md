# 📱 Configuración WhatsApp Bot — Paso a Paso
## Municipalidad de Junín · Meta Cloud API

---

## Requisitos previos
- Cuenta de Facebook Business verificada
- Número de teléfono dedicado para el bot (puede ser una SIM nueva)
- Sistema desplegado en Vercel (URL pública accesible)

---

## Paso 1: Crear App en Meta Developers

1. Ir a https://developers.facebook.com
2. Clic en **"Mis apps"** → **"Crear app"**
3. Tipo de app: **"Business"**
4. Nombre: `Sistema Municipal Junín`
5. Clic en **"Crear app"**

---

## Paso 2: Agregar WhatsApp al proyecto

1. En el dashboard de la app, buscar **WhatsApp**
2. Clic en **"Configurar"**
3. Asociar a tu **cuenta de Business Manager**
4. Agregar el **número de teléfono** del bot

---

## Paso 3: Obtener credenciales

En el panel de WhatsApp → **"Configuración de API"**:

```
Phone Number ID:   (copiar el número de 15 dígitos)
WhatsApp Business Account ID: (copiar)
Token temporal:    (copiar — dura 24hs, crear token permanente)
```

### Crear token permanente:
1. Settings → **System Users**
2. Crear usuario de sistema
3. Asignar permisos: `whatsapp_business_messaging`, `whatsapp_business_management`
4. Generar token **sin expiración**

---

## Paso 4: Configurar el Webhook

1. En WhatsApp → **Configuración** → **Webhooks**
2. Completar:
   ```
   URL de devolución de llamada: https://municipio-junin.vercel.app/api/whatsapp/webhook
   Token de verificación:        junin-muni-2026
   ```
3. Clic en **"Verificar y guardar"**
4. Suscribir al campo: **messages**

---

## Paso 5: Variables en Vercel

1. Ir a https://vercel.com → proyecto → **Settings** → **Environment Variables**
2. Agregar:
   ```
   WHATSAPP_PHONE_NUMBER_ID = [el número del paso 3]
   WHATSAPP_ACCESS_TOKEN    = [el token permanente del paso 3]
   WHATSAPP_VERIFY_TOKEN    = junin-muni-2026
   ```
3. Clic en **"Save"**
4. Hacer **redeploy**: `vercel deploy --prod --yes`

---

## Paso 6: Prueba inicial

Desde tu WhatsApp personal, enviá al número del bot:
```
hola
```
Deberías recibir el menú de bienvenida en segundos.

---

## Comandos disponibles

| Comando | Respuesta |
|---------|----------|
| `hola` | Menú de ayuda |
| `saldo` | Presupuesto disponible |
| `gasto` | Gastos del mes por secretaría |
| `empleados` | Estado de RRHH |
| `reclamos` | Reclamos vecinales |
| `alertas` | Situaciones críticas |
| `informe` | Resumen ejecutivo completo |

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Webhook no verifica | Verificar que el VERIFY_TOKEN coincida exactamente |
| Bot no responde | Revisar logs en Vercel Dashboard → Functions |
| Token expirado | Generar nuevo token permanente en Meta |
| Error 401 | ACCESS_TOKEN incorrecto o expirado |
