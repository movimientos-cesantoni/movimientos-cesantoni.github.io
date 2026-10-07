/* Plataforma de solicitudes de movimientos · CESANTONI Somos Logística (versión web).
 * Lo que en la versión de Apps Script hacía Code.gs, aquí sobre Firebase (Authentication + Firestore).
 * Colecciones propias con prefijo sm_: no comparten datos con la plataforma de proveedores (pv_).
 * La seguridad real la imponen las reglas de Firestore (firestore.rules, bloque «Solicitudes de movimientos»).
 */
import * as fb from './firebase-sdk.js?v=13';
import * as C from './catalogos.js?v=6';

const CFG = window.CP_CONFIG || {};
const COL = { config: 'sm_config', admins: 'sm_admins', inv: 'sm_invitaciones', sol: 'sm_solicitudes', correos: 'sm_correos' };
const ZONA = 'America/Mexico_City';
const MAX_MB = 5;
const CHUNK = 700000;
const VERSION = '1.0-web';

let auth = null, db = null;

/* ------------------------------------------------------------------ arranque */
function emular(a, d) {
  if (!CFG.emulator) return;
  fb.connectAuthEmulator(a, 'http://' + CFG.emulator.auth, { disableWarnings: true });
  if (d) { const [host, port] = CFG.emulator.firestore.split(':'); fb.connectFirestoreEmulator(d, host, Number(port)); }
}
/* El formulario y el panel usan instancias separadas para que sus sesiones no se mezclen. */
export function iniciar(ambito) {
  if (!(CFG.firebase && CFG.firebase.apiKey)) return Promise.reject(new Error('Falta la configuración de Firebase (js/config.js).'));
  const app = fb.initializeApp(CFG.firebase, 'solicitudes-' + ambito);
  auth = fb.getAuth(app);
  db = fb.getFirestore(app);
  emular(auth, db);
  return new Promise((ok) => { const off = fb.onAuthStateChanged(auth, () => { off(); ok(true); }); });
}

