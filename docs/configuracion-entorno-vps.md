# Configuracion de entorno para VPS

## Objetivo

Este documento resume las variables minimas para desplegar `validador` en un VPS sin dejar secretos embebidos en el repositorio.

## Ficheros de ejemplo

- `infra/.env.example`: variables para PostgreSQL en Docker Compose
- `api/.env.example`: variables de la API NestJS
- `pwa/.env.example`: variables de compilacion de la PWA

## Recomendacion de uso

1. Crear ficheros reales `.env` fuera del repositorio o en rutas protegidas del servidor.
2. No reutilizar los valores `change_me`.
3. Generar secretos largos y aleatorios para JWT, base de datos y reset admin.
4. Mantener `VALIDATIONS_RESET_UI_ENABLED=false` salvo necesidad muy controlada.
5. Definir `CORS_ALLOWED_ORIGINS` con los dominios reales del frontend.

## Variables criticas API

- `JWT_SECRET`: secreto de firma del token.
- `CORS_ALLOWED_ORIGINS`: orígenes permitidos del frontend.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`: conexion a PostgreSQL.
- `VALIDATIONS_RESET_ENABLED`: habilita el reset admin a nivel backend.
- `ALLOW_VALIDATIONS_RESET_IN_PROD`: solo activar si hay una necesidad operativa justificada.
- `VALIDATIONS_RESET_UI_ENABLED`: controla si el boton de reset aparece en UI.
- `VALIDATIONS_RESET_ADMIN_KEY`: clave adicional para reset administrativo.

## Variables criticas Docker/Postgres

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

## Variables criticas PWA

- `VITE_API_BASE_URL`

En proxy inverso bajo el mismo dominio, lo recomendado es usar `/api/v1`.

## Nota de seguridad

No subir nunca al repositorio:

- `.env`
- secretos reales de JWT
- contraseñas de PostgreSQL
- credenciales de SQL Server ticketing
- claves de reset administrativo
