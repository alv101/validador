# Informe de Análisis en Profundidad
## Herramienta MVP de Validación QR

**Fecha:** 23/02/2026  
**Autor del análisis:** Revisión técnica independiente basada en código fuente y ejecución local  
**Alcance revisado:** `/api`, `/pwa`, `/docs` y artefactos asociados del repositorio `validador`

---

## 1. Resumen ejecutivo del análisis

La solución MVP de validación implementada tiene una base técnica sólida para operación piloto: arquitectura separada por capas (PWA + API), controles de acceso por roles, persistencia transaccional, idempotencia en validación y capacidad de integración con ticketing legacy. En su estado actual, **es apta para piloto controlado** y para evolución incremental.

Sin embargo, y siendo totalmente directo: **aún no está en nivel “producción corporativa robusta”** sin una fase de endurecimiento. Los principales gaps están en gobernanza técnica (observabilidad, estandarización de validación de payloads, complejidad de algunos módulos, y estrategia de integración SQL legacy).

### Veredicto global (honesto)

- **Utilidad funcional del MVP:** alta (8.5/10)
- **Calidad de diseño arquitectónico:** buena con deuda controlable (7.2/10)
- **Calidad de programación:** buena en backend, media-alta en frontend con puntos a refactor (7.0/10)
- **Madurez para producción crítica:** media (6.2/10)

Conclusión: excelente base de MVP, con deuda técnica razonable para un producto en fase temprana, pero con trabajo pendiente antes de escalar sin riesgo operativo.

---

## 2. Metodología de evaluación

Este informe se ha elaborado revisando:

- Estructura modular de backend NestJS y frontend React/Vite.
- Endpoints y flujos de negocio de validación.
- Integración con PostgreSQL y SQL Server ticketing.
- Prácticas de seguridad aplicadas.
- Mantenibilidad del código (tamaño de módulos, cohesión, acoplamiento).
- Calidad de pruebas automáticas ejecutadas localmente.

### Evidencias de ejecución

- `api`: tests unitarios OK (`jest`) en `src/validations/validations.service.spec.ts` y `src/app.controller.spec.ts`.
- `pwa`: tests OK (`vitest`) en `src/lib/qr/parseQr.test.ts` y `src/features/scan/scanUtils.test.ts`.
- Builds de `api` y `pwa` ejecutados correctamente en la sesión de trabajo.

### Limitaciones de esta revisión

- No se ha hecho prueba de carga ni test de resiliencia en red real.
- No se ha auditado infraestructura de despliegue final (WAF, reverse proxy, TLS termination, etc.).
- No se ha hecho pentest formal.

---

## 3. Arquitectura actual de la solución

## 3.1 Vista lógica de componentes

La arquitectura responde a un patrón clásico de canal digital + backend transaccional + integración legacy:

1. **PWA (`/pwa`)**
- Interfaz operativa (login, selección de servicio, escaneo, historial).
- Lectura QR con cámara vía ZXing.
- Gestión de sesión y llamadas API.

2. **API (`/api`)**
- Exposición REST bajo prefijo global `api/v1` (`api/src/main.ts:9`).
- Autenticación JWT y autorización por roles.
- Lógica de validación de negocio.
- Idempotencia y persistencia de consumos/validaciones.
- Integración con SQL Server ticketing vía adapter.

3. **Persistencia**
- PostgreSQL interno para estado operativo del validador (`validation_idempotency`, `validations`, `validated_ticket_consumptions`, `locator_tickets`).
- SQL Server ticketing como fuente externa de datos de billetes y catálogo.

Este diseño está bien planteado para evolución y separación de responsabilidades.

## 3.2 Modularidad backend

Fortalezas claras:

- `AuthModule`, `UsersModule`, `ValidationsModule`, `DbModule` bien separados.
- Uso de inyección de dependencias y estrategia de adapter (`TICKETING_ADAPTER`) en `api/src/validations/validations.module.ts`.
- Alternancia `fake`/`sqlserver` útil para desacoplar desarrollo de dependencia legacy.