/* ------------------------------------------------------------------ utilidades */
const ref = (...p) => fb.doc(db, ...p);
const col = (...p) => fb.collection(db, ...p);
async function getOne(r) { const s = await fb.getDoc(r); return s.exists() ? { id: s.id, ...s.data() } : null; }
async function getAll(q) { return (await fb.getDocs(q)).docs.map((s) => ({ id: s.id, ...s.data() })); }
const donde = (c, f, v) => fb.query(col(c), fb.where(f, '==', v));
function partesFecha(d) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d || new Date()).forEach((x) => { p[x.type] = x.value; });
  return p;
}
function ahora() { const p = partesFecha(); return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second; }
function hoy() { const p = partesFecha(); return p.year + '-' + p.month + '-' + p.day; }
function azar(n, chars) { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, (x) => chars[x % chars.length]).join(''); }
const nuevoId = () => azar(20, 'abcdefghijklmnopqrstuvwxyz0123456789');
const nuevaClave = () => { const c = azar(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); return c.slice(0, 4) + '-' + c.slice(4); };
const correoOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
const tipoNombre = (k) => { const t = C.TIPOS.find((x) => x[0] === k); return t ? t[1] : k; };
/* «Normal» es el nombre anterior de «Programado». */
const prioridad = (p) => (p === 'Normal' ? 'Programado' : p || '');
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
function sumarDias(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* Menos de 48 horas de anticipación: la fecha requerida cae antes de pasado mañana (se calcula por día, sin horas). */
const fueraDeTiempo = (fecha) => esFecha(fecha) && fecha < sumarDias(hoy(), C.DIAS_ANTICIPACION);
const conRecoleccion = (tipo) => tipo === 'entrega_recoleccion' || C.CON_RECOLECCION.includes(tipo);
const productoNombre = (s) => (s.producto_tipo === 'Otro' ? s.producto_otro || 'Otro' : s.producto_tipo || '');
const movimientoNombre = (s) => (s.tipo === 'otro' && s.tipo_otro ? 'Otro: ' + s.tipo_otro : tipoNombre(s.tipo));
function articulosTexto(s) {
  return [].concat(s.articulos || []).map((a) => a.cantidad + ' × ' + a.producto + (a.descripcion ? ' · ' + a.descripcion : '')).join('\n');
}
const base = () => new URL('./', location.href).href;
const urlPortal = () => base();
const urlPanel = (folio) => new URL('admin.html' + (folio ? '?folio=' + encodeURIComponent(folio) : ''), base()).href;
const sesionError = (m) => new Error('SESION: ' + (m || 'Tu sesión terminó. Entra de nuevo.'));
const fallo = (m) => new Error(m);

const MSG = {
  'permission-denied': 'No tienes permiso para esta acción o tu sesión cambió. Vuelve a entrar.',
  'unavailable': 'Sin conexión con la base de datos. Revisa tu internet e inténtalo de nuevo.',
  'resource-exhausted': 'Se alcanzó el límite gratuito diario de la base de datos. Inténtalo mañana.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/invalid-credential': 'Correo o clave incorrectos.',
  'auth/wrong-password': 'Correo o clave incorrectos.',
  'auth/user-not-found': 'Correo o clave incorrectos.',
  'auth/invalid-email': 'Escribe un correo válido.',
  'auth/user-disabled': 'Esta cuenta está desactivada.',
  'auth/weak-password': 'La contraseña es muy corta.',
  'auth/requires-recent-login': 'Por seguridad, sal y vuelve a entrar para hacer este cambio.',
  'auth/operation-not-allowed': 'El acceso con correo y contraseña no está activado en Firebase.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (Authentication > Configuración > Dominios autorizados).'
};
/* Mensaje claro para cualquier error (lo usa U.run en comun.js). */
export function amigable(e) {
  if (e && MSG[e.code]) return MSG[e.code];
  if (e && /^SESION:/.test(e.message || '')) return e.message;
  if (e && e.message && !e.code) return e.message;
  console.warn('Detalle técnico:', e);
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/* ------------------------------------------------------------------ correos (Gmail con respaldo EmailJS, igual que proveedores) */
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "font-family:Figtree,Montserrat,'Segoe UI',Arial,sans-serif";
function tarjeta(c) {
  const img = (f) => new URL('img/' + f, base()).href;
  const oscuro = c.plantilla === 'interno';
  return '<div style="background:#F4F2EF;padding:26px 12px;' + FONT + '"><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E3DE">' +
    '<tr><td style="padding:18px 26px;border-top:4px solid #D77129"><img src="' + img('logo-cesantoni.png') + '" alt="CESANTONI" width="130" style="vertical-align:middle;border:0;height:auto">' +
    '<span style="display:inline-block;width:1px;height:34px;background:#D8D6D1;margin:0 12px;vertical-align:middle"></span>' +
    '<img src="' + img('logo-somos.png') + '" alt="Somos Logística CESANTONI" width="110" style="vertical-align:middle;border:0;height:auto"></td></tr>' +
    '<tr><td style="padding:22px 26px;' + (oscuro ? 'background:#0D1114;color:#fff' : '') + '">' +
    (c.etiqueta ? '<div style="display:inline-block;background:#D77129;color:#fff;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;letter-spacing:1.2px">' + esc(c.etiqueta) + '</div>' : '') +
    (c.folio ? '<div style="margin-top:8px;font-size:13px;' + (oscuro ? 'color:#C9D2DE' : 'color:#5F666C') + '">Folio <b style="' + (oscuro ? 'color:#fff' : 'color:#0D1114') + '">' + esc(c.folio) + '</b></div>' : '') +
    '<h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;' + (oscuro ? 'color:#fff' : 'color:#0D1114') + '">' + esc(c.titulo) + '</h1></td></tr>' +
    '<tr><td style="padding:20px 26px">' +
    (c.parrafos || []).map((p) => '<p style="margin:0 0 12px;font-size:14.5px;line-height:1.6;color:#2E3439">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') +
    ((c.datos || []).length ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;border-radius:10px;margin:12px 0">' +
      c.datos.map((r) => '<tr><td style="padding:8px 14px;font-size:12.5px;color:#5F666C;width:38%">' + esc(r[0]) + '</td><td style="padding:8px 14px;font-size:14px;font-weight:700;color:#0D1114">' + esc(r[1]).replace(/\n/g, '<br>') + '</td></tr>').join('') + '</table>' : '') +
    (c.boton ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px"><tr><td style="border-radius:8px;background:#B45309"><a href="' + esc(c.boton.url) +
      '" style="display:inline-block;padding:12px 22px;color:#fff;text-decoration:none;font-weight:700;font-size:14px">' + esc(c.boton.texto) + ' &rarr;</a></td></tr></table>' : '') +
    (c.nota ? '<p style="margin:14px 0 0;font-size:12.5px;color:#5F666C">' + esc(c.nota) + '</p>' : '') +
    '</td></tr><tr><td style="padding:12px 26px;background:#FAF8F5;font-size:12px;color:#5F666C">CESANTONI | Somos Logística · Solicitudes de movimientos · mensaje automático</td></tr></table></div>';
}
function textoPlano(c) {
  const l = [c.titulo, c.folio ? 'Folio: ' + c.folio : '', ''].concat(c.parrafos || []);
  (c.datos || []).forEach((r) => l.push(r[0] + ': ' + r[1]));
  if (c.boton) l.push('', c.boton.texto + ': ' + c.boton.url);
  if (c.nota) l.push('', c.nota);
  return l.join('\n');
}
async function porGmail(para, c, html) {
  if (!(CFG.correo && /^https:\/\//.test(CFG.correo.url || ''))) throw new Error('Gmail no configurado');
  const u = auth.currentUser;
  if (!u) throw new Error('Sin sesión para Gmail');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(CFG.correo.url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: await u.getIdToken(), to: para, subject: c.asunto, html, text: textoPlano(c), proveedor_id: '' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'respuesta ' + r.status);
  } finally { clearTimeout(t); }
}
async function porEmailJS(para, c, html) {
  const e = CFG.emailjs || {};
  if (!(e.publicKey && e.serviceId && e.templateId)) throw new Error('EmailJS no configurado');
  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: e.serviceId, template_id: e.templateId, user_id: e.publicKey,
      template_params: { to_email: para, subject: c.asunto, html, message: textoPlano(c) } }) });
  if (!r.ok) throw new Error('EmailJS respondió ' + r.status);
}
/* Envía y deja constancia en sm_correos. Nunca detiene el flujo si falla. */
async function enviarCorreo(c) {
  const para = [...new Set([].concat(c.para || []).map((x) => String(x || '').trim().toLowerCase()).filter(correoOk))];
  const reg = { fecha: ahora(), folio: c.folio || '', para: para.join(', '), asunto: c.asunto, estado: 'error', error: '', medio: '' };
  if (!para.length) reg.error = c.plantilla === 'interno' ? 'Sin correos de aviso (Panel › Configuración).' : 'Correo no válido.';
  else {
    const html = tarjeta(c), fallas = [];
    for (const [medio, fn] of [['gmail', porGmail], ['emailjs', porEmailJS]]) {
      try { await fn(para.join(','), c, html); reg.estado = 'enviado'; reg.medio = medio; break; }
      catch (e) { fallas.push(medio + ': ' + (e.name === 'AbortError' ? 'sin respuesta' : e.message)); }
    }
    if (reg.estado !== 'enviado') reg.error = fallas.join(' · ').slice(0, 400);
  }
  try { await fb.setDoc(ref(COL.correos, nuevoId()), reg); } catch (e) { /* la bitácora no detiene el flujo */ }
  return reg;
}
async function avisos() {
  try { const d = await getOne(ref(COL.config, 'avisos')); return ((d && d.correos) || []).filter(correoOk); } catch (e) { return []; }
}

