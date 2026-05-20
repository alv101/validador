# MVP de Validación QR - Resumen Ejecutivo

## 1. Qué se ha construido
Se ha implementado un MVP operativo para validar billetes mediante QR en tiempo real, con:

- App PWA para conductores y administradores.
- API backend con autenticación por roles.
- Integración con sistema de ticketing y persistencia de eventos de validación.
- Historial de validaciones y herramientas de soporte operativo.

El objetivo se ha cumplido: disponer de una solución funcional de validación en campo, con trazabilidad y base técnica escalable.

## 2. Arquitectura (visión de negocio)
La solución se organiza en 2 capas principales:

- **Canal operativo (PWA)**: login, selección de servicio, escaneo QR, visualización de resultado.
- **Motor de validación (API)**: reglas de negocio, control de acceso, conexión con ticketing y registro de auditoría.

Datos:

- **PostgreSQL** para estado interno de validaciones, idempotencia y consumos.
- **SQL Server ticketing** para consulta de billetes/servicios reales.

Esto permite separar claramente experiencia de usuario, lógica de negocio y fuentes de datos.

## 3. APIs habilitadas
Base: `/api/v1`

- **Autenticación**: `POST /auth/login`, `GET /auth/me`
- **Usuarios (admin)**: `POST /users`, `GET /users`, `PATCH /users/:id`
- **Catálogo de servicio**: `GET /service-catalog/itineraries`, `GET /service-catalog/departures`, `GET /service-catalog/buses`
- **Validación**: `POST /validate`, `POST /validate-locator`
- **Control y auditoría**: `GET /validations/history`, endpoints admin de monitor/reset

## 4. Tecnologías usadas

### Frontend
- React + TypeScript
- Vite + PWA plugin
- ZXing (lectura de QR)

### Backend
- NestJS + TypeScript
- JWT + Passport (auth)
- Argon2 (password hashing)
- PostgreSQL (`pg`)
- SQL Server (`mssql`)

## 5. Seguridad (estado actual)
Controles implementados:

- Autenticación JWT.
- Autorización por roles (`DRIVER`, `ADMIN`).
- Contraseñas hash con Argon2.
- Idempotencia para evitar dobles consumos por reintentos.
- Registro de validaciones y consumos para trazabilidad.

Implicaciones del MVP:

- Seguridad suficiente para piloto/controlado, con margen de endurecimiento para producción.
- Requiere disciplina de operación en logs y configuración (flags debug, secretos, acceso a endpoints admin).

## 5.1 Limitaciones de acceso a bases de datos y superficie de exposición
Se han aplicado restricciones específicas en el acceso a datos para contener riesgo:

- **PostgreSQL interno en contenedor Docker**:
  - Aislamiento del motor de datos respecto al host y a otros servicios.
  - Acceso controlado por red/puerto y credenciales del servicio API.
  - Reduce exposición directa de la base frente a accesos no previstos desde el exterior.

- **SQL Server de ticketing en modo solo lectura**:
  - La credencial usada por la API (`avanza_read`) está orientada a consulta.
  - El backend consume ticketing mediante consultas `SELECT`, sin operaciones de escritura sobre sistema legado.
  - Minimiza impacto potencial ante compromiso de credenciales o errores de aplicación (menor capacidad de alteración de datos origen).

Conclusión de seguridad:

- **Sí, estas restricciones minimizan la superficie de exposición**, especialmente frente a:
  - modificación no autorizada de datos de ticketing;
  - propagación de impacto entre servicios;
  - abuso de privilegios sobre BBDD externas.
- No eliminan todo el riesgo: siguen siendo necesarios controles complementarios (TLS, rotación de secretos, segmentación de red, auditoría y monitorización activa).

## 5.2 Buenas prácticas ya aplicadas frente a riesgos de BBDD
Además de las limitaciones de acceso, el MVP incorpora prácticas que reducen riesgos como inyección SQL o corrupción operativa:

- Uso de **consultas parametrizadas** (sin concatenar SQL con entrada de usuario).
- **Validación y normalización** de campos de entrada antes de consultar.
- **Transacciones** en operaciones críticas de validación/consumo.
- **Idempotencia** para evitar dobles consumos por reintentos.
- **Control de acceso por JWT y roles** en endpoints con impacto en datos.

## 6. Riesgos y mitigaciones recomendadas
Riesgos principales:

- Dependencia de calidad/consistencia de datos de ticketing legado.
- Sensibilidad a variaciones de SQL Server antiguo.
- Exposición operativa si se mantienen flags de debug activados.

Siguientes acciones recomendadas:

1. Endurecer despliegue productivo (TLS, CORS estricto, rate limit).
2. Formalizar observabilidad (métricas, alertas, trazas).
3. Completar hardening de endpoints admin (llaves rotativas, auditoría reforzada).
4. Consolidar pruebas de integración con ticketing real.

## 7. Resultado para negocio
El MVP ya permite:

- Validar billetes de forma digital en operación real.
- Reducir ambigüedad operativa (resultado inmediato: válido/inválido/duplicado).
- Contar con histórico para seguimiento y control.
- Escalar hacia producto final sin rehacer la base arquitectónica.

En resumen: el proyecto está en un punto funcional sólido para piloto ampliado, con una ruta clara de evolución a producción robusta.