Debilidad relevante:

- El servicio principal de negocio `ValidationsService` es muy grande (1197 líneas), lo cual incrementa coste de cambio y riesgo de regresión.
  - Archivo: `api/src/validations/validations.service.ts`.

## 3.3 Modularidad frontend

Fortalezas:

- Contextos separados (`AuthContext`, `ActiveServiceContext`).
- Rutas protegidas con componente dedicado (`ProtectedRoute`).
- Cliente API centralizado (`pwa/src/lib/apiClient.ts`).

Debilidades:

- `ScanPage.tsx` es un módulo muy extenso (619 líneas), mezcla cámara, parseo, networking, audio feedback, UX y navegación.
  - Archivo: `pwa/src/features/scan/ScanPage.tsx`.
- Existe archivo duplicado/legacy `ScanPage copy.tsx`, lo que puede inducir errores de mantenimiento.

---

## 4. Tecnologías utilizadas y valoración de idoneidad

## 4.1 Frontend

- **React 19 + TypeScript**: elección moderna y adecuada para PWA operativa.
- **Vite + vite-plugin-pwa**: muy correcto para rendimiento y despliegue sencillo.
- **@zxing/browser**: estándar práctico para lectura QR en navegador.
- **Vitest**: correcto para tests unitarios ligeros.

Valoración: stack frontend bien elegido para velocidad de entrega y mantenimiento futuro.

## 4.2 Backend

- **NestJS 11 + TypeScript**: muy buena elección para API modular y escalable.
- **Passport JWT + @nestjs/jwt**: mecanismo de autenticación adecuado.
- **Argon2**: elección robusta para hashing de contraseñas.
- **pg** para PostgreSQL y **mssql** para SQL Server: elección natural por dualidad de fuentes.

Valoración: stack backend de nivel profesional, coherente con el caso de uso.

## 4.3 Persistencia e integración

- PostgreSQL se usa correctamente como “estado del validador” (consumos, idempotencia, histórico).
- SQL Server legacy se consume por lectura mediante adapter.

Punto fuerte: mantiene separación entre “datos operativos propios” y “datos de ticketing legado”.

---

## 5. Utilidad real de la herramienta

La herramienta tiene utilidad práctica inmediata en operación:

1. **Digitaliza una tarea crítica** (validación en campo) con respuesta instantánea.
2. **Reduce ambigüedad operativa** al devolver estados claros (`VALID`, `INVALID`, `DUPLICATE`, `ERROR`).
3. **Aporta trazabilidad** y capacidad de auditoría con historial filtrable.
4. **Controla duplicados y reintentos** gracias a idempotencia + consumo único.
5. **Permite gobernanza de roles** (conductor/admin), importante para entornos reales.

En términos de producto: no es un prototipo visual; es un MVP funcional con lógica de negocio y persistencia real.

---

## 6. Calidad de diseño (arquitectura)

## 6.1 Fortalezas de diseño

### a) Separación de capas correcta
- UI desacoplada de reglas de negocio.
- API desacoplada de proveedores con adapters.

### b) Patrón adapter bien aplicado
- `fake` y `sqlserver` conmutables en `ValidationsModule`.
- Facilita pruebas y operación degradada.

### c) Control de concurrencia funcional
- Consumo de ticket con control de conflicto (`ON CONFLICT DO NOTHING`) en persistencia de consumos.
- Transacciones en operaciones críticas (`withTransaction`).

### d) Idempotencia bien pensada
- `Idempotency-Key` + `request_hash` + tabla dedicada `validation_idempotency`.
- Es una buena práctica no trivial, y está bien implementada para el nivel MVP.

## 6.2 Debilidades de diseño

### a) Complejidad concentrada
- `ValidationsService` concentra demasiadas responsabilidades.
- `ScanPage` concentra demasiada lógica de cliente.

