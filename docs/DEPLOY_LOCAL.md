# Despliegue on-premise — estado y gate de certificación

Estado: **roadmap; no existe un paquete on-premise ejecutable o certificado**.

La receta Docker heredada fue retirada porque montaba rutas inexistentes,
publicaba el checkout completo, iniciaba servicios no integrados y afirmaba
backup/IA local sin pruebas. No usar versiones históricas de esa receta para un
servidor municipal.

## Cuándo se puede reconstruir

El paquete on-premise se implementará como un sprint propio después de cerrar:

- imagen de frontend que contenga sólo assets públicos necesarios;
- imagen Serverless equivalente o API Express con paridad funcional explícita;
- migraciones Prisma revisadas y cliente generado dentro de cada imagen;
- secretos mediante Docker secrets/Vault equivalente, nunca `.env` con valores
  copiables;
- PostgreSQL privado, TLS, roles mínimos, aislamiento de red y readiness;
- storage privado para archivos originales y artefactos, con antivirus;
- jobs de ingesta, correo, WhatsApp o IA habilitados sólo si tienen contrato y
  credenciales propias;
- observabilidad, retención de logs sin PII y alertas;
- backup cifrado en dominio separado y restore ensayado;
- actualización firmada, inventario SBOM, rollback y runbook de incidente;
- QA de red, navegador, permisos, tenant y performance en hardware objetivo.

## Entregables obligatorios del futuro sprint

1. `compose.yaml` o manifests versionados con imágenes fijadas por digest.
2. `.env.example` sin secretos ni valores operativos predeterminados.
3. health/readiness por servicio y smoke automatizado.
4. modelo de amenazas de la topología municipal.
5. procedimiento de instalación, actualización, rollback y desinstalación.
6. matriz de puertos/orígenes y firewall de mínimo privilegio.
7. prueba de restore con RPO/RTO medidos.
8. evidencia de que el checkout, dumps y artefactos privados no son contenido
   estático.

Hasta completar esos puntos, el runtime soportado para el piloto es el descrito
en [`../DEPLOYMENT.md`](../DEPLOYMENT.md). Este documento no autoriza un deploy.
