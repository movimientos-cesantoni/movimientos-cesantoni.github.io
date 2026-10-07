# Solicitudes de movimientos · CESANTONI Logística

| Liga | Para quién |
|---|---|
| https://movimientos-cesantoni.github.io/ | Áreas que piden movimientos (formulario y «Mis solicitudes») |
| https://movimientos-cesantoni.github.io/admin.html | Logística (base y seguimiento) |

Usa el proyecto de Firebase `proveedores-cesantoni`, pero con su propia base (colecciones `sm_`), separada de la de proveedores.
Las reglas de Firestore viven en el repositorio `proveedores-cesantoni.github.io` (`firestore.rules`, bloque `sm_`).
En Firebase › Authentication › Settings › Authorized domains debe estar `movimientos-cesantoni.github.io`.

| https://movimientos-cesantoni.github.io/autorizar.html | Quien autoriza el costo (se abre desde la liga del correo) |

## Formulario por pasos

1. ¿Qué envías? (Producto, Mobiliario, Mesas, Sillas, Estructuras de metal, Stand completo, Regalos, Vinos u Otro) y casilla «Es una devolución de cliente».
2. Solicitante: nombre, departamento, correo y teléfono.
3. ¿De dónde? y 4. ¿A dónde?: ubicación, link de ubicación, contacto y teléfono.
5. Tipo de servicio (Unidad dedicada o Paquetería) y especificaciones agrupadas: cantidad × largo × ancho × alto (cm) × peso c/u (kg),
   con peso total automático. Un renglón por grupo de piezas iguales.
6. Devolución (solo en devoluciones): motivo, fotos y checklist.
7. ¿Quién absorbe el costo? CESANTONI (pide el correo de quien autoriza), Cliente, Proveedor u Otro.
8. Documentación del servicio: cotización, correo de cotización, autorización adicional, salida, folio, factura y otros archivos.
9. Fechas tentativas de recolección y entrega (o fecha abierta), casilla «El material regresa después», leyenda de condiciones y aviso de 48 horas.
10. Confirmación: resumen con «Editar», casilla «He leído y acepto las condiciones» y «Enviar solicitud».

## Autorización de costo por correo

Desde el panel, Logística da clic en «Enviar a autorización por correo». Se crea `sm_autorizaciones/{token}` (token secreto de 32 caracteres)
y se envía un correo con «Autorizar costo» y «Rechazar». La liga abre `autorizar.html`, donde se confirma sin cuenta. La respuesta actualiza
el folio (`aut_estado`, `aut_por`, `aut_nombre`, `aut_fecha`, `aut_ref`) y queda como evidencia en el expediente. Las reglas solo permiten
responder una vez y con el token vigente; al reenviar o registrar a mano, la liga anterior deja de servir.

Pruebas: `tests/solicitudes-web/e2e.mjs` (repositorio privado) con el emulador de Firebase: 115 de 115 correctas.
