# Arquitectura del MVP de Validación

## 1. Objetivo del MVP
Este MVP permite validar billetes mediante lectura de QR en una PWA, con trazabilidad de validaciones, control de duplicados, autenticación por roles y conexión con sistemas de ticketing.

## 2. Visión general de arquitectura
La solución está dividida en dos bloques principales:

- **Frontend PWA (React + Vite)**: interfaz de login, selección de servicio, escaneo QR, historial y settings.
- **Backend API (NestJS)**: autenticación JWT, reglas de validación, catálogo de servicio, persistencia y conexión con ticketing.

Flujo alto nivel:

1. Usuario inicia sesión en la PWA.
2. La PWA obtiene token JWT y lo usa en llamadas API.
3. El conductor selecciona servicio (itinerario/salida/bus).
4. Escanea QR y la PWA envía `locator`, `dni` y `serviceId` al backend.
5. El backend valida contra ticketing/local, persiste resultado y responde estado funcional (`VALID`, `INVALID`, `DUPLICATE`, `ERROR`).
6. La PWA muestra resultado en tiempo real y permite auditar en historial.

## 3. Componentes y responsabilidades

### 3.1 PWA (`/pwa`)
Responsabilidades:

- Autenticación de usuario y mantenimiento de sesión (`sessionStorage`).
- Lectura de QR con cámara (ZXing).
- Parseo de payload QR (`JSON`, `locator:dni`, `LOCATOR|DNI`, `LOCATOR-DNI`).
- Orquestación de llamadas API (`/validate`, `/validate-locator`, `/service-catalog/*`, `/validations/history`).
- Presentación de estados de negocio y error.

Módulos clave:

- `src/features/auth/*`: login, contexto de autenticación.
- `src/features/service/*`: selección de servicio activo.
- `src/features/scan/ScanPage.tsx`: cámara, decodificación, envío de validación.
- `src/features/history/*`: consulta de historial y monitor admin.
- `src/lib/apiClient.ts`: cliente HTTP con JWT + `X-Device-Id`.

### 3.2 API (`/api`)
Responsabilidades:

- Exponer API REST bajo prefijo global `api/v1`.
- Emitir y validar JWT.
- Aplicar control de acceso por roles (DRIVER/ADMIN).
- Ejecutar lógica de validación e idempotencia.
- Persistir eventos de validación en PostgreSQL.
- Consultar SQL Server de ticketing (modo real) o adapter fake.

Módulos clave:

- `auth`: login, estrategia JWT, guardas.
- `users`: gestión de usuarios y roles (admin).
- `validations`: validación operativa, historial, reset admin, catálogo de servicio.
- `db`: acceso a PostgreSQL y creación de tablas auxiliares de validación.

### 3.3 Persistencia

- **PostgreSQL (interno MVP)**
  - `validations`
  - `validated_ticket_consumptions`
  - `validation_idempotency`
  - `locator_tickets`

- **SQL Server Ticketing (externo)**
  - Consultas de candidatos por locator/dni/serviceId.
  - Consultas de catálogo de itinerarios/salidas.

## 4. Tecnologías usadas

### Frontend
- React 19
- TypeScript
- Vite 7
- vite-plugin-pwa
- React Router DOM
- ZXing (`@zxing/browser`) para lectura QR
- Vitest para tests unitarios

### Backend
- NestJS 11
- TypeScript
- PostgreSQL (`pg`)
- SQL Server (`mssql` + tedious)
- JWT (`@nestjs/jwt`, `passport-jwt`)
- Argon2 para hash/verificación de contraseñas
- Jest para tests

### Infra/Operación
- Variables de entorno en `.env`
- Node.js runtime
- Servicio API bajo `/api/v1`

## 5. APIs creadas (resumen funcional)

Base path: **`/api/v1`**

### 5.1 Auth
- `POST /auth/login`
  - Entrada: `username`, `password`
  - Salida: `accessToken`