Impacto: dificulta escalar equipo y reduce velocidad de cambios seguros.

### b) Frontera de contratos no tipada por DTO/ValidationPipe
- Se valida manualmente en varios métodos de servicio/controlador.
- No se aprovecha plenamente `class-validator`/`class-transformer`.

Impacto: más código defensivo disperso y mayor probabilidad de inconsistencias de validación.

### c) Lógica SQL embebida extensa en strings
- SQL complejo en código TS (`ticketing-sqlserver.adapter.ts`, `service-catalog.service.ts`).

Impacto: mantenimiento más frágil, difícil versionado funcional de consultas y troubleshooting más costoso.

---

## 7. Calidad de programación

## 7.1 Backend: valoración

Nivel general: **bueno**.

Fortalezas:

- Uso consistente de async/await y transacciones.
- Manejo explícito de errores funcionales vs técnicos en varios flujos.
- Estructura de tests de `ValidationsService` cubre casos clave (idempotencia, concurrencia, mismatch DNI, no remaining).

Debilidades:

- Logging potencialmente ruidoso con datos sensibles si se activan flags de debug raw (`TICKETING_LOCATOR_DEBUG_RAW`).
- Algunas decisiones de fallback convierten errores técnicos en funcionales (útil para operación, pero puede ocultar causa raíz si no se monitoriza).
- Dependencia fuerte de SQL heredado con diferencias de versión (ej. funciones no disponibles en SQL Server antiguo).

## 7.2 Frontend: valoración

Nivel general: **medio-alto**.

Fortalezas:

- Flujo de usuario bien resuelto para operación real.
- Manejo correcto de estados visuales por outcome.
- Parseo QR testado y razonablemente robusto para formatos esperados.

Debilidades:

- Página de escáner sobredimensionada y con demasiada responsabilidad.
- Mezcla de estilos globales con ajustes inline en varios puntos.
- Configuración de catálogo con flags hardcodeados (`USE_API_SERVICE_CATALOG`) en lugar de estrategia claramente basada en env/runtime.
- Presencia de archivo duplicado (`ScanPage copy.tsx`) que debería retirarse.

---

## 8. Seguridad: estado real y honestidad técnica

## 8.1 Lo que está bien

- JWT con expiración de 15 minutos (`api/src/auth/auth.module.ts:21`).
- Guardas de autorización por rol (`RolesGuard`, `@Roles`).
- Contraseñas con Argon2.
- Consultas parametrizadas en PostgreSQL y SQL Server (reduce riesgo de SQL injection).
- Separación de BD interna y ticketing, con enfoque de lectura para legacy.
- Idempotencia y consumo único disminuyen impacto de reintentos y duplicados.

## 8.2 Riesgos abiertos

- Almacenamiento del token en `sessionStorage` (adecuado para MVP, pero vulnerable ante XSS).
- Ausencia de capa explícita de rate limiting para login/validación.
- Dependencia de configuración y disciplina operativa para no exponer logging sensible en debug.
- Endpoints admin de reset/monitor requieren hardening estricto en despliegue real.

Evaluación honesta: seguridad **suficiente para piloto controlado**, no todavía “enterprise hardened”.

---

## 9. Base de datos y calidad del modelo de datos

## 9.1 PostgreSQL interno

Aspectos positivos:

- Modelo enfocado en el dominio real de validación (eventos, consumos, idempotencia).
- Índices útiles (`idx_locator_tickets_lookup`, `idx_validated_ticket_consumptions_locator_service`).
- Persistencia de actor (`validated_by`, `validated_username`, `validated_roles`, `validated_dni`) aporta trazabilidad.

Aspectos mejorables:

- No se observa framework formal de migraciones versionadas; hay creación de esquema en runtime (`ensureValidationLocatorSchema`).
- Para madurez productiva, conviene migraciones controladas (Flyway/Prisma/TypeORM migrations/sql scripts versionados).

