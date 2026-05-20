# Analisis de seguridad de la app Validador

## 1. Resumen ejecutivo

La aplicacion `validador` presenta una base tecnica razonable para un MVP operativo: autenticacion con JWT, passwords con Argon2, control de roles en backend, consultas SQL parametrizadas e idempotencia en validaciones. La arquitectura general es correcta para iterar.

Sin embargo, el nivel de endurecimiento de seguridad actual no es suficiente para una exposicion abierta a Internet ni para un entorno de produccion sin medidas adicionales. El riesgo principal no viene de una vulnerabilidad critica unica, sino de la combinacion de varios factores:

- Falta de hardening HTTP y de validacion global de entrada en la API.
- Persistencia de JWT en `sessionStorage`, con exposicion potencial ante XSS.
- Revalidacion insuficiente del estado real del usuario una vez emitido el token.
- Exposicion excesiva de datos operativos y personales en pantallas y endpoints administrativos.
- Operaciones destructivas accesibles desde la UI en entornos no productivos.
- Configuracion debil de la conexion a SQL Server y gestion mejorable de secretos.

Conclusion ejecutiva:

- Apto para desarrollo interno.
- Viable para piloto cerrado y controlado, con cautela.
- No recomendable para produccion o despliegue publico sin endurecimiento previo.

## 2. Alcance del analisis

Se ha revisado la app en la ruta `/home/alvaro/validador`, incluyendo:

- Backend NestJS en `api/`
- Frontend PWA React/Vite en `pwa/`
- Configuracion basica de infraestructura en `infra/`
- Documentacion funcional y tecnica existente

Tambien se ha verificado el estado operativo del proyecto:

- Tests backend: OK
- Tests frontend: OK
- Build backend: OK
- Build frontend: OK

Esto indica que el proyecto esta estable a nivel tecnico, aunque no necesariamente endurecido a nivel de seguridad.

## 3. Fortalezas de seguridad detectadas

### 3.1 Autenticacion y credenciales

- Las contrasenas se verifican con `argon2`.
- Los tokens JWT tienen expiracion corta de `15m`.
- Existe separacion de roles entre `DRIVER` y `ADMIN`.

### 3.2 Seguridad logica del dominio

- El backend controla duplicados e idempotencia en validaciones.
- Se usa persistencia transaccional para operaciones relevantes.
- La logica de validacion de billetes esta en el backend, no en cliente.

### 3.3 Acceso a datos

- Las consultas a PostgreSQL y SQL Server usan parametros, reduciendo el riesgo de inyeccion SQL clasica.
- La integracion con ticketing esta planteada como lectura desde sistema externo.

## 4. Hallazgos principales

## 4.1 Riesgos altos

### A1. Falta de hardening HTTP basico en la API

Severidad: Alta

Observacion:

En el arranque de la API no se observa configuracion explicita de:

- `helmet`
- `enableCors`
- `ValidationPipe`
- rate limiting
- cabeceras de seguridad
- politicas claras de confianza en proxy

Impacto:

- Mayor dependencia del reverse proxy para proteger la aplicacion.
- Riesgo de aceptar payloads inesperados.
- Mayor superficie ante abuso automatizado o configuraciones inseguras.

Referencias:

- `api/src/main.ts`

### A2. El JWT no revalida en BD si el usuario sigue activo o conserva roles

Severidad: Alta

Observacion:

Una vez emitido el JWT, la validacion del payload no comprueba de nuevo en base de datos si:

- el usuario sigue activo
- sus roles han cambiado
- su acceso ha sido revocado

Impacto:

- Un usuario desactivado puede seguir operando hasta que expire el token.
- Un cambio urgente de permisos no se aplica de forma inmediata.

Referencias:

- `api/src/auth/auth.module.ts`
- `api/src/auth/auth.service.ts`
- `api/src/auth/jwt.strategy.ts`

### A3. Exposicion excesiva de datos sensibles en endpoints y UI administrativas

Severidad: Alta

Observacion:

El endpoint administrativo de tablas devuelve y la PWA renderiza informacion como:

- `locator`
- `dni`
- `ticket_key`
- `validated_by`
- `validated_dni`
- respuestas de idempotencia y trazas asociadas

Impacto:

- Aumento del riesgo de filtrado interno de datos operativos y personales.
- Exceso de privilegio para usuarios admin funcionales que no necesariamente deberian ver todo el detalle crudo.
- Dificultad para cumplir con principios de minimizacion de datos.

Referencias:

- `api/src/validations/validations.controller.ts`
- `api/src/validations/validations.service.ts`
- `pwa/src/features/history/AdminLiveMonitorPage.tsx`

### A4. Operacion destructiva disponible desde la UI en entornos no productivos

Severidad: Alta

Observacion:

La funcionalidad de reset de tablas de validacion puede ejecutarse desde la interfaz si esta habilitada por configuracion y el entorno no es produccion.

Impacto:

- Riesgo operativo alto en demos, preproduccion o pilotos compartidos.
- Borrado accidental o malicioso de historico y controles de idempotencia.

Referencias:

- `api/src/validations/validations.controller.ts`
- `api/src/validations/validations.service.ts`
- `pwa/src/features/settings/SettingsPage.tsx`

## 4.2 Riesgos medios

### M1. Token almacenado en `sessionStorage`

Severidad: Media-Alta

Observacion:

La PWA guarda el `accessToken` en `sessionStorage`.

Impacto:

- Cualquier XSS con ejecucion de JavaScript en origen podria robar la sesion.
- No es un problema aislado, pero si un multiplicador de impacto ante futuras vulnerabilidades frontend.

