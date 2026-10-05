# Solicitudes de movimientos · CESANTONI Logística

| Liga | Para quién |
|---|---|
| https://movimientos-cesantoni.github.io/ | Áreas que piden movimientos (formulario y «Mis solicitudes») |
| https://movimientos-cesantoni.github.io/admin.html | Logística (base y seguimiento) |

Usa el proyecto de Firebase `proveedores-cesantoni`, pero con su propia base (colecciones `sm_`), separada de la de proveedores.
Las reglas de Firestore viven en el repositorio `proveedores-cesantoni.github.io` (`firestore.rules`, bloque `sm_`).
En Firebase › Authentication › Settings › Authorized domains debe estar `movimientos-cesantoni.github.io`.

Pruebas: `tests/solicitudes-web/e2e.mjs` (repositorio privado) con el emulador de Firebase: 51 de 51 correctas.
