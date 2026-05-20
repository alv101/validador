# Checklist de Cierre de Piloto
## MVP de Validacion QR

**Fecha de inicio:** ____/____/2026  
**Responsable tecnico:** ____________________  
**Entorno:** ____________________  
**Version / commit:** ____________________

---

## 1. Objetivo

Usar este documento como hoja de seguimiento para cerrar el piloto del MVP de validacion QR.

Focos principales:

- integracion real con ticketing SQL Server
- consistencia del `serviceId`
- comportamiento ante errores del legado
- pruebas E2E reales en moviles
- preparacion operativa del entorno piloto

---

## 2. Estado global

| Bloque | Estado | Responsable |
| --- | --- | --- |
| Query ticketing real | Pendiente |  |
| Contrato `serviceId` | Pendiente |  |
| Politica ante fallo ticketing | Pendiente |  |
| Pruebas E2E en movil | Pendiente |  |
| Configuracion entorno piloto | Pendiente |  |

Estados recomendados: `Pendiente`, `En curso`, `Bloqueado`, `Cerrado`.

Evidencia global:

Observaciones globales:

---

## 3. Bloque 1: Query ticketing real

**Archivo principal:** `api/src/validations/ticketing-sqlserver.adapter.ts`

### Objetivo

Confirmar que la query de candidatos por `locator + dni + serviceId` devuelve los billetes correctos en SQL Server real.

### Criterio de cierre

- La query devuelve los candidatos esperados para casos reales conocidos.
- No aparecen falsos `NOT_FOUND` por diferencias de formato.
- El filtro aplicado sobre fecha, itinerario y servicio queda validado.
- La decision sobre filtrar o no por hora queda cerrada.

### Casos de validacion

| Caso | locator | dni | serviceId | Estado |
| --- | --- | --- | --- | --- |
| VALID-01 | 093B30C3AD | 72518975k |127574_20260302_12:30_1061204  | OK / KO |
| MISMATCH-01 |  |  |  | OK / KO |
| NOTFOUND-01 |  |  |  | OK / KO |
| SERVICE-EDGE-01 |  |  |  | OK / KO |
| DUPLICATE-01 |  |  |  | OK / KO |

Detalle de casos:

- Caso VALID-01
  esperado:
  esperado SQL:al menos 1 fila
  esperado API:VALIDº
  resultado real:
  resultado SQL:
  resultado API:
  observaciones:

- Caso MISMATCH-01
  esperado:
  esperado SQL:
  esperado API:
  resultado real:
  resultado SQL:
  resultado API:
  observaciones:

- Caso NOTFOUND-01
  esperado:
  esperado SQL:
  esperado API:
  resultado real:
  resultado SQL:
  resultado API:
  observaciones:

- Caso SERVICE-EDGE-01
  esperado:
  esperado SQL:
  esperado API:
  resultado real:
  resultado SQL:
  resultado API:
  observaciones:

- Caso DUPLICATE-01
  esperado:
  esperado SQL:
  esperado API:
  resultado real:
  resultado SQL:
  resultado API:
  observaciones:

### Validaciones tecnicas

| Check | Estado |
| --- | --- |
| `buscador` coincide con `locator` tras trim y normalizacion | [ ] |
| `fechaservicio` coincide con la fecha dentro de `serviceId` | [ ] |
| `itinerario` coincide con el tramo `itinerary` | [ ] |
| `id_servicio` coincide con el tramo `service` | [ ] |
| se confirma si el filtro `horaservicio` debe activarse | [ ] |
| `TICKETING_LOCATOR_DEBUG_RAW` queda apagado por defecto | [ ] |

### Incidencias detectadas

| Fecha | Incidencia | Estado |
| --- | --- | --- |
|  |  |  |
|  |  |  |

Detalle de incidencias:

- Incidencia 1
  impacto:
  accion:

- Incidencia 2
  impacto:
  accion:

---

## 4. Bloque 2: Contrato de `serviceId`

**Archivos a revisar:**

- `api/src/validations/service-catalog.controller.ts`
- `api/src/validations/ticketing-sqlserver.adapter.ts`
- `pwa/src/features/service/ServiceSelectPage.tsx`

### Objetivo

Confirmar que el `serviceId` generado por catalogo y seleccionado en PWA representa exactamente el mismo servicio que luego se filtra en validacion.

### Formato acordado

```text
itinerary_date_time_service
```

### Ejemplos reales

| Ejemplo | serviceId | Estado |
| --- | --- | --- |
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |

Detalle de ejemplos:

- Ejemplo 1
  itinerary:
  date:
  time:
  service:
  fuente validada:

- Ejemplo 2
  itinerary:
  date:
  time:
  service:
  fuente validada:

- Ejemplo 3
  itinerary:
  date:
  time:
  service:
  fuente validada:

### Checklist

| Check | Estado |
| --- | --- |
| el catalogo backend construye `serviceId` de forma estable | [ ] |
| la PWA conserva ese valor sin transformaciones ambiguas | [ ] |
| el backend parsea `serviceId` correctamente | [ ] |
| existen 2 o 3 ejemplos reales completos validados | [ ] |
| queda claro si `time` participa en el matching | [ ] |