Referencias:

- `pwa/src/features/auth/AuthContext.tsx`

### M2. Conexion a SQL Server sin cifrado robusto

Severidad: Media-Alta

Observacion:

La configuracion usa:

- `encrypt: false`
- `trustServerCertificate: true`

Impacto:

- Trafico y credenciales mas expuestos en red interna.
- Riesgo de interception o MITM en segmentos no totalmente confiables.

Referencias:

- `api/src/validations/ticketing-sqlserver.service.ts`

### M3. Falta de validacion estructurada de entrada en controladores

Severidad: Media

Observacion:

Los controladores tipan payloads con TypeScript, pero no se aprecia uso de DTOs con validacion runtime global.

Impacto:

- Mayor superficie para payloads malformados.
- Posibles inconsistencias de negocio o errores no previstos.

Referencias:

- `api/src/auth/auth.controller.ts`
- `api/src/validations/validations.controller.ts`
- `api/src/main.ts`

### M4. Falta de controles anti abuso

Severidad: Media

Observacion:

No se aprecia rate limiting para:

- login
- validaciones
- endpoints administrativos

Impacto:

- Riesgo de fuerza bruta sobre credenciales.
- Riesgo de abuso automatizado de endpoints operativos.

Referencias:

- `api/src/main.ts`
- `api/src/auth/auth.controller.ts`
- `api/src/validations/validations.controller.ts`

### M5. Secretos hardcodeados en infraestructura local

Severidad: Media

Observacion:

La configuracion de Postgres en `docker-compose.yml` contiene credenciales en claro.

Impacto:

- Mala practica que puede trasladarse por error a otros entornos.
- Exposicion innecesaria de secretos en repositorio o backups.

Referencias:

- `infra/docker-compose.yml`

## 4.3 Riesgos bajos o consideraciones

### B1. Device ID persistente no debe considerarse control de seguridad

Severidad: Baja

Observacion:

La PWA genera y persiste un `deviceId` en `localStorage`.

Impacto:

- Puede servir para trazabilidad ligera.
- No debe usarse como autenticacion ni como factor de confianza fuerte.

Referencias:

- `pwa/src/lib/deviceId.ts`
- `pwa/src/lib/apiClient.ts`

### B2. Logs SQL debug requieren control estricto

Severidad: Baja-Media

Observacion:

Existe soporte de debug de consultas y parametros para ticketing, con cierto enmascarado.

Impacto:

- Util para diagnostico.
- Si se activa sin control, puede seguir exponiendo metadatos sensibles en logs.

Referencias:

- `api/src/validations/ticketing-sqlserver.service.ts`
- `api/src/validations/ticketing-sqlserver.adapter.ts`

## 5. Evaluacion por entorno

### 5.1 Desarrollo interno

Estado: Adecuado

Motivo:

- Riesgo controlable si el acceso esta restringido al equipo.
- El reset desde UI y la observabilidad cruda tienen sentido en esta fase.

### 5.2 Piloto cerrado

Estado: Viable con medidas

Condiciones minimas recomendadas:

- HTTPS obligatorio
- red restringida o VPN
- usuarios nominales y controlados
- desactivar o limitar `admin/tables`
- revisar reset admin
- proteger secretos y configuracion

### 5.3 Produccion o despliegue publico

Estado: No recomendado en el estado actual

Bloqueadores principales:

- Falta hardening HTTP
- Exceso de exposicion de datos admin
- Revalidacion insuficiente del usuario
- Ausencia de throttling
- Postura debil en conectividad y secretos

## 6. Recomendaciones priorizadas

### Prioridad 1. Antes de VPS o piloto serio

- Activar `helmet` en backend.
- Configurar CORS explicito por origen permitido.
- Activar `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y transformacion controlada.
- Implementar rate limiting en login y validaciones.
- Revalidar en BD que el usuario siga activo y con roles vigentes al aceptar JWT.
- Revisar y reducir datos expuestos por `validations/admin/tables`.
- Eliminar o endurecer el reset desde UI.
- Mover secretos a variables de entorno reales y fuera del repo.

### Prioridad 2. Antes de produccion

- Establecer HTTPS extremo a extremo.
- Revisar cifrado y confianza de certificado hacia SQL Server.
- Aplicar mascarado sistematico de PII en logs.
- Establecer auditoria estructurada por `requestId`, `userId`, `deviceId`, resultado y motivo.
- Segmentar endpoints admin por red o rol reforzado.
- Valorar sesiones con refresh token o invalidacion server-side.

### Prioridad 3. Mejora continua

- CSP adecuada para la PWA.
- Reforzar pruebas automatizadas de seguridad y autorizacion.
- Escaneo de dependencias y actualizacion periodica.
- Politica de retencion y minimizacion de datos historicos.

## 7. Conclusiones finales

La app `validador` esta bien planteada como MVP y su seguridad logica de negocio es mejor de lo habitual en una primera iteracion. Hay decisiones tecnicas correctas en autenticacion, persistencia, roles e idempotencia.

El principal trabajo pendiente no es rehacer la app, sino endurecerla:

- proteger mejor el perimetro HTTP
- reducir exposicion de datos sensibles
- mejorar controles operativos de administracion
- robustecer gestion de sesiones, secretos y red

En resumen:

- El proyecto no parece inseguro por diseno.
- Si parece todavia insuficientemente endurecido para un despliegue abierto.
- Con una ronda concreta de hardening, puede evolucionar a un piloto serio sin necesidad de reescribir el nucleo funcional.