/* ------------------------------------------------------------------ validación (misma lógica que la versión probada) */
function validar(d) {
  const errores = {};
  C.CAMPOS.forEach((c) => {
    const v = String(d[c[0]] === undefined || d[c[0]] === null ? '' : d[c[0]]).trim();
    d[c[0]] = v;
    if (c[2] && !v) errores[c[0]] = 'Obligatorio.';
    else if (v.length > c[3]) errores[c[0]] = 'Máximo ' + c[3] + ' caracteres.';
  });
  if (d.correo && !correoOk(d.correo)) errores.correo = 'Escribe un correo válido.';
  if (d.producto_tipo && !C.PRODUCTOS.some((x) => x[0] === d.producto_tipo)) errores.producto_tipo = 'Elige un tipo de producto.';
  if (d.producto_tipo === 'Otro' && !d.producto_otro) errores.producto_otro = 'Obligatorio.';
  if (d.producto_tipo !== 'Otro') d.producto_otro = '';
  if (d.tipo && !C.TIPOS.some((t) => t[0] === d.tipo)) errores.tipo = 'Elige un tipo.';
  if (d.tipo === 'otro' && !d.tipo_otro) errores.tipo_otro = 'Obligatorio.';
  if (d.tipo !== 'otro') d.tipo_otro = '';
  if (d.prioridad && !C.PRIORIDADES.includes(d.prioridad)) errores.prioridad = 'Elige el tipo de solicitud.';
  if (d.forma_envio && !C.FORMAS_ENVIO.includes(d.forma_envio)) errores.forma_envio = 'Elige una forma de envío.';
  if (d.tipo === 'devolucion' && !C.MOTIVOS_DEVOLUCION.includes(d.dev_motivo)) errores.dev_motivo = 'Elige el motivo de la devolución.';
  if (d.costo_absorbe && !C.COSTOS.includes(d.costo_absorbe)) errores.costo_absorbe = 'Elige quién absorbe el costo.';
  if (['Otro departamento', 'Otro'].includes(d.costo_absorbe) && !d.costo_detalle) errores.costo_detalle = 'Obligatorio.';
  if (!['Otro departamento', 'Otro'].includes(d.costo_absorbe)) d.costo_detalle = '';
  d.horario = d.horario === 'Sí' ? 'Sí' : '';
  /* Fechas: fecha requerida o «Fecha abierta». */
  d.fecha_abierta = d.fecha_abierta === 'Sí' ? 'Sí' : '';
  if (d.fecha_abierta) d.fecha_requerida = '';
  else if (!esFecha(d.fecha_requerida)) errores.fecha_requerida = 'Elige la fecha o marca «Fecha abierta».';
  else if (d.fecha_requerida < hoy()) errores.fecha_requerida = 'La fecha ya pasó.';
  /* Recolección: obligatoria en «Entrega y posterior recolección»; opcional en entregas; no aplica en lo demás. */
  if (d.tipo === 'entrega_recoleccion') d.recoleccion = 'Sí';
  else if (!C.CON_RECOLECCION.includes(d.tipo)) d.recoleccion = '';
  else if (!['Sí', 'No'].includes(d.recoleccion)) errores.recoleccion = 'Indica si el material regresa.';
  d.recoleccion_abierta = d.recoleccion === 'Sí' && d.recoleccion_abierta === 'Sí' ? 'Sí' : '';
  if (d.recoleccion !== 'Sí' || d.recoleccion_abierta) d.fecha_recoleccion = '';
  else if (!esFecha(d.fecha_recoleccion)) errores.fecha_recoleccion = 'Elige la fecha de recolección o márcala como abierta.';
  else if (d.fecha_requerida && d.fecha_recoleccion < d.fecha_requerida) errores.fecha_recoleccion = 'Debe ser igual o posterior a la fecha de entrega.';
  /* Menos de 48 horas: urgente y con autorización del Gerente de Área. */
  if (fueraDeTiempo(d.fecha_requerida)) {
    d.prioridad = 'Urgente';
    if (!d.aut_gerente) errores.aut_gerente = 'Obligatorio.';
  } else d.aut_gerente = '';
  return errores;
}
/* Artículos: cada renglón con producto, cantidad y descripción. */
function articulos(lista) {
  lista = [].concat(lista || []).filter((x) => x && (String(x.producto || '').trim() || String(x.cantidad || '').trim() || String(x.descripcion || '').trim()));
  if (!lista.length) throw fallo('Agrega al menos un artículo con su cantidad.');
  if (lista.length > 30) throw fallo('Máximo 30 artículos por solicitud.');
  return lista.map((x, i) => {
    const n = Number(String(x.cantidad).replace(',', '.')), producto = String(x.producto || '').trim().slice(0, 80);
    if (!producto) throw fallo('Artículo ' + (i + 1) + ': escribe qué producto es.');
    if (!(n > 0 && n <= 99999)) throw fallo('Artículo ' + (i + 1) + ': escribe la cantidad (número mayor a cero).');
    return { producto, cantidad: String(n), descripcion: String(x.descripcion || '').trim().slice(0, 300) };
  });
}
function paquetes(lista) {
  lista = [].concat(lista || []).slice(0, 20);
  const lineas = []; let total = 0, peso = 0, vol = 0;
  lista.forEach((p, i) => {
    const n = Number(p && p.cantidad), l = Number(p && p.largo), a = Number(p && p.ancho), h = Number(p && p.alto), kg = Number(p && p.peso);
    const fila = 'Paquete ' + (i + 1) + ': ';
    if (!(n >= 1 && n <= 999 && Math.floor(n) === n)) throw fallo(fila + 'la cantidad debe ser un número entero de 1 a 999.');
    [[l, 'largo'], [a, 'ancho'], [h, 'alto']].forEach((m) => { if (!(m[0] > 0 && m[0] <= 400)) throw fallo(fila + 'escribe el ' + m[1] + ' en centímetros (de 1 a 400).'); });
    if (!(kg > 0 && kg <= 2000)) throw fallo(fila + 'escribe el peso por paquete en kilos.');
    total += n; peso += n * kg; vol += n * l * a * h / C.FACTOR_VOLUMETRICO;
    lineas.push(n + ' × ' + l + ' × ' + a + ' × ' + h + ' cm, ' + kg + ' kg c/u');
  });
  const r = (x) => Math.round(x * 10) / 10;
  return { texto: lineas.join('\n'), total, peso: r(peso), vol: r(vol) };
}

/* ------------------------------------------------------------------ portal: quien solicita */
export function configPortal() {
  const u = auth && auth.currentUser;
  return { areas: C.AREAS, tipos: C.TIPOS, estados: C.ESTADOS, abiertos: C.ABIERTOS, cancelables: C.CANCELABLES,
    formas_envio: C.FORMAS_ENVIO, paqueteria: C.PAQUETERIA, factor_volumetrico: C.FACTOR_VOLUMETRICO,
    motivos_devolucion: C.MOTIVOS_DEVOLUCION, checklist: C.CHECKLIST_DEVOLUCION, max_mb: MAX_MB, hoy: hoy(),
    limite_programado: sumarDias(hoy(), C.DIAS_ANTICIPACION), productos: C.PRODUCTOS, reutilizables: C.REUTILIZABLES,
    con_recoleccion: C.CON_RECOLECCION, prioridades: C.PRIORIDADES, costos: C.COSTOS, aut_estados: C.AUT_ESTADOS,
    sesion: u ? { correo: u.email } : null };
}

export async function entrarSolicitante(correo, clave) {
  correo = String(correo || '').trim().toLowerCase();
  if (!correoOk(correo) || !clave) throw fallo('Escribe tu correo y tu clave.');
  const t = String(clave).trim();
  await fb.signInWithEmailAndPassword(auth, correo, /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(t) ? t.toUpperCase() : t);
  return { correo };
}
export async function salirSolicitante() { await fb.signOut(auth); return true; }
export async function recuperarClave(correo) {
  correo = String(correo || '').trim().toLowerCase();
  if (correoOk(correo)) { try { await fb.sendPasswordResetEmail(auth, correo, { url: urlPortal() }); } catch (e) { /* respuesta genérica */ } }
  return 'Si ese correo tiene solicitudes, te llegará un enlace para crear una nueva clave.';
}

