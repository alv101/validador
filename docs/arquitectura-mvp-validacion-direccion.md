# MVP de Validación QR - Documento para Dirección

## 1. Resumen para toma de decisión
El MVP de validación QR ya demuestra viabilidad operativa para sustituir validaciones manuales y reducir incidencias en campo.

Hoy el sistema permite autenticar personal, seleccionar servicio, escanear billetes, validar en tiempo real y auditar resultados. La recomendación es pasar a una **fase de piloto ampliado** con KPIs definidos y plan de industrialización.

**Decisión propuesta a dirección:** autorizar piloto ampliado (alcance controlado), con criterios de éxito y plan de paso a producción.

## 2. Problema de negocio que resolvemos
Situación actual objetivo del MVP:

- Riesgo de error operativo en validaciones manuales o no trazables.
- Dificultad para detectar duplicados/incidencias en tiempo real.
- Baja visibilidad centralizada de lo que ocurre en operación.

Con el MVP:

- Se estandariza el proceso de validación en un flujo digital único.
- Se obtiene trazabilidad por validación (qué, cuándo, quién, en qué servicio).
- Se reduce la ambigüedad operativa mediante resultado inmediato (válido/inválido/duplicado/error).

## 3. Valor de negocio esperado
### 3.1 Eficiencia operativa
- Menor fricción en validación en vehículo.
- Respuesta inmediata para el conductor en el punto de atención.
- Menor tiempo de resolución de incidencias de validación.

### 3.2 Control y riesgo
- Reducción de validaciones duplicadas por reintentos gracias a idempotencia.
- Mayor capacidad de auditoría y supervisión de operación.
- Menor superficie de exposición sobre sistemas críticos (ticketing en lectura).

### 3.3 Gobierno y trazabilidad
- Historial centralizado filtrable por servicio/resultado/fecha.
- Base de datos operativa para seguimiento de calidad de servicio.
- Evidencia objetiva para decisiones de escalado.

## 4. Qué está ya validado en el MVP
Capacidades en funcionamiento:

- Login por usuario y control de acceso por rol.
- Selección de trayecto/salida/bus antes de validar.
- Escaneo QR y validación online contra reglas de negocio.
- Gestión de casos `VALID`, `INVALID`, `DUPLICATE` y errores técnicos.
- Historial de validaciones y monitor para perfiles admin.
- Integración con ticketing y persistencia de consumos en backend.

## 5. Seguridad y exposición (visión de negocio)
Medidas aplicadas ya en MVP:

- Acceso autenticado con JWT y permisos por perfil.
- Contraseñas protegidas por hash robusto.
- SQL Server de ticketing con usuario de lectura (sin escritura en sistema legado).
- PostgreSQL interno en contenedor, aislado del resto.
- Consultas parametrizadas para reducir riesgo de inyección SQL.

Conclusión directiva:

- El diseño actual **reduce de forma relevante la exposición** para una fase piloto.
- Para producción se requiere endurecimiento adicional (TLS estricto, observabilidad, gobierno de secretos, controles de operación).

## 6. Riesgos de negocio pendientes y mitigación
Riesgos principales aún abiertos:

1. Dependencia de calidad/consistencia de datos del sistema legacy de ticketing.
2. Variabilidad técnica por versión/particularidades de SQL Server histórico.
3. Necesidad de madurar monitorización y soporte operativo para escala.

Mitigación propuesta:

- Piloto ampliado con trazas y métricas obligatorias.
- Protocolo de incidencias y rollback operativo.
- Hardening progresivo antes de despliegue masivo.

## 7. KPIs propuestos para comité
KPIs de decisión para cierre de piloto:

- **Tasa de validación correcta** (% validaciones sin incidencia técnica).
- **Tiempo medio de validación** (escaneo a respuesta).
- **% duplicados controlados** (sin doble consumo).
- **% errores técnicos** (por 1.000 validaciones).
- **Disponibilidad del servicio** en franja operativa.
- **Tiempo de resolución de incidencia** operativa.

## 8. Plan de evolución recomendado
### Fase 1. Piloto ampliado (corto plazo)
- Alcance controlado de líneas/servicios.
- Seguimiento semanal de KPIs.
- Ajustes funcionales rápidos sobre hallazgos.

### Fase 2. Industrialización (medio plazo)
- Endurecimiento de seguridad y operación.
- Observabilidad completa (alertas, métricas, auditoría).
- Estabilización de integración con ticketing.

### Fase 3. Despliegue escalado
- Extensión progresiva por operación/territorio.
- Modelo de soporte y gobierno continuo.

## 9. Recomendación final
El MVP está en un punto suficiente para pasar a **piloto ampliado orientado a resultados de negocio**. La arquitectura y los controles actuales permiten avanzar con riesgo acotado, siempre que se acompañe de KPIs, disciplina operativa y plan de industrialización.
