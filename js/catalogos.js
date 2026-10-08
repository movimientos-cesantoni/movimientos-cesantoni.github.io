/* Catálogos de la plataforma de solicitudes de movimientos (los mismos de la versión probada).
   Generado desde solicitudes-movimientos/Code.gs del repositorio privado; para cambiar un catálogo edítalo aquí. */
/* Estados de la República (origen y destino). */
export const ESTADOS_MX = ["Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Ciudad de México","Coahuila","Colima","Durango","Estado de México","Guanajuato","Guerrero","Hidalgo","Jalisco","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas"];
export const AREAS = ["Customer Service","Mercadotecnia","Calidad","Distribución","Almacén / CEDIS","Última Milla Zacatecas","Entregas Locales Ceramic","Producción","Parque Vehicular","Logística","Exhibición"];
/* Nombres anteriores que cambiaron (en minúsculas → nombre nuevo). */
export const AREAS_RENOMBRADAS = { "entregas locales cdmx": "Entregas Locales Ceramic" };
/* Áreas nuevas que se agregan aunque el administrador ya haya guardado su lista (una vez; después las puede quitar). */
/* Lugares frecuentes de origen y destino: al elegirlos se llenan ciudad, Estado, dirección y contacto.
   El administrador los corrige o agrega en Configuración › Lugares frecuentes. */