- `GET /auth/me`
  - Requiere JWT
  - Devuelve usuario autenticado y roles

### 5.2 Usuarios (solo ADMIN)
- `POST /users` crea usuario
- `GET /users` lista usuarios
- `PATCH /users/:id` actualiza estado/roles

### 5.3 Catálogo de servicio (DRIVER, ADMIN)
- `GET /service-catalog/itineraries?date=YYYYMMDD`
- `GET /service-catalog/departures?itineraryId=...&date=YYYYMMDD`
- `GET /service-catalog/buses`

### 5.4 Validación (DRIVER, ADMIN)
- `POST /validate`
  - Validación básica locator+serviceId
- `POST /validate-locator`
  - Validación operativa por `locator`, `dni`, `serviceId`
  - Soporta header `Idempotency-Key`

### 5.5 Historial/monitor/reset
- `GET /validations/history`
  - Filtros: fecha, locator, serviceId, resultado, paginación
  - Restricción por rol (admin ve todo; driver ve lo propio)
- `GET /validations/admin/reset-status` (ADMIN)
- `GET /validations/admin/tables?limit=N` (ADMIN)
- `POST /validations/admin/reset` (ADMIN)

## 6. Flujo de validación QR

1. PWA escanea QR y parsea `locator`/`dni`.
2. Toma `serviceId` del servicio activo seleccionado.
3. Envía `POST /validate-locator` con JWT + `X-Device-Id` + opcional `Idempotency-Key`.
4. API valida formato, roles y ejecuta lógica:
   - si DNI inválido: `INVALID (DNI_MISMATCH)`
   - si no hay candidatos: `INVALID (NOT_FOUND)`
   - si todo consumido: `DUPLICATE (NO_REMAINING)`
   - si hay ticket disponible: `VALID`
5. API persiste evento en PostgreSQL y devuelve timestamps + metadatos de ticket.
6. PWA muestra resultado visual/sonoro.

## 7. Seguridad: diseño e implicaciones

### 7.1 Controles implementados
- **Autenticación JWT** para todas las rutas operativas.
- **Autorización por roles** (`DRIVER`, `ADMIN`) mediante guards.
- **Contraseñas con Argon2** (no texto plano).
- **Idempotencia** para evitar doble consumo por reintentos/red inestable.
- **Persistencia transaccional** en puntos críticos (consumo/registro).
- **Separación de responsabilidades** entre validación operativa y catálogo.

### 7.2 Implicaciones y riesgos del MVP
- El token se guarda en `sessionStorage`: protege frente a persistencia prolongada, pero sigue expuesto ante XSS.
- Si se opera sin TLS extremo a extremo, JWT y datos operativos podrían interceptarse.
- En modo debug SQL, los logs pueden exponer datos sensibles operativos (locator/dni). Debe estar desactivado fuera de diagnóstico puntual.
- El endpoint de reset admin es potente; requiere hardening adicional en producción (red restringida, llave admin rotativa, auditoría).
- El fallback de algunos flujos prioriza continuidad operativa (degradación controlada), lo cual mejora disponibilidad pero puede ocultar causas raíz si no se monitoriza bien.

### 7.3 Recomendaciones de endurecimiento (siguiente fase)
- Forzar HTTPS/TLS y política HSTS en despliegue.
- Añadir rate limit por IP/usuario en login y validate-locator.
- Incorporar auditoría estructurada (requestId, userId, deviceId, resultado, motivo).
- Activar rotación y expiración corta de JWT + refresh token controlado.
- Aplicar CORS explícito por origen permitido.
- Definir política de masking en logs para locator/dni en todos los niveles.
- Añadir alertas operativas para picos de `ERROR`/`INVALID` por servicio.

### 7.4 Limitaciones de acceso a BD y minimización de superficie
En el MVP se han aplicado restricciones de acceso a datos para reducir exposición:

