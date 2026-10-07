# Solicitudes de movimientos · CESANTONI Logística

| Liga | Para quién |
|---|---|
| https://movimientos-cesantoni.github.io/ | Áreas que piden movimientos (formulario y «Mis solicitudes») |
| https://movimientos-cesantoni.github.io/admin.html | Logística (base y seguimiento) |

Usa el proyecto de Firebase `proveedores-cesantoni`, pero con su propia base (colecciones `sm_`), separada de la de proveedores.
Las reglas de Firestore viven en el repositorio `proveedores-cesantoni.github.io` (`firestore.rules`, bloque `sm_`).
En Firebase › Authentication › Settings › Authorized domains debe estar `movimientos-cesantoni.github.io`.

## Formulario por pasos

1. Tipo de producto (Mobiliario, Estructuras de metal, Stand completo, Sillas, Regalos, Vinos u Otro).
2. Tipo de movimiento (Entrega, Entrega y posterior recolección, Recolección, Devolución, Traslado, Mercadotecnia u Otro).
3. Datos del producto: artículos con cantidad, descripción, forma de envío (paquetería con medidas), folio y factura.
4. Devolución (solo en devoluciones): motivo, fotos y checklist.
5. Datos administrativos: quién solicita, departamento solicitante y quién absorbe el costo.
6. Fechas: fecha requerida o abierta, recolección (fecha o «No requiere recolección») y tipo de solicitud (Programado o Urgente).
   Con menos de 48 horas se marca Urgente y queda «Pendiente de autorización» del Gerente de Área; Logística registra la autorización en el panel.
7. Origen y destino con contacto, teléfono, referencias, cita y observaciones.
8. Cotización y documentos.
9. Resumen con «Editar» y «Confirmar solicitud».

Pruebas: `tests/solicitudes-web/e2e.mjs` (repositorio privado) con el emulador de Firebase: 91 de 91 correctas.