export const LUGARES = [
  { nombre: "CEDIS Planta", ciudad: "Calera de Víctor Rosales", estado: "Zacatecas", direccion: "CEDIS Planta CESANTONI", link: "", contacto: "", telefono: "" },
  { nombre: "CEDIS Cuautitlán", ciudad: "Cuautitlán", estado: "Estado de México", direccion: "CEDIS Cuautitlán CESANTONI", link: "", contacto: "", telefono: "" }
];
export const AREAS_NUEVAS = ["Parque Vehicular","Logística","Exhibición"];
/* Tipo de movimiento (qué se hace con el producto). Las claves se conservan para no afectar solicitudes ya guardadas. */
export const TIPOS = [["envio","Entrega de producto","Llevar producto o material a un destino."],["entrega_recoleccion","Entrega y posterior recolección","Se entrega y después se recoge (eventos, stands, sillas, mobiliario)."],["recoleccion","Recolección","Recoger material en un punto."],["devolucion","Devolución de producto","Material que regresa un cliente. Pide fotos y checklist."],["traslado","Traslado","Entre plantas, CEDIS, bodegas o sucursales."],["mercadotecnia","Mercadotecnia","Stands, exhibidores y eventos."],["otro","Otro","Cualquier otro movimiento; lo especificas."]];
/* Movimientos en los que se pregunta si el material regresa después (fecha de recolección). */
export const CON_RECOLECCION = ["envio","mercadotecnia","otro"];
/* ¿Qué envías? (primer paso del formulario). */
export const PRODUCTOS = [["Producto","Piso, porcelanato o producto terminado."],["Mobiliario","Vitrinas, exhibidores, muebles."],["Mesas",""],["Sillas",""],["Estructuras de metal","Racks, bases y estructuras."],["Stand completo","Stand para evento o exposición."],["Regalos","Artículos promocionales."],["Vinos",""],["Otro","Lo especificas."]];
/* Tipo de solicitud. Las solicitudes antiguas guardadas como «Normal» se muestran como «Programado». */
export const PRIORIDADES = ["Programado","Urgente"];
/* ¿Quién absorbe el costo? Si es CESANTONI, el costo pasa por autorización por correo. */
export const COSTOS = ["CESANTONI","Cliente","Proveedor","Otro"];
export const COSTO_AUTORIZA = "CESANTONI";
export const AUT_ESTADOS = ["Pendiente de autorización","Autorizado","Rechazado"];
export const CONDICIONES = "Condiciones del servicio: Las fechas seleccionadas son tentativas y están sujetas a disponibilidad y confirmación del servicio. Las solicitudes deberán realizarse con al menos 48 horas de anticipación; las que se reciban después de las 3:00 p. m. cuentan como recibidas al día siguiente. Las solicitudes realizadas con menor anticipación podrán generar sobrecostos y requerirán autorización del Gerente de Área. La fecha definitiva será confirmada una vez que el servicio y, cuando corresponda, el costo hayan sido autorizados.";
export const AUT_PENDIENTE = "Pendiente de autorización";
/* Días mínimos de anticipación: con menos, la solicitud es urgente y requiere autorización del Gerente de Área. */
export const DIAS_ANTICIPACION = 2;
/* Hora de corte (hora del centro de México): lo que se pide desde esta hora cuenta como pedido al día siguiente. */
export const HORA_CORTE = 15;
export const ESTADOS = {"recibida":"Recibida","en_revision":"En revisión","informacion":"Falta información","programada":"Programada","en_transito":"En tránsito","completada":"Completada","cancelada":"Cancelada","rechazada":"No procede"};
export const ABIERTOS = ["recibida","en_revision","informacion","programada","en_transito"];
export const CANCELABLES = ["recibida","en_revision","informacion"];
/* Tipo de servicio. «Camión / unidad» es el nombre anterior de «Unidad dedicada». */
export const FORMAS_ENVIO = ["Unidad dedicada","Paquetería"];
export const PAQUETERIA = "Paquetería";
export const FACTOR_VOLUMETRICO = 5000;
export const MOTIVOS_DEVOLUCION = ["Cambio de tono","Cambio de calibre","Cambio de formato","Producto dañado","Producto equivocado","Producto incompleto","Sobrante de obra","El cliente ya no lo requiere","Otro"];
export const CHECKLIST_DEVOLUCION = ["Está en su empaque original y las cajas están cerradas","Las cajas no tienen golpes ni humedad, y no hay piezas rotas o despostilladas","No ha sido instalado, cortado ni manipulado","Las etiquetas (lote, tono y calibre) se ven y coinciden con lo facturado","La cantidad coincide con la factura o la nota de crédito","Está en tarima, flejado y emplayado, listo para cargar","La devolución está autorizada (nota de crédito o autorización del gerente)"];
export const CATEGORIAS = ["EXTERNO","ALMACEN","OBRA","PAQUETERIA","OTROS"];
export const TRANSPORTISTAS = ["ACARREOS MAMAEV","ALMEX","AM INTERMODAL","AUTOEXPRESS AGUILAR","AUTOEXPRESS CARRASCO","AUTOEXPRESS CERVANTES","AUTOEXPRESS DEL MINERAL","AUTOEXPRESS ESTRADA","AUTOEXPRESS MEDINA","AUTOEXPRESS MUÑOZ","AUTOEXPRESS OLIVAS","AUTOEXPRESS PARGA","AUTOEXPRESS POTRILLOS","AUTOEXPRESS VELAZQUEZ","AUTOTRANSPORTES HERIVA","CH ROBINSON","CLIENTE ENVIA UNIDAD","DANIEL FERNANDEZ","DESARROLLO LOGISTICO","FEMA","FRANCISCO ORTEGA","GROMAR","JOEL MARTINEZ","LOGISTICA INTERNACIONAL","MASER","MATA TRUCKING","OSVALDO ORTIZ","OVERSEAS","PALOS GARZA","PAQUETEEXPRESS","PAQUETERIA","ROJAS","SOLISTICA","TARKUS TRANSPORTES","TRANSPORTE BISONTE","TRANSPORTES 3H","TRANSPORTES ACUÑA","TRANSPORTES ARANCETION","TRANSPORTES AURORA ESQUIVEL","TRANSPORTES CARMONA","TRANSPORTES CARVAN","TRANSPORTES DOMINGUEZ","TRANSPORTES ELEAM","TRANSPORTES GUTIERREZ","TRANSPORTES HEFL","TRANSPORTES J HERNANDEZ","TRANSPORTES JASA","TRANSPORTES LEXA","TRANSPORTES LINARES","TRANSPORTES LOPEZ INTERNACIONAL","TRANSPORTES LOZAGUI","TRANSPORTES MAROLOS","TRANSPORTES MARTINEZ GUTIERREZ","TRANSPORTES NAVARRO","TRANSPORTES PINEDO","TRANSPORTES SALAS","TRANSPORTES SIFUENTES","TRANSPORTES TEEXSA","TRANSPORTES TNT","TRANSPORTES TORRES","TRANSPORTES TRAZA","TRANSPORTES TREJOS TRUCKING","TRANSPORTES VATRU","TRUCKA","UBER FREIGHT"];
export const TIPOS_UNIDAD = ["SENCILLO","TORTON","RABON","CAMIONETA 3.5","CAJA SECA 53","CAJA SECA 48","CAJA CERRADA","FULL","PLATAFORMA SENCILLO","PLATAFORMA FULL","CONTENEDOR 20","PAQUETERIA"];
/* Campos que captura quien solicita: [clave, etiqueta, obligatorio, máximo].
   Por compatibilidad con las solicitudes ya guardadas, algunos conservan su nombre interno:
   area = Departamento, motivo = Descripción general, referencia = Folio, cliente = Factura, horario = Requiere cita,
   fecha_requerida = Fecha tentativa de recolección, fecha_recoleccion = Recolección posterior (entrega y posterior recolección).
   Las especificaciones (cantidad, medidas y peso) se validan aparte. */