function resumen(s) {
  return { folio: s.folio, creada: s.creada, actualizada: s.actualizada, estado: s.estado, prioridad: prioridad(s.prioridad), tipo: s.tipo,
    tipo_nombre: movimientoNombre(s), producto: productoNombre(s), fecha_requerida: s.fecha_requerida || '', fecha_abierta: s.fecha_abierta || '', origen: s.origen_nombre + ', ' + s.origen_ciudad, destino: s.destino_nombre + ', ' + s.destino_ciudad };
}
export async function misSolicitudes() {
  const u = auth.currentUser;
  if (!u) throw sesionError('Entra con tu correo y tu clave.');
  return (await getAll(donde(COL.sol, 'uid', u.uid))).map(resumen).sort((a, b) => String(b.creada).localeCompare(String(a.creada)));
}

async function archivosDe(folio) {
  return (await getAll(col(COL.sol, folio, 'archivos'))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((a) => ({ id: a.id, fecha: a.fecha, autor: a.autor, nombre: a.nombre, tamano: a.tamano, mime: a.mime, evidencia: !!a.evidencia,
      cotizacion: a.clase === 'cotizacion',
      url: '#archivo:' + encodeURIComponent(folio) + ':' + a.id }));
}
const OCULTOS = ['uid', 'n', 'categorizacion', 'responsable', 'responsable_correo'];
async function vistaPublica(folio) {
  const s = await getOne(ref(COL.sol, folio));
  if (!s) throw fallo('No encontramos la solicitud ' + folio + '.');
  const out = {};
  Object.keys(s).forEach((k) => { if (!OCULTOS.includes(k)) out[k] = s[k]; });
  out.tipo_nombre = movimientoNombre(s);
  out.producto = productoNombre(s);
  out.prioridad = prioridad(s.prioridad);
  out.seguimiento = (await getAll(fb.query(col(COL.sol, folio, 'seguimiento'), fb.where('visible', '==', true))))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map((m) => ({ fecha: m.fecha, autor: m.autor, estado: m.estado, mensaje: m.mensaje }));
  out.archivos = await archivosDe(folio);
  return out;
}
export async function consultarSolicitud(folio) {
  if (!auth.currentUser) throw sesionError('Entra con tu correo y tu clave.');
  try { return await vistaPublica(String(folio || '').trim().toUpperCase()); }
  catch (e) { if (e.code === 'permission-denied') throw fallo('Esta solicitud no está registrada con tu correo.'); throw e; }
}

const diaTexto = (ymd) => (esFecha(ymd) ? ymd.slice(8, 10) + '/' + ymd.slice(5, 7) + '/' + ymd.slice(0, 4) : '');
function fechasTexto(s) {
  const entrega = ['envio', 'entrega_recoleccion', 'mercadotecnia'].includes(s.tipo) ? 'Fecha de entrega' : 'Fecha requerida';
  const out = [[entrega, s.fecha_abierta === 'Sí' ? 'Fecha abierta' : diaTexto(s.fecha_requerida)]];
  if (s.recoleccion === 'Sí') out.push(['Fecha de recolección', s.recoleccion_abierta === 'Sí' ? 'Fecha abierta' : diaTexto(s.fecha_recoleccion)]);
  else if (s.recoleccion === 'No') out.push(['Recolección', 'No requiere recolección']);
  return out.filter((x) => x[1]);
}
const costoTexto = (s) => (s.costo_absorbe ? s.costo_absorbe + (s.costo_detalle ? ': ' + s.costo_detalle : '') : '');

/* Crea la solicitud. Sin sesión, crea el acceso de quien solicita (correo + clave) como en proveedores. */
export async function crearSolicitud(datos, cuenta) {
  datos = datos || {};
  const d = {};
  C.CAMPOS.forEach((c) => { d[c[0]] = datos[c[0]]; });
  const marcados = [].concat(datos.dev_checklist || []).filter((x) => C.CHECKLIST_DEVOLUCION.includes(x));
  d.dev_checklist = d.tipo === 'devolucion' ? marcados.join('\n') : '';
  if (d.tipo !== 'devolucion') d.dev_motivo = '';
  if (auth.currentUser) d.correo = auth.currentUser.email;
  const arts = articulos(datos.articulos);
  const paq = paquetes(String(d.forma_envio || '').trim() === C.PAQUETERIA ? datos.paquetes : []);
  if (String(d.forma_envio || '').trim() === C.PAQUETERIA && !paq.total) throw fallo('Agrega al menos un paquete con cantidad, medidas y peso.');
  const errores = validar(d);
  if (Object.keys(errores).length) throw fallo('Revisa los campos marcados: ' + Object.keys(errores).map((k) => C.CAMPOS.find((c) => c[0] === k)[1]).join(', ') + '.');
  d.correo = d.correo.toLowerCase();
  const fuera = fueraDeTiempo(d.fecha_requerida);

  let claveNueva = '';
  if (!auth.currentUser) {
    const tecleada = String((cuenta && cuenta.clave) || '').trim();
    if (tecleada) await entrarSolicitante(d.correo, tecleada);
    else {
      claveNueva = nuevaClave();
      try { await fb.createUserWithEmailAndPassword(auth, d.correo, claveNueva); }
      catch (e) {
        if (e.code === 'auth/email-already-in-use') { const x = fallo('Este correo ya tiene acceso. Escribe tu clave (o tu contraseña del panel) para enviar la solicitud.'); x.cuentaExiste = true; throw x; }
        throw e;
      }
    }
  }
  const uid = auth.currentUser.uid, t = ahora();
  let folio = '';
  await fb.runTransaction(db, async (tx) => {
    const cref = ref(COL.config, 'folio'), cs = await tx.get(cref);
    const n = (cs.exists() ? Number(cs.data().n) || 0 : 0) + 1;
    folio = 'SOL-' + String(n).padStart(4, '0');
    if (cs.exists()) tx.update(cref, { n, ultimo: folio }); else tx.set(cref, { n, ultimo: folio });
    tx.set(ref(COL.sol, folio), Object.assign({}, d, { folio, n, uid, estado: 'recibida', creada: t, actualizada: t, cerrada: '',
      dev_cumple: d.tipo === 'devolucion' ? (marcados.length === C.CHECKLIST_DEVOLUCION.length ? 'Sí' : 'No') : '',
      paquetes: paq.texto, paq_total: paq.total ? String(paq.total) : '', paq_peso_kg: paq.total ? String(paq.peso) : '', paq_vol_kg: paq.total ? String(paq.vol) : '',
      articulos: arts, fuera_tiempo: fuera ? 'Sí' : '', aut_estado: fuera ? C.AUT_PENDIENTE : '' }));
    tx.set(ref(COL.sol, folio, 'seguimiento', nuevoId()), { fecha: t, autor: d.solicitante, autor_tipo: 'solicitante', visible: true, estado: 'recibida', mensaje: 'Solicitud creada.' });
  });
  const sol = await getOne(ref(COL.sol, folio));
  const fechas = fechasTexto(sol);
  await enviarCorreo({ plantilla: 'solicitante', folio, para: d.correo, asunto: 'Solicitud ' + folio + ' recibida · ' + movimientoNombre(sol),
    titulo: 'Recibimos tu solicitud', parrafos: ['Hola ' + d.solicitante + ', Logística ya tiene tu solicitud de ' + movimientoNombre(sol).toLowerCase() + '. Te avisaremos por este medio cada avance.']
      .concat(fuera ? ['Importante: tu solicitud se hizo con menos de 48 horas de anticipación. Podrán aplicarse sobrecostos y se requiere la autorización del Gerente de Área (' + sol.aut_gerente + ').'] : []),
    datos: [['Folio', folio]].concat(claveNueva ? [['Tu correo de acceso', d.correo], ['Tu clave', claveNueva]] : [])
      .concat([['Producto', productoNombre(sol)], ['Movimiento', movimientoNombre(sol)]], fechas,
        [['Ruta', d.origen_ciudad + ' → ' + d.destino_ciudad], ['Forma de envío', d.forma_envio]]),
    boton: { texto: 'Ver mis solicitudes', url: urlPortal() },
    nota: claveNueva ? 'Con tu correo y esta clave consultas todas tus solicitudes. Si la pierdes, en el portal elige «Olvidé mi clave».' : '' });
  await enviarCorreo({ plantilla: 'interno', folio, para: await avisos(), etiqueta: sol.prioridad === 'Urgente' ? 'URGENTE' : 'NUEVA SOLICITUD',
    asunto: (sol.prioridad === 'Urgente' ? 'URGENTE · ' : '') + 'Nueva solicitud ' + folio + ' · ' + productoNombre(sol) + ' · ' + movimientoNombre(sol),
    titulo: productoNombre(sol) + ' · ' + movimientoNombre(sol), parrafos: [sol.solicitante + ' (' + sol.area + ') registró una solicitud.', 'Descripción: ' + sol.motivo]
      .concat(fuera ? ['Menos de 48 horas de anticipación: puede aplicar sobrecosto. Autorización del Gerente de Área (' + sol.aut_gerente + ') pendiente.'] : []),
    datos: [['Tipo de solicitud', sol.prioridad], ['Artículos', articulosTexto(sol)], ['Costo', costoTexto(sol)]].concat(fechas, [['Forma de envío', sol.forma_envio]],
      [['Ruta', sol.origen_nombre + ', ' + sol.origen_ciudad + ' → ' + sol.destino_nombre + ', ' + sol.destino_ciudad]])
      .concat(sol.paq_total ? [['Paquetes', sol.paq_total + ' · ' + sol.paq_peso_kg + ' kg (volumétrico ' + sol.paq_vol_kg + ' kg)\n' + sol.paquetes]] : [])
      .concat(sol.horario === 'Sí' ? [['Cita', 'Se requiere cita para entregar o recoger']] : [])
      .concat(sol.tipo === 'devolucion' ? [['Devolución', sol.dev_motivo + ' · ' + (sol.dev_cumple === 'Sí' ? 'cumple todos los puntos' : 'NO cumple todos los puntos: revisar')]] : []),
    boton: { texto: 'Abrir en el panel', url: urlPanel(folio) } });
  return { folio, clave: claveNueva, solicitud: await vistaPublica(folio) };
}

/* Archivos: se guardan en Firestore por partes (como los expedientes de proveedores). */
async function guardarArchivo(folio, archivo, autor) {
  if (!archivo || !archivo.base64 || !archivo.nombre) throw fallo('Selecciona un archivo válido.');
  if (Number(archivo.tamano) > MAX_MB * 1048576) throw fallo('El archivo supera ' + MAX_MB + ' MB.');
  const id = nuevoId(), b64 = archivo.base64, partes = Math.max(1, Math.ceil(b64.length / CHUNK));
  for (let i = 0; i < partes; i++) await fb.setDoc(ref(COL.sol, folio, 'archivos', id, 'partes', String(i).padStart(3, '0')), { d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
  const nombre = String(archivo.nombre).replace(/[^\wÁÉÍÓÚÜÑáéíóúüñ .()-]/g, '_').slice(0, 140);
  await fb.setDoc(ref(COL.sol, folio, 'archivos', id), { fecha: ahora(), autor, nombre, mime: archivo.mime || 'application/octet-stream',
    tamano: Number(archivo.tamano) || 0, partes, evidencia: archivo.clase === 'evidencia', clase: ['evidencia', 'cotizacion'].includes(archivo.clase) ? archivo.clase : '' });
}
export async function subirArchivo(folio, archivo) {
  const s = await consultarSolicitud(folio);
  if (!C.ABIERTOS.includes(s.estado)) throw fallo('La solicitud ya está cerrada.');
  await guardarArchivo(s.folio, archivo, s.solicitante);
  return vistaPublica(s.folio);
}
/* Contenido de un archivo como data URL (para verlo o descargarlo). */
export async function archivo(folio, id) {
  const meta = await getOne(ref(COL.sol, folio, 'archivos', id));
  if (!meta) throw fallo('No encontramos el archivo.');
  const partes = (await getAll(col(COL.sol, folio, 'archivos', id, 'partes'))).sort((a, b) => a.id.localeCompare(b.id));
  return { nombre: meta.nombre, mime: meta.mime, dataUrl: 'data:' + meta.mime + ';base64,' + partes.map((p) => p.d).join('') };
}

async function avisarLogistica(s, asunto, texto) {
  const para = correoOk(s.responsable_correo) ? [s.responsable_correo] : await avisos();
  await enviarCorreo({ plantilla: 'interno', folio: s.folio, para, etiqueta: 'MENSAJE', asunto, titulo: asunto, parrafos: [texto],
    boton: { texto: 'Abrir en el panel', url: urlPanel(s.folio) } });
}
export async function agregarMensaje(folio, texto) {
  const s = await consultarSolicitud(folio);
  texto = String(texto || '').trim().slice(0, 2000);
  if (!texto) throw fallo('Escribe un mensaje.');
  if (!C.ABIERTOS.includes(s.estado)) throw fallo('La solicitud ya está cerrada.');
  const t = ahora(), estado = s.estado === 'informacion' ? 'en_revision' : s.estado, b = fb.writeBatch(db);
  b.update(ref(COL.sol, s.folio), { estado, actualizada: t });
  b.set(ref(COL.sol, s.folio, 'seguimiento', nuevoId()), { fecha: t, autor: s.solicitante, autor_tipo: 'solicitante', visible: true, estado, mensaje: texto });
  await b.commit();
  const full = await getOne(ref(COL.sol, s.folio));
  await avisarLogistica(full, s.solicitante + ' escribió en ' + s.folio, texto);
  return vistaPublica(s.folio);
}
export async function cancelarSolicitud(folio, motivo) {
  const s = await consultarSolicitud(folio);
  if (!C.CANCELABLES.includes(s.estado)) throw fallo('Esta solicitud ya no se puede cancelar desde aquí. Escribe a Logística.');
  motivo = String(motivo || '').trim().slice(0, 500) || 'Sin motivo.';
  const t = ahora(), b = fb.writeBatch(db);
  b.update(ref(COL.sol, s.folio), { estado: 'cancelada', cerrada: t, actualizada: t });
  b.set(ref(COL.sol, s.folio, 'seguimiento', nuevoId()), { fecha: t, autor: s.solicitante, autor_tipo: 'solicitante', visible: true, estado: 'cancelada',
    mensaje: 'Cancelada por quien solicitó. Motivo: ' + motivo });
  await b.commit();
  const full = await getOne(ref(COL.sol, s.folio));
  await avisarLogistica(full, 'Solicitud ' + s.folio + ' cancelada', motivo);
  return vistaPublica(s.folio);
}

/* ------------------------------------------------------------------ panel: Logística */
let yoCache = null;
const claveOk = (p) => String(p || '').length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
const CLAVE_MSG = 'La contraseña debe tener al menos 10 caracteres, con letras y números.';
function publico(u) {
  return { usuario: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol, activo: u.activo !== false, debe_cambiar: !!u.cambiar_clave,
    ultimo_acceso: u.ultimo_acceso || '', pendiente: !!u.pendiente };
}
async function yo() {
  const u = auth.currentUser;
  if (!u) return null;
  let a = await getOne(ref(COL.admins, u.uid)).catch(() => null);
  if (!a) {
    // Invitación: alguien que ya tenía cuenta (por ejemplo, del panel de proveedores) entra con su misma contraseña.
    const inv = await getOne(ref(COL.inv, String(u.email || '').toLowerCase())).catch(() => null);
    if (inv) {
      const t = ahora();
      await fb.setDoc(ref(COL.admins, u.uid), { nombre: inv.nombre, correo: u.email.toLowerCase(), rol: inv.rol === 'admin' ? 'admin' : 'operador', activo: true,
        cambiar_clave: false, creado_en: t, ultimo_acceso: t, invitacion: u.email.toLowerCase() });
      await fb.deleteDoc(ref(COL.inv, u.email.toLowerCase())).catch(() => null);
      a = await getOne(ref(COL.admins, u.uid));
    }
  }
  if (!a || a.activo === false) return null;
  yoCache = a;
  return a;
}
async function sesionPanel(lista) {
  const a = await yo();
  if (!a) throw sesionError();
  if (lista && a.cambiar_clave) throw fallo('Cambia tu contraseña temporal antes de continuar.');
  return a;
}
function soloAdmin(a) { if (a.rol !== 'admin') throw fallo('Solo un administrador puede hacer esto.'); }
async function equipo() {
  return (await getAll(col(COL.admins))).filter((x) => x.activo !== false).map((x) => ({ usuario: x.id, nombre: x.nombre, correo: x.correo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function adminEstado() {
  const inicio = await getOne(ref(COL.config, 'inicio')).catch(() => null);
  return { tieneAdmin: !!inicio };
}
export async function adminPrimer({ nombre, correo, clave }) {
  correo = String(correo || '').trim().toLowerCase(); nombre = String(nombre || '').trim();
  if (!nombre || !correoOk(correo)) throw fallo('Escribe tu nombre y un correo válido.');
  if (!claveOk(clave)) throw fallo(CLAVE_MSG);
  if ((await adminEstado()).tieneAdmin) throw fallo('El panel ya tiene administrador. Inicia sesión.');
  let cred;
  try { cred = await fb.createUserWithEmailAndPassword(auth, correo, clave); }
  catch (e) { if (e.code !== 'auth/email-already-in-use') throw e; cred = await fb.signInWithEmailAndPassword(auth, correo, clave); }
  const t = ahora(), b = fb.writeBatch(db);
  b.set(ref(COL.admins, cred.user.uid), { nombre, correo, rol: 'admin', activo: true, cambiar_clave: false, creado_en: t, ultimo_acceso: t });
  b.set(ref(COL.config, 'inicio'), { creado_en: t, por: cred.user.uid });
  b.set(ref(COL.config, 'avisos'), { correos: [correo] });
  await b.commit();
  return { token: 'firebase', usuario: publico(await yo()) };
}
export async function adminEntrar(correo, clave) {
  correo = String(correo || '').trim().toLowerCase();
  if (!correoOk(correo) || !clave) throw fallo('Escribe tu correo y tu contraseña.');
  try { await fb.signInWithEmailAndPassword(auth, correo, clave); }
  catch (e) { if (['auth/too-many-requests', 'auth/operation-not-allowed', 'auth/network-request-failed'].includes(e.code)) throw e; throw fallo('Correo o contraseña incorrectos.'); }
  const a = await yo();
  if (!a) { await fb.signOut(auth).catch(() => null); throw fallo('Esta cuenta no tiene acceso al panel de solicitudes. Pide a un administrador que te dé de alta.'); }
  await fb.updateDoc(ref(COL.admins, a.id), { ultimo_acceso: ahora() }).catch(() => null);
  return { token: 'firebase', usuario: publico(a) };
}
export async function adminRecuperar(correo) {
  correo = String(correo || '').trim().toLowerCase();
  if (correoOk(correo)) { try { await fb.sendPasswordResetEmail(auth, correo, { url: urlPanel() }); } catch (e) { /* respuesta genérica */ } }
  return 'Si el correo tiene acceso, recibirá un enlace para crear una nueva contraseña.';
}
export async function adminSalir() { yoCache = null; await fb.signOut(auth); return true; }
export async function adminYo() { return publico(await sesionPanel(false)); }
export async function adminCambiarPassword(_t, actual, nueva) {
  await sesionPanel(false);
  if (!claveOk(nueva)) throw fallo(CLAVE_MSG);
  try { await fb.reauthenticateWithCredential(auth.currentUser, fb.EmailAuthProvider.credential(auth.currentUser.email, actual)); }
  catch (e) { throw fallo('La contraseña actual no es correcta.'); }
  await fb.updatePassword(auth.currentUser, nueva);
  await fb.updateDoc(ref(COL.admins, auth.currentUser.uid), { cambiar_clave: false });
  return publico(await yo());
}

export async function adminDatos() {
  const a = await sesionPanel(true);
  const lista = (await getAll(col(COL.sol))).map((s) => ({ folio: s.folio, creada: s.creada, actualizada: s.actualizada, estado: s.estado,
    prioridad: prioridad(s.prioridad), tipo: s.tipo, tipo_nombre: movimientoNombre(s), producto: productoNombre(s), articulos: articulosTexto(s),
    costo: costoTexto(s), fecha_requerida: s.fecha_requerida || '', fecha_abierta: s.fecha_abierta || '', recoleccion: s.recoleccion || '',
    fecha_recoleccion: s.fecha_recoleccion || '', recoleccion_abierta: s.recoleccion_abierta || '', fuera_tiempo: s.fuera_tiempo || '',
    aut_estado: s.aut_estado || '', aut_gerente: s.aut_gerente || '', area: s.area, solicitante: s.solicitante, correo: s.correo, cliente: s.cliente, referencia: s.referencia, cita: s.horario || '',
    origen: s.origen_nombre + ', ' + s.origen_ciudad, destino: s.destino_nombre + ', ' + s.destino_ciudad, dev_motivo: s.dev_motivo || '',
    dev_cumple: s.dev_cumple || '', forma_envio: s.forma_envio || '', paq_total: s.paq_total || '', paq_peso_kg: s.paq_peso_kg || '',
    folio_cstext: s.folio_cstext || '', categorizacion: s.categorizacion || '', responsable: s.responsable || '', transportista: s.transportista || '',
    unidad_asignada: s.unidad_asignada || '', guia: s.guia || '', fecha_programada: s.fecha_programada || '' }))
    .sort((x, y) => String(y.creada).localeCompare(String(x.creada)));
  return { yo: publico(a), solicitudes: lista, usuarios: await equipo(), categorias: C.CATEGORIAS, transportistas: C.TRANSPORTISTAS, tipos_unidad: C.TIPOS_UNIDAD,
    aut_estados: C.AUT_ESTADOS };
}

export async function adminDetalle(_t, folio) {
  await sesionPanel(true);
  folio = String(folio || '').trim().toUpperCase();
  const s = await getOne(ref(COL.sol, folio));
  if (!s) throw fallo('No existe la solicitud ' + folio + '.');
  const interno = await getOne(ref(COL.sol, folio, 'interno', 'datos')).catch(() => null);
  const out = Object.assign({}, s, { notas_internas: (interno && interno.notas_internas) || '', tipo_nombre: movimientoNombre(s),
    producto: productoNombre(s), prioridad: prioridad(s.prioridad) });
  out.seguimiento = (await getAll(col(COL.sol, folio, 'seguimiento'))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((m) => ({ fecha: m.fecha, autor: m.autor, visible: m.visible !== false, estado: m.estado, mensaje: m.mensaje }));
  out.archivos = await archivosDe(folio);
  out.correos = (await getAll(donde(COL.correos, 'folio', folio))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((c) => ({ fecha: c.fecha, para: c.para, asunto: c.asunto, estado: c.estado, error: c.error, medio: c.medio }));
  return out;
}

/* cambios: {estado, mensaje, visible, notificar} y los campos de Logística. */
export async function adminActualizar(_t, folio, cambios) {
  const a = await sesionPanel(true);
  cambios = cambios || {};
  const s = await getOne(ref(COL.sol, folio));
  if (!s) throw fallo('No existe la solicitud ' + folio + '.');
  const antes = s.estado, mensaje = String(cambios.mensaje || '').trim().slice(0, 2000);
  if (cambios.estado && !C.ESTADOS[cambios.estado]) throw fallo('Estado no válido.');
  if (cambios.estado === 'informacion' && cambios.estado !== antes && !mensaje) throw fallo('Escribe qué información falta.');
  if ((cambios.estado === 'rechazada' || cambios.estado === 'cancelada') && cambios.estado !== antes && !mensaje) throw fallo('Escribe el motivo.');
  const team = await equipo();
  if (cambios.responsable && !team.some((x) => x.usuario === cambios.responsable)) throw fallo('Responsable no válido.');
  ['fecha_programada', 'fecha_requerida', 'fecha_recoleccion', 'aut_fecha'].forEach((k) => {
    if (cambios[k] && !esFecha(cambios[k])) throw fallo('Fecha no válida.');
  });
  if (cambios.aut_estado && !C.AUT_ESTADOS.includes(cambios.aut_estado)) throw fallo('Estatus de autorización no válido.');
  /* Sin autorización del Gerente de Área no avanza a programada, en tránsito ni completada. */
  const aut = cambios.aut_estado !== undefined ? cambios.aut_estado : s.aut_estado;
  if (aut && aut !== 'Autorizado' && ['programada', 'en_transito', 'completada'].includes(cambios.estado) && cambios.estado !== s.estado) {
    throw fallo('Esta solicitud requiere la autorización del Gerente de Área. Regístrala como «Autorizado» antes de programarla.');
  }
  if (cambios.categorizacion && !C.CATEGORIAS.includes(cambios.categorizacion)) throw fallo('Categorización no válida.');
  if (cambios.folio_cstext) {
    cambios.folio_cstext = String(cambios.folio_cstext).trim().toUpperCase().replace(/^(\d+)$/, 'CSTEXT$1');
    const otro = (await getAll(donde(COL.sol, 'folio_cstext', cambios.folio_cstext))).find((x) => x.folio !== folio);
    if (otro) throw fallo('El folio ' + cambios.folio_cstext + ' ya está en la solicitud ' + otro.folio + '.');
  }
  const t = ahora(), patch = { actualizada: t };
  ['folio_cstext', 'categorizacion', 'transportista', 'unidad_asignada', 'guia', 'fecha_programada', 'aut_gerente', 'aut_comentario'].forEach((k) => {
    if (cambios[k] !== undefined) patch[k] = String(cambios[k]).trim().slice(0, k === 'aut_comentario' ? 1000 : 160);
  });
  /* Asignar la fecha a una solicitud con «Fecha abierta» sin crear una nueva. */
  if (cambios.fecha_requerida) { patch.fecha_requerida = cambios.fecha_requerida; patch.fecha_abierta = ''; }
  if (cambios.fecha_recoleccion && s.recoleccion === 'Sí') { patch.fecha_recoleccion = cambios.fecha_recoleccion; patch.recoleccion_abierta = ''; }
  if (cambios.aut_estado !== undefined && s.aut_estado && cambios.aut_estado !== s.aut_estado) {
    patch.aut_estado = cambios.aut_estado;
    patch.aut_fecha = cambios.aut_estado === C.AUT_PENDIENTE ? '' : (cambios.aut_fecha || hoy());
    patch.aut_registro = a.nombre;
  } else if (cambios.aut_fecha && s.aut_estado) patch.aut_fecha = cambios.aut_fecha;
  if (cambios.responsable !== undefined) {
    const r = team.find((x) => x.usuario === cambios.responsable);
    patch.responsable = r ? r.usuario : ''; patch.responsable_nombre = r ? r.nombre : ''; patch.responsable_correo = r ? r.correo : '';
  }
  const estado = cambios.estado || antes;
  patch.estado = estado;
  patch.cerrada = C.ABIERTOS.includes(estado) ? '' : (s.cerrada || t);
  const b = fb.writeBatch(db);
  b.update(ref(COL.sol, folio), patch);
  if (cambios.notas_internas !== undefined) b.set(ref(COL.sol, folio, 'interno', 'datos'), { notas_internas: String(cambios.notas_internas).slice(0, 2000), actualizado: t });
  const autCambio = patch.aut_estado !== undefined;
  const autTexto = autCambio ? 'Autorización del Gerente de Área: ' + patch.aut_estado + '.' : '';
  if (estado !== antes || mensaje) {
    b.set(ref(COL.sol, folio, 'seguimiento', nuevoId()), { fecha: t, autor: a.nombre + ' (Logística)', autor_tipo: 'logistica',
      visible: cambios.visible !== false, estado, mensaje: mensaje || ('Estado: ' + C.ESTADOS[estado] + '.') });
  }
  if (autCambio) {
    b.set(ref(COL.sol, folio, 'seguimiento', nuevoId()), { fecha: t, autor: a.nombre + ' (Logística)', autor_tipo: 'logistica',
      visible: true, estado, mensaje: autTexto + (patch.aut_comentario ? '\n' + patch.aut_comentario : '') });
  }
  await b.commit();
  const n = Object.assign({}, s, patch);
  const paraSolicitante = cambios.visible !== false;
  if ((((estado !== antes || mensaje) && paraSolicitante) || autCambio) && cambios.notificar !== false) {
    const datos = [['Estado', C.ESTADOS[estado]]].concat(autCambio ? [['Autorización del Gerente', patch.aut_estado]] : []);
    if (n.fecha_programada && ['programada', 'en_transito'].includes(estado)) {
      datos.push(['Fecha programada', diaTexto(n.fecha_programada)]);
      if (n.transportista) datos.push(['Transportista', n.transportista]);
      if (n.guia) datos.push(['Guía', n.guia]);
    }
    await enviarCorreo({ plantilla: 'solicitante', folio, para: s.correo, asunto: folio + ' · ' + C.ESTADOS[estado],
      titulo: 'Tu solicitud está: ' + C.ESTADOS[estado],
      parrafos: ['Hola ' + s.solicitante + ', hay un avance en tu solicitud de ' + movimientoNombre(s).toLowerCase() + '.']
        .concat(mensaje && paraSolicitante ? ['Mensaje de Logística: ' + mensaje] : [])
        .concat(estado === 'informacion' ? ['Responde desde el portal para continuar.'] : []),
      datos, boton: { texto: 'Ver mi solicitud', url: urlPortal() } });
  }
  return adminDetalle(null, folio);
}

export async function adminSubirArchivo(_t, folio, arch) {
  const a = await sesionPanel(true);
  if (!(await getOne(ref(COL.sol, folio)))) throw fallo('No existe la solicitud ' + folio + '.');
  await guardarArchivo(folio, arch, a.nombre + ' (Logística)');
  return adminDetalle(null, folio);
}

export async function adminConfig() {
  const a = await sesionPanel(true);
  const av = await getOne(ref(COL.config, 'avisos')).catch(() => null);
  let usuarios = [];
  if (a.rol === 'admin') {
    usuarios = (await getAll(col(COL.admins))).map(publico)
      .concat((await getAll(col(COL.inv))).map((i) => ({ usuario: '', nombre: i.nombre, correo: i.id, rol: i.rol, activo: true, pendiente: true, ultimo_acceso: '' })));
  }
  return { avisos: ((av && av.correos) || []).join(', '), usuarios, version: VERSION, url: urlPortal(), panel: urlPanel() };
}
export async function adminGuardarAvisos(_t, texto) {
  soloAdmin(await sesionPanel(true));
  const lista = String(texto || '').split(/[\s,;]+/).filter(Boolean).map((x) => x.toLowerCase());
  const malos = lista.filter((c) => !correoOk(c));
  if (malos.length) throw fallo('Correos no válidos: ' + malos.join(', '));
  await fb.setDoc(ref(COL.config, 'avisos'), { correos: lista });
  return lista.join(', ');
}
/* Alta o edición de personal del panel. Si el correo ya tiene cuenta (por ejemplo, del panel de proveedores),
   queda invitado y entra con su misma contraseña. */
export async function adminGuardarUsuario(_t, datos) {
  const a = await sesionPanel(true);
  soloAdmin(a);
  datos = datos || {};
  const nombre = String(datos.nombre || '').trim(), correo = String(datos.correo || '').trim().toLowerCase();
  const rol = datos.rol === 'admin' ? 'admin' : 'operador';
  if (!nombre) throw fallo('Escribe el nombre.');
  if (datos.usuario) {
    if (datos.usuario === a.id && (datos.activo === false || rol !== 'admin')) throw fallo('No puedes quitarte el rol ni desactivarte.');
    await fb.updateDoc(ref(COL.admins, datos.usuario), { nombre, rol, activo: datos.activo !== false });
    if (datos.restablecer) await adminRecuperar(correo);
    return (await adminConfig()).usuarios;
  }
  if (!correoOk(correo)) throw fallo('Escribe un correo válido.');
  if (!claveOk(datos.password)) throw fallo('Contraseña temporal: ' + CLAVE_MSG.charAt(0).toLowerCase() + CLAVE_MSG.slice(1));
  const app2 = fb.initializeApp(CFG.firebase, 'alta-' + Date.now()), a2 = fb.getAuth(app2);
  emular(a2, null);
  let uid = '';
  try { uid = (await fb.createUserWithEmailAndPassword(a2, correo, datos.password)).user.uid; }
  catch (e) { if (e.code !== 'auth/email-already-in-use') throw e; }
  finally { await fb.signOut(a2).catch(() => null); }
  const t = ahora();
  if (uid) await fb.setDoc(ref(COL.admins, uid), { nombre, correo, rol, activo: true, cambiar_clave: true, creado_en: t, ultimo_acceso: '' });
  else await fb.setDoc(ref(COL.inv, correo), { nombre, rol, creado_en: t, por: a.id });
  return (await adminConfig()).usuarios;
}