---

## 5. Bloque 3: Politica ante fallo de ticketing

**Archivo principal:** `api/src/validations/validations.service.ts`

### Objetivo

Definir el comportamiento funcional cuando SQL Server no responde, falla la consulta o devuelve error tecnico.

### Opciones

| Opcion | Respuesta | Elegida |
| --- | --- | --- |
| A | devolver `ERROR` tecnico | si / no |
| B | degradar a `INVALID/NOT_FOUND` | si / no |

Detalle de decision:

- Opcion A
  ventaja: transparencia operativa
  riesgo: puede frenar operacion

- Opcion B
  ventaja: continuidad funcional
  riesgo: oculta fallo tecnico real

### Decision final

**Opcion elegida:** ____________________  
**Motivo:** ________________________________________________  
**Aprobado por:** __________________________________________

### Criterio de cierre

- Existe una unica politica conocida por negocio y tecnico.
- La respuesta funcional es consistente en backend y PWA.
- Queda documentado como se interpreta el fallo durante el piloto.

---

## 6. Bloque 4: Pruebas E2E en movil real

**Archivos principales:**

- `pwa/src/features/scan/ScanPage.tsx`
- `pwa/src/app/ProtectedRoute.tsx`
- `pwa/src/features/service/ServiceSelectPage.tsx`

### Objetivo

Validar el flujo completo en moviles reales, con camara, permisos, red y ticketing reales.

### Matriz de pruebas

| Caso | Dispositivo | Estado |
| --- | --- | --- |
| LOGIN-01 |  | OK / KO |
| SERVICE-SELECT-01 |  | OK / KO |
| VALID-01 |  | OK / KO |
| DUPLICATE-01 |  | OK / KO |
| MISMATCH-01 |  | OK / KO |
| NOTFOUND-01 |  | OK / KO |
| OFFLINE-01 |  | OK / KO |
| TICKETING-DOWN-01 |  | OK / KO |
| IDEMPOTENCY-01 |  | OK / KO |

Detalle de pruebas:

- LOGIN-01
  resultado esperado: accede y carga sesion
  resultado real:
  observaciones:

- SERVICE-SELECT-01
  resultado esperado: permite elegir servicio valido
  resultado real:
  observaciones:

- VALID-01
  resultado esperado: `VALID`
  resultado real:
  observaciones:

- DUPLICATE-01
  resultado esperado: `DUPLICATE`
  resultado real:
  observaciones:

- MISMATCH-01
  resultado esperado: `INVALID` o `DNI_MISMATCH`
  resultado real:
  observaciones:

- NOTFOUND-01
  resultado esperado: `INVALID` o `NOT_FOUND`
  resultado real:
  observaciones:

- OFFLINE-01
  resultado esperado: mensaje offline controlado
  resultado real:
  observaciones:

- TICKETING-DOWN-01
  resultado esperado: segun politica acordada
  resultado real:
  observaciones:

- IDEMPOTENCY-01
  resultado esperado: sin doble consumo
  resultado real:
  observaciones:

### Checklist

| Check | Estado |
| --- | --- |
| Android probado | [ ] |
| iPhone probado, si aplica | [ ] |
| permisos de camara verificados | [ ] |
| cambio de camara probado | [ ] |
| flujo con red inestable probado | [ ] |
| historial backend validado tras pruebas | [ ] |

---

## 7. Bloque 5: Configuracion del entorno piloto

**Archivos de referencia:**

- `infra/docker-compose.yml`
- `api/README.md`
- `pwa/README.md`

### Objetivo

Dejar el entorno de piloto arrancable y reproducible sin pasos ambiguos.

### Checklist tecnico

| Check | Estado |
| --- | --- |
| variables reales de backend definidas | [ ] |
| variables reales de frontend definidas | [ ] |
| credenciales de SQL Server verificadas | [ ] |
| PostgreSQL operativo y persistente | [ ] |
| usuarios iniciales creados | [ ] |
| roles iniciales revisados | [ ] |
| flags de debug desactivados | [ ] |
| procedimiento de arranque documentado | [ ] |
| procedimiento de reinicio documentado | [ ] |
| procedimiento minimo de soporte documentado | [ ] |

### Datos operativos

| Item | Valor |
| --- | --- |
| URL PWA |  |
| URL API |  |
| DB Postgres |  |
| SQL Server ticketing |  |
| Usuario admin inicial |  |

Verificado por:

Fecha:

---

## 8. Go / No-Go del piloto

### Condiciones de Go

| Condicion | Estado |
| --- | --- |
| matching real de ticketing validado | [ ] |
| contrato `serviceId` estable | [ ] |
| politica ante fallo de ticketing decidida | [ ] |
| flujo E2E en movil probado | [ ] |
| entorno piloto reproducible | [ ] |

### Decision final

**Fecha:** ____________________  
**Decision:** `Go` / `No-Go`  
**Motivo:** ________________________________________________  
**Aprobadores:** ___________________________________________

---

## 9. Notas de seguimiento

| Fecha | Autor | Nota |
| --- | --- | --- |
|  |  |  |
|  |  |  |