export const CAMPOS = [["solicitante","Nombre del solicitante",true,120],["area","Departamento / Área",true,80],["correo","Correo",true,160],["telefono","Teléfono",false,40],["producto_tipo","¿Qué envías?",true,40],["producto_otro","Especificar qué envías",false,120],["tipo","Tipo de movimiento",true,30],["tipo_otro","Especificar movimiento",false,120],["forma_envio","Tipo de servicio",true,30],["referencia","Folio",false,120],["cliente","Factura",false,160],["horario","Requiere cita",false,4],["motivo","Descripción general",false,5000],["observaciones","Observaciones",false,2000],["dev_motivo","Motivo de la devolución",false,60],["dev_checklist","Puntos que cumple el material",false,1500],["costo_absorbe","¿Quién absorbe el costo?",true,40],["costo_detalle","Especificar quién absorbe el costo",false,120],["aut_correo","Correo de quien autoriza",false,160],["fecha_requerida","Fecha tentativa de recolección",false,10],["fecha_entrega","Fecha tentativa de entrega",false,10],["fecha_abierta","Fecha abierta",false,4],["fecha_recoleccion","Fecha de recolección posterior",false,10],["recoleccion_abierta","Recolección posterior abierta",false,4],["origen_ciudad","Ciudad o municipio de origen",true,80],["origen_estado","Estado de origen",true,40],["origen_direccion","Ubicación / dirección de origen",true,300],["origen_link","Link de ubicación de origen",false,500],["origen_contacto","Contacto en origen",false,160],["origen_telefono","Teléfono en origen",false,40],["destino_ciudad","Ciudad o municipio de destino",true,80],["destino_estado","Estado de destino",true,40],["destino_direccion","Ubicación / dirección de destino",true,300],["destino_link","Link de ubicación de destino",false,500],["destino_contacto","Contacto en destino",false,160],["destino_telefono","Teléfono en destino",false,40],["acepta_condiciones","Aceptación de condiciones",true,4]];
export const CAMPOS_LOGISTICA = ["folio_cstext","categorizacion","responsable","transportista","unidad_asignada","guia","fecha_programada","notas_internas"];
/* Expediente del folio: tipos de documento (además de los archivos generales). */
export const CLASES_ARCHIVO = ["evidencia","cotizacion","autorizacion","salida"];
/* Perfiles del panel. «operador» es el nombre anterior de «planeador». */
export const ROLES = [["admin","Administrador","Ve todo: solicitudes, facturación y configuración (personal, alertas y catálogos)."],["planeador","Planeador","Programa la fecha de carga, cambia estatus, captura montos y asigna el folio CSTEXT."],["facturacion","Facturación","Descarga las plantillas de entregas concluidas por proveedor y las marca como facturadas."]];
/* Alertas por correo que cada persona puede recibir. */
export const ALERTAS = [["nueva","Solicitud nueva"],["modificada","Solicitud modificada"],["mensaje","Mensajes y cancelaciones"],["autorizacion","Respuesta de autorización"],["completada","Entrega concluida (facturación)"]];
/* Movimientos que usa la lógica del formulario: no se pueden borrar del catálogo. */
export const TIPOS_FIJOS = ["envio","entrega_recoleccion","devolucion"];
export const CSTEXT_PREFIJO = "CSTEXT";
export const CST = "CST";
/* Concepto del cargo que define el planeador: separa las plantillas en carpetas. */
export const CONCEPTOS = ["Flete","Maniobras","Paquetería"];