## 9.2 SQL Server ticketing

Fortalezas:

- Integración encapsulada en servicio dedicado.
- Parametrización y observabilidad de tiempos de consulta.

Riesgos:

- Compatibilidad con SQL Server legacy (funciones disponibles, nombres de columnas, tipos heterogéneos).
- Acoplamiento de consultas a estructuras heredadas con alta variabilidad semántica.

---

## 10. Pruebas y calidad de entrega

## 10.1 Cobertura actual observada

- Backend: 7 tests, centrados en lógica crítica de validación ticketing/idempotencia.
- Frontend: 7 tests, centrados en parseo QR y dedupe.

Es un buen inicio para MVP, pero **insuficiente para fase de escalado**.

## 10.2 Qué falta para mayor confianza

- Tests de integración API + PostgreSQL real.
- Tests de contrato API (OpenAPI/contract tests).
- E2E de flujos críticos (login -> servicio -> scan -> historial).
- Pruebas de concurrencia con carga real (más de dos peticiones simultáneas).
- Pruebas de resiliencia frente a caída/latencia de ticketing.

---

## 11. Hallazgos priorizados (francos y accionables)

## Alta prioridad

1. **Reducir complejidad de módulos gigantes**
- `api/src/validations/validations.service.ts`
- `pwa/src/features/scan/ScanPage.tsx`

Acción: extraer casos de uso/servicios auxiliares (idempotencia, consumo, mapping de respuestas, cámara/feedback/audio).

2. **Formalizar validación de requests con DTOs**
- Sustituir validaciones manuales dispersas por DTO + `ValidationPipe` global.

3. **Hardening de seguridad operativa**
- Rate limit, CORS estricto, revisión de exposición de endpoints admin y logging sensible.

## Prioridad media

4. **Gestionar SQL ticketing como artefacto versionado**
- Separar consultas complejas en ficheros `.sql` versionados y testables.

5. **Eliminar duplicidades y residuos**
- Retirar `ScanPage copy.tsx`.
- Reducir deuda de estilos y código legado de plantilla.

6. **Mejorar estrategia de configuración frontend**
- Evitar flags hardcodeadas y centralizar configuración por entorno.

## Prioridad baja (mejora continua)

7. **Observabilidad avanzada**
- Request IDs, métricas por endpoint, dashboards y alertas por outcome/error.

8. **Documentación operativa viva**
- Runbooks de incidencias ticketing y fallback.

---

## 12. Plan recomendado de evolución

## Fase A (2-4 semanas): estabilización técnica

- Refactor parcial de `ValidationsService` en subservicios.
- DTO + `ValidationPipe` en endpoints críticos.
- Limpieza de duplicidades frontend.
- Hardening de logs y flags debug.

## Fase B (4-8 semanas): robustez operativa

- Integración tests con BD real en entorno controlado.
- Métricas y alertas mínimas de explotación.
- Endurecimiento de seguridad de despliegue.

## Fase C (8+ semanas): preparación de escala

- Optimización de consultas ticketing con observabilidad de tiempos.
- SLA/SLO formales para validación.
- Plan de continuidad ante degradación de sistema legacy.

---

## 13. Valoración final

Mi valoración honesta es positiva: la solución no es “maqueta”, sino un MVP funcional con decisiones correctas en puntos difíciles (idempotencia, roles, trazabilidad, transacciones, integración legacy).

También es cierto que el código muestra deuda técnica esperable en esta fase: complejidad concentrada, validación de entrada no estandarizada al máximo, y dependencia fuerte de SQL heredado. Nada de esto invalida el trabajo; simplemente marca el umbral que hay que superar para una operación a escala con riesgo bajo.

**Dictamen:**

- **Para piloto ampliado:** Sí, recomendado.
- **Para producción de alta criticidad sin mejoras adicionales:** No todavía.
- **Con plan de endurecimiento en 2-3 iteraciones:** plenamente viable.