- **PostgreSQL interno en Docker**:
  - El almacenamiento operativo del MVP se ejecuta en contenedor, aislado del host y del resto de servicios.
  - El acceso se realiza desde la API con credenciales de aplicación y alcance controlado.
  - Esto reduce el vector de acceso directo a la BBDD desde fuera del perímetro de la solución.

- **SQL Server ticketing con cuenta de lectura**:
  - La integración con ticketing está planteada con usuario de consulta (solo lectura).
  - El backend usa consultas `SELECT` para catálogo/candidatos y no realiza escrituras en el sistema legado.
  - Esto limita el impacto potencial ante credenciales comprometidas o errores lógicos en la aplicación.

Conclusión:

- **Sí, estas restricciones minimizan la superficie de exposición**, porque disminuyen privilegios efectivos y capacidad de modificación sobre sistemas críticos.
- Aun así, deben complementarse con controles de red, cifrado en tránsito, gestión de secretos y auditoría continua para alcanzar nivel de producción robusto.

### 7.5 Buenas prácticas ya implementadas para mitigar riesgo en BBDD
Se han aplicado prácticas técnicas concretas que reducen riesgos de inyección SQL, manipulación indebida y errores de consistencia:

- **Consultas parametrizadas**:
  - En PostgreSQL (`$1`, `$2`, ...) y en SQL Server (`@locator`, `@serviceId`, ...).
  - Se evita construir SQL con concatenación directa de entrada de usuario.

- **Validación/normalización de input antes de persistir/consultar**:
  - Normalización de `locator`, `dni`, `serviceId`.
  - Validaciones de formato en fechas, paginación y enums de resultado.
  - Reducción de payloads ambiguos o mal formados que podrían degradar consultas.

- **Transaccionalidad en operaciones críticas**:
  - Uso de `withTransaction` para consumo de ticket, persistencia de validación e idempotencia.
  - Evita estados parciales e inconsistencias ante fallos intermedios.

- **Idempotencia en validación operativa**:
  - `Idempotency-Key` + `request_hash` para deduplicar reintentos.
  - Reduce doble escritura y doble consumo por latencia/red.

- **Control de acceso de aplicación**:
  - JWT + roles (`DRIVER`, `ADMIN`) en endpoints con acceso a datos.
  - Disminuye superficie lógica de abuso a nivel API.

- **Degradación controlada y manejo de errores**:
  - Errores técnicos de backend no exponen SQL interno al cliente final.
  - Mantiene separación entre error funcional y error técnico, facilitando observabilidad sin filtrar detalles sensibles.

## 8. Modos de operación y configuración

Variables relevantes:

- `TICKETING_ADAPTER_MODE=fake|sqlserver`
- `TICKETING_CATALOG_MODE=fake|sqlserver`
- `VALIDATE_LOCATOR_SOURCE=local|ticketing`
- `VALIDATIONS_RESET_ENABLED=true|false`
- `JWT_SECRET`, `DB_*`, `TICKETING_DB_*`
- Flags de debug SQL (solo diagnóstico temporal)

Esto permite ejecutar el MVP en modo simulación (sin dependencias externas) o en modo integrado con ticketing real.

## 9. Estado actual del MVP

Cobertura funcional actual:

- Login y control de roles.
- Selección de servicio activa.
- Escaneo QR y validación online.
- Gestión de duplicados e idempotencia.
- Historial filtrable y monitor admin.
- Estilo corporativo PWA y UX operativa móvil/web.

Límites conocidos del MVP:

- Dependencia de calidad/consistencia de datos en ticketing legado.
- Ajustes SQL por compatibilidad con versiones antiguas de SQL Server.
- Ausencia de capa formal de observabilidad centralizada (tracing/metrics) en esta iteración.

## 10. Conclusión
La solución MVP está diseñada para validar billetes en operación real con un equilibrio entre rapidez de entrega, trazabilidad y controles de seguridad básicos. La arquitectura modular (PWA + API Nest + adapters ticketing) facilita evolucionar el sistema hacia una versión productiva endurecida sin reescribir el núcleo funcional.
