# Validador PWA

PWA para validación de QR construida con Vite + React + TypeScript + `vite-plugin-pwa`.

## Variables de entorno

Crear `.env` en `pwa/` con:

```bash
VITE_API_BASE_URL=/api/v1
```

La app siempre usa base relativa; no usar `localhost` en el frontend.

## Desarrollo

Desde `pwa/`:

```bash
npm install
npm run dev
```

Abrir en navegador de PC/móvil dentro de la red:

- `http://IP_DEL_SERVER:5173`

## Proxy API

`vite.config.ts` define proxy para evitar CORS en desarrollo:

- `/api/*` -> `http://127.0.0.1:3000`

La PWA llama a `/api/v1/...` y Vite reenvía al backend local.

## Rutas

- `/login` pública
- `/scan` protegida
- `/history` protegida
- `/history/backend` protegida (compatibilidad)
- `/settings` protegida
- `/` redirige a `/scan`

## Comportamiento Offline

- Si no hay red al escanear, la app muestra: `SIN CONEXIÓN — NO VALIDADO`.
- En offline no se hace validación diferida y no existe sincronización posterior.
- El historial consultable es el del backend.

## Scripts

```bash
npm run dev
npm run build
npm run test
```

## Notas

- Todas las requests usan headers `Content-Type: application/json` y `X-Device-Id`.
- Si hay token de sesión, se envía `Authorization: Bearer <token>`.
- En `401`, se limpia sesión y se redirige a `/login`.
- `Idempotency-Key` se envía en `/validate` para evitar duplicados en reintentos.
