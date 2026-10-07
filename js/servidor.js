/* Plataforma de solicitudes de movimientos · CESANTONI Somos Logística (versión web).
 * Lo que en la versión de Apps Script hacía Code.gs, aquí sobre Firebase (Authentication + Firestore).
 * Colecciones propias con prefijo sm_: no comparten datos con la plataforma de proveedores (pv_).
 * La seguridad real la imponen las reglas de Firestore (firestore.rules, bloque «Solicitudes de movimientos»).
 */
import * as fb from './firebase-sdk.js?v=13';
import * as C from './catalogos.js?v=12';

const CFG = window.CP_CONFIG || {};
const COL = { config: 'sm_config', admins: 'sm_admins', inv: 'sm_invitaciones', sol: 'sm_solicitudes', correos: 'sm_correos', aut: 'sm_autorizaciones' };
const ZONA = 'America/Mexico_City';
const MAX_MB = 5;
const CHUNK = 700000;
const VERSION = '1.0-web';

let auth = null, db = null;
/* Catálogos vigentes: los de catalogos.js, o los que el administrador editó en sm_config/catalogos. */
let CAT = { areas: C.AREAS, productos: C.PRODUCTOS, tipos: C.TIPOS };
function aplicarCatalogos(c) {
  c = c || {};
  const productos = [].concat(c.productos || []).filter((x) => x && x !== 'Otro');
  const tipos = [].concat(c.tipos || []).filter((t) => t && t.clave && t.nombre);
  CAT = {
    areas: (c.areas || []).length ? c.areas.slice() : C.AREAS,
    productos: productos.length ? productos.map((x) => [x, '']).concat([['Otro', '']]) : C.PRODUCTOS,
    tipos: tipos.length ? tipos.map((t) => [t.clave, t.nombre, t.descripcion || '']) : C.TIPOS
  };
}
async function cargarCatalogos() { try { aplicarCatalogos(await getOne(ref(COL.config, 'catalogos'))); } catch (e) { /* se quedan los de catalogos.js */ } }

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
  return new Promise((ok) => { const off = fb.onAuthStateChanged(auth, () => { off(); ok(true); }); }).then(cargarCatalogos).then(() => true);
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
const tipoNombre = (k) => { const t = CAT.tipos.concat(C.TIPOS).find((x) => x[0] === k); return t ? t[1] : k; };
/* «Normal» es el nombre anterior de «Programado». */
const prioridad = (p) => (p === 'Normal' ? 'Programado' : p || '');
const esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
function sumarDias(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* Menos de 48 horas de anticipación: la fecha requerida cae antes de pasado mañana (se calcula por día, sin horas). */
const fueraDeTiempo = (fecha) => esFecha(fecha) && fecha < sumarDias(hoy(), C.DIAS_ANTICIPACION);
const productoNombre = (s) => (s.producto_tipo === 'Otro' ? s.producto_otro || 'Otro' : s.producto_tipo || '');
const movimientoNombre = (s) => (s.tipo === 'otro' && s.tipo_otro ? 'Otro: ' + s.tipo_otro : tipoNombre(s.tipo));
/* Un renglón de especificaciones: «10 × Caja de producto · 60 × 40 × 35 cm · 12 kg c/u (120 kg)». */
function lineaArticulo(a) {
  const n = Number(a.cantidad) || 0, kg = Number(a.peso) || 0, r = (x) => Math.round(x * 10) / 10;
  return a.cantidad + ' × ' + (a.producto ? a.producto + (a.descripcion ? ' · ' + a.descripcion : '') : a.descripcion) +
    (a.largo ? ' · ' + a.largo + ' × ' + a.ancho + ' × ' + a.alto + ' cm' : '') +
    (kg ? ' · ' + kg + ' kg c/u' + (n > 1 ? ' (' + r(n * kg) + ' kg)' : '') : '');
}
const articulosTexto = (s) => [].concat(s.articulos || []).map(lineaArticulo).join('\n');
const lugarTexto = (s, pre) => (s[pre + '_nombre'] ? s[pre + '_nombre'] + (s[pre + '_ciudad'] ? ', ' + s[pre + '_ciudad'] : '') : s[pre + '_direccion'] || '');
const servicioNombre = (f) => (f === 'Camión / unidad' ? 'Unidad dedicada' : f || '');
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
    ((c.botones || []).length ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px"><tr>' + c.botones.map((b) =>
      '<td style="border-radius:8px;background:' + esc(b.color || '#B45309') + '"><a href="' + esc(b.url) + '" style="display:inline-block;padding:13px 24px;color:#fff;text-decoration:none;font-weight:700;font-size:15px">' +
      esc(b.texto) + '</a></td><td style="width:12px"></td>').join('') + '</tr></table>' : '') +
    (c.nota ? '<p style="margin:14px 0 0;font-size:12.5px;color:#5F666C">' + esc(c.nota) + '</p>' : '') +
    '</td></tr><tr><td style="padding:12px 26px;background:#FAF8F5;font-size:12px;color:#5F666C">CESANTONI | Somos Logística · Solicitudes de movimientos · mensaje automático</td></tr></table></div>';
}
function textoPlano(c) {
  const l = [c.titulo, c.folio ? 'Folio: ' + c.folio : '', ''].concat(c.parrafos || []);
  (c.datos || []).forEach((r) => l.push(r[0] + ': ' + r[1]));
  if (c.boton) l.push('', c.boton.texto + ': ' + c.boton.url);
  (c.botones || []).forEach((b, i) => { if (!i) l.push(''); l.push(b.texto + ': ' + b.url); });
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
/* Correos que reciben una alerta. Cada persona elige sus alertas en Configuración; sin personas, se usa la lista general. */
async function avisos(tipo) {
  try {
    const d = (await getOne(ref(COL.config, 'avisos'))) || {};
    if ((d.personas || []).length) return d.personas.filter((x) => correoOk(x.correo) && (x.alertas || []).includes(tipo)).map((x) => x.correo);
    return (d.correos || []).filter(correoOk);
  } catch (e) { return []; }
}

/* ------------------------------------------------------------------ validación */
const linkOk = (v) => !v || /^https?:\/\/\S+$/i.test(v);
function validar(d) {
  const errores = {};
  C.CAMPOS.forEach((c) => {
    const v = String(d[c[0]] === undefined || d[c[0]] === null ? '' : d[c[0]]).trim();
    d[c[0]] = v;
    if (c[2] && !v) errores[c[0]] = 'Obligatorio.';
    else if (v.length > c[3]) errores[c[0]] = 'Máximo ' + c[3] + ' caracteres.';
  });
  if (d.correo && !correoOk(d.correo)) errores.correo = 'Escribe un correo válido.';
  if (d.producto_tipo && !CAT.productos.some((x) => x[0] === d.producto_tipo)) errores.producto_tipo = 'Elige qué envías.';
  if (d.producto_tipo === 'Otro' && !d.producto_otro) errores.producto_otro = 'Obligatorio.';
  if (d.producto_tipo !== 'Otro') d.producto_otro = '';
  if (d.tipo && !CAT.tipos.concat(C.TIPOS).some((t) => t[0] === d.tipo)) errores.tipo = 'Elige un tipo.';
  if (d.tipo === 'otro' && !d.tipo_otro) errores.tipo_otro = 'Obligatorio.';
  if (d.tipo !== 'otro') d.tipo_otro = '';
  if (d.forma_envio && !C.FORMAS_ENVIO.includes(d.forma_envio)) errores.forma_envio = 'Elige el tipo de servicio.';
  if (d.tipo === 'devolucion' && !C.MOTIVOS_DEVOLUCION.includes(d.dev_motivo)) errores.dev_motivo = 'Elige el motivo de la devolución.';
  ['origen_link', 'destino_link'].forEach((k) => { if (!linkOk(d[k])) errores[k] = 'Pega el link completo (empieza con https://).'; });
  if (d.costo_absorbe && !C.COSTOS.includes(d.costo_absorbe)) errores.costo_absorbe = 'Elige quién absorbe el costo.';
  if (d.costo_absorbe === 'Otro' && !d.costo_detalle) errores.costo_detalle = 'Obligatorio.';
  if (d.costo_absorbe !== 'Otro') d.costo_detalle = '';
  d.horario = d.horario === 'Sí' ? 'Sí' : '';
  if (d.acepta_condiciones !== 'Sí') errores.acepta_condiciones = 'Acepta las condiciones para enviar.';
  /* Fechas tentativas: recolección y entrega, o «Fecha abierta». */
  d.fecha_abierta = d.fecha_abierta === 'Sí' ? 'Sí' : '';
  if (d.fecha_abierta) { d.fecha_requerida = ''; d.fecha_entrega = ''; }
  else {
    if (!esFecha(d.fecha_requerida)) errores.fecha_requerida = 'Elige la fecha o marca «Fecha abierta».';
    else if (d.fecha_requerida < hoy()) errores.fecha_requerida = 'La fecha ya pasó.';
    if (!esFecha(d.fecha_entrega)) errores.fecha_entrega = 'Elige la fecha o marca «Fecha abierta».';
    else if (d.fecha_requerida && d.fecha_entrega < d.fecha_requerida) errores.fecha_entrega = 'Debe ser igual o posterior a la recolección.';
  }
  /* Entrega y posterior recolección: fecha en que se recoge de regreso. */
  d.recoleccion = d.tipo === 'entrega_recoleccion' ? 'Sí' : '';
  d.recoleccion_abierta = d.recoleccion && (d.recoleccion_abierta === 'Sí' || d.fecha_abierta) ? 'Sí' : '';
  if (!d.recoleccion || d.recoleccion_abierta) d.fecha_recoleccion = '';
  else if (!esFecha(d.fecha_recoleccion)) errores.fecha_recoleccion = 'Elige la fecha o márcala como abierta.';
  else if (d.fecha_entrega && d.fecha_recoleccion < d.fecha_entrega) errores.fecha_recoleccion = 'Debe ser igual o posterior a la entrega.';
  /* Autorización: si CESANTONI absorbe el costo o si faltan menos de 48 horas. */
  const fuera = fueraDeTiempo(d.fecha_requerida), cesantoni = d.costo_absorbe === C.COSTO_AUTORIZA;
  d.prioridad = fuera ? 'Urgente' : 'Programado';
  d.aut_motivo = [cesantoni ? 'Costo absorbido por CESANTONI' : '', fuera ? 'Solicitud con menos de 48 horas de anticipación' : ''].filter(Boolean).join(' · ');
  if (d.aut_motivo) { if (!correoOk(d.aut_correo)) errores.aut_correo = 'Escribe el correo de quien autoriza.'; else d.aut_correo = d.aut_correo.toLowerCase(); }
  else d.aut_correo = '';
  return errores;
}
/* Especificaciones agrupadas: un renglón por grupo de paquetes o material con las mismas características. */
function especificaciones(lista, paqueteria) {
  lista = [].concat(lista || []).filter((x) => x && ['cantidad', 'largo', 'ancho', 'alto', 'peso', 'descripcion'].some((k) => String(x[k] || '').trim()));
  if (!lista.length) throw fallo('Agrega al menos un grupo con cantidad y descripción.');
  if (lista.length > 30) throw fallo('Máximo 30 grupos por solicitud.');
  const num = (v) => { const t = String(v === undefined || v === null ? '' : v).replace(',', '.').trim(); return t === '' ? NaN : Number(t); };
  let total = 0, peso = 0, vol = 0;
  const filas = lista.map((x, i) => {
    const g = 'Grupo ' + (i + 1) + ': ', n = num(x.cantidad), l = num(x.largo), a = num(x.ancho), h = num(x.alto), kg = num(x.peso);
    const descripcion = String(x.descripcion || '').trim().slice(0, 200);
    if (!(n >= 1 && n <= 99999 && Math.floor(n) === n)) throw fallo(g + 'la cantidad debe ser un número entero mayor a cero.');
    if (!descripcion) throw fallo(g + 'escribe la descripción del material.');
    const conMedidas = !(isNaN(l) && isNaN(a) && isNaN(h));
    if ((paqueteria || conMedidas) && ![l, a, h].every((m) => m > 0 && m <= 2000)) throw fallo(g + 'escribe largo, ancho y alto en centímetros.');
    if ((paqueteria || !isNaN(kg)) && !(kg > 0 && kg <= 30000)) throw fallo(g + 'escribe el peso por pieza en kilos.');
    total += n;
    if (kg > 0) peso += n * kg;
    if (conMedidas) vol += n * l * a * h / C.FACTOR_VOLUMETRICO;
    return Object.assign({ cantidad: String(n), descripcion }, conMedidas ? { largo: String(l), ancho: String(a), alto: String(h) } : {}, kg > 0 ? { peso: String(kg) } : {});
  });
  const r = (x) => Math.round(x * 10) / 10;
  return { filas, texto: filas.map(lineaArticulo).join('\n'), total, peso: r(peso), vol: r(vol) };
}

/* ------------------------------------------------------------------ portal: quien solicita */
export function configPortal() {
  const u = auth && auth.currentUser;
  return { areas: CAT.areas, tipos: CAT.tipos, estados: C.ESTADOS, abiertos: C.ABIERTOS, cancelables: C.CANCELABLES,
    formas_envio: C.FORMAS_ENVIO, paqueteria: C.PAQUETERIA, factor_volumetrico: C.FACTOR_VOLUMETRICO,
    motivos_devolucion: C.MOTIVOS_DEVOLUCION, checklist: C.CHECKLIST_DEVOLUCION, max_mb: MAX_MB, hoy: hoy(),
    limite_programado: sumarDias(hoy(), C.DIAS_ANTICIPACION), productos: CAT.productos, costos: C.COSTOS, costo_autoriza: C.COSTO_AUTORIZA,
    aut_estados: C.AUT_ESTADOS, condiciones: C.CONDICIONES,
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
    tipo_nombre: movimientoNombre(s), producto: productoNombre(s), fecha_requerida: s.fecha_requerida || '', fecha_abierta: s.fecha_abierta || '', origen: lugarTexto(s, 'origen'), destino: lugarTexto(s, 'destino') };
}
export async function misSolicitudes() {
  const u = auth.currentUser;
  if (!u) throw sesionError('Entra con tu correo y tu clave.');
  return (await getAll(donde(COL.sol, 'uid', u.uid))).map(resumen).sort((a, b) => String(b.creada).localeCompare(String(a.creada)));
}

async function archivosDe(folio) {
  return (await getAll(col(COL.sol, folio, 'archivos'))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((a) => ({ id: a.id, fecha: a.fecha, autor: a.autor, nombre: a.nombre, tamano: a.tamano, mime: a.mime, evidencia: !!a.evidencia,
      cotizacion: a.clase === 'cotizacion', clase: a.clase || (a.evidencia ? 'evidencia' : ''),
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
  out.forma_envio = servicioNombre(s.forma_envio);
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
  const abierta = s.fecha_abierta === 'Sí', out = [];
  if (s.fecha_entrega !== undefined) {
    out.push(['Fecha tentativa de recolección', abierta ? 'Fecha abierta' : diaTexto(s.fecha_requerida)],
      ['Fecha tentativa de entrega', abierta ? 'Fecha abierta' : diaTexto(s.fecha_entrega)]);
    if (s.recoleccion === 'Sí') out.push(['Recolección posterior', s.recoleccion_abierta === 'Sí' ? 'Fecha abierta' : diaTexto(s.fecha_recoleccion)]);
  } else {
    out.push([['envio', 'entrega_recoleccion', 'mercadotecnia'].includes(s.tipo) ? 'Fecha de entrega' : 'Fecha requerida', abierta ? 'Fecha abierta' : diaTexto(s.fecha_requerida)]);
    if (s.recoleccion === 'Sí') out.push(['Fecha de recolección', s.recoleccion_abierta === 'Sí' ? 'Fecha abierta' : diaTexto(s.fecha_recoleccion)]);
    else if (s.recoleccion === 'No') out.push(['Recolección', 'No requiere recolección']);
  }
  return out.filter((x) => x[1]);
}
/* Cliente de la plantilla de facturación: quién absorbe el costo (CESANTONI, cliente, proveedor u otro). */
const clienteFactura = (s) => String((s.costo_absorbe === 'Otro' ? s.costo_detalle : s.costo_absorbe) || 'CESANTONI').toUpperCase();
const costoTexto = (s) => (s.costo_absorbe ? s.costo_absorbe + (s.costo_detalle ? ': ' + s.costo_detalle : '') : '');

/* Crea la solicitud. Sin sesión, crea el acceso de quien solicita (correo + clave) como en proveedores. */
/* Valida lo capturado en el formulario (alta o modificación) y calcula lo derivado. */
function prepararDatos(datos) {
  datos = datos || {};
  const d = {};
  C.CAMPOS.forEach((c) => { d[c[0]] = datos[c[0]]; });
  const marcados = [].concat(datos.dev_checklist || []).filter((x) => C.CHECKLIST_DEVOLUCION.includes(x));
  d.dev_checklist = d.tipo === 'devolucion' ? marcados.join('\n') : '';
  if (d.tipo !== 'devolucion') d.dev_motivo = '';
  if (auth.currentUser) d.correo = auth.currentUser.email;
  const esp = especificaciones(datos.especificaciones, String(d.forma_envio || '').trim() === C.PAQUETERIA);
  const errores = validar(d);
  if (Object.keys(errores).length) throw fallo('Revisa los campos marcados: ' + Object.keys(errores).map((k) => C.CAMPOS.find((c) => c[0] === k)[1]).join(', ') + '.');
  d.correo = d.correo.toLowerCase();
  const fuera = fueraDeTiempo(d.fecha_requerida);
  const derivados = { dev_cumple: d.tipo === 'devolucion' ? (marcados.length === C.CHECKLIST_DEVOLUCION.length ? 'Sí' : 'No') : '',
    articulos: esp.filas, paquetes: esp.texto, paq_total: String(esp.total), paq_peso_kg: esp.peso ? String(esp.peso) : '', paq_vol_kg: esp.vol ? String(esp.vol) : '',
    fuera_tiempo: fuera ? 'Sí' : '', aut_estado: d.aut_motivo ? C.AUT_PENDIENTE : '' };
  return { d, fuera, derivados };
}

export async function crearSolicitud(datos, cuenta) {
  const { d, fuera, derivados } = prepararDatos(datos);

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
    tx.set(ref(COL.sol, folio), Object.assign({}, d, derivados, { folio, n, uid, estado: 'recibida', creada: t, actualizada: t, cerrada: '', condiciones_fecha: t }));
    tx.set(ref(COL.sol, folio, 'seguimiento', nuevoId()), { fecha: t, autor: d.solicitante, autor_tipo: 'solicitante', visible: true, estado: 'recibida', mensaje: 'Solicitud creada.' });
  });
  const sol = await getOne(ref(COL.sol, folio));
  const fechas = fechasTexto(sol), ruta = lugarTexto(sol, 'origen') + ' → ' + lugarTexto(sol, 'destino');
  const avisoAut = sol.aut_motivo ? ['Requiere autorización (' + sol.aut_motivo.toLowerCase() + '). Logística enviará la solicitud de autorización a ' + sol.aut_correo + '.'] : [];
  await enviarCorreo({ plantilla: 'solicitante', folio, para: d.correo, asunto: 'Solicitud ' + folio + ' recibida · ' + productoNombre(sol),
    titulo: 'Recibimos tu solicitud', parrafos: ['Hola ' + d.solicitante + ', Logística ya tiene tu solicitud. Te avisaremos por este medio cada avance.']
      .concat(fuera ? ['Importante: tu solicitud se hizo con menos de 48 horas de anticipación. Podrán aplicarse sobrecostos y se requiere la autorización del Gerente de Área.'] : [], avisoAut),
    datos: [['Folio', folio]].concat(claveNueva ? [['Tu correo de acceso', d.correo], ['Tu clave', claveNueva]] : [])
      .concat([['Qué envías', productoNombre(sol)], ['Movimiento', movimientoNombre(sol)], ['Tipo de servicio', sol.forma_envio]], fechas, [['Ruta', ruta]]),
    boton: { texto: 'Ver mis solicitudes', url: urlPortal() },
    nota: claveNueva ? 'Con tu correo y esta clave consultas todas tus solicitudes. Si la pierdes, en el portal elige «Olvidé mi clave».' : '' });
  await enviarCorreo({ plantilla: 'interno', folio, para: await avisos('nueva'), etiqueta: sol.prioridad === 'Urgente' ? 'URGENTE' : 'NUEVA SOLICITUD',
    asunto: (sol.prioridad === 'Urgente' ? 'URGENTE · ' : '') + 'Nueva solicitud ' + folio + ' · ' + productoNombre(sol) + ' · ' + movimientoNombre(sol),
    titulo: productoNombre(sol) + ' · ' + movimientoNombre(sol), parrafos: [sol.solicitante + ' (' + sol.area + ') registró una solicitud.']
      .concat(sol.motivo ? ['Descripción: ' + sol.motivo] : [], fuera ? ['Menos de 48 horas de anticipación: puede aplicar sobrecosto.'] : [],
        sol.aut_motivo ? ['Requiere autorización: ' + sol.aut_motivo + '. Envíala desde el panel a ' + sol.aut_correo + ' cuando tengas la cotización.'] : []),
    datos: [['Tipo de solicitud', sol.prioridad], ['Tipo de servicio', sol.forma_envio], ['Especificaciones', sol.paquetes],
      ['Total', sol.paq_total + ' piezas' + (sol.paq_peso_kg ? ' · ' + sol.paq_peso_kg + ' kg' : '')], ['Costo', costoTexto(sol)]].concat(fechas, [['Ruta', ruta]])
      .concat(sol.horario === 'Sí' ? [['Cita', 'Se requiere cita para entregar o recoger']] : [])
      .concat(sol.tipo === 'devolucion' ? [['Devolución', sol.dev_motivo + ' · ' + (sol.dev_cumple === 'Sí' ? 'cumple todos los puntos' : 'NO cumple todos los puntos: revisar')]] : []),
    boton: { texto: 'Abrir en el panel', url: urlPanel(folio) } });
  return { folio, clave: claveNueva, solicitud: await vistaPublica(folio) };
}

/* ------------------------------------------------------------------ modificación por quien solicita
   Solo mientras el folio está «Recibida» (antes de que Logística lo pase a revisión) y sin autorización enviada. */
export const LEYENDA_BLOQUEO = 'Este folio ya no admite modificaciones porque Logística ya está trabajando en él. Si necesitas un cambio, genera una nueva solicitud con los datos correctos y avisa a Logística por correo indicando este folio y el cambio que necesitas.';
const MODIFICABLES = ['solicitante', 'area', 'telefono', 'tipo', 'prioridad', 'forma_envio', 'horario', 'motivo', 'dev_motivo', 'dev_checklist',
  'origen_direccion', 'origen_contacto', 'origen_telefono', 'origen_link', 'destino_direccion', 'destino_contacto', 'destino_telefono', 'destino_link',
  'producto_tipo', 'producto_otro', 'tipo_otro', 'articulos', 'observaciones', 'costo_absorbe', 'costo_detalle', 'fecha_requerida', 'fecha_entrega',
  'fecha_abierta', 'recoleccion', 'fecha_recoleccion', 'recoleccion_abierta', 'fuera_tiempo', 'aut_estado', 'aut_correo', 'aut_motivo', 'dev_cumple',
  'paquetes', 'paq_total', 'paq_peso_kg', 'paq_vol_kg', 'acepta_condiciones'];
const motivoBloqueo = (s) => (s.estado !== 'recibida' ? 'Estado: ' + (C.ESTADOS[s.estado] || s.estado) : s.aut_enviada ? 'La autorización de costo ya se envió.' : '');
export async function solicitudParaModificar(folio) {
  const s = await consultarSolicitud(folio);
  const bloqueo = motivoBloqueo(s);
  return Object.assign(s, { modificable: !bloqueo, bloqueo, leyenda: bloqueo ? LEYENDA_BLOQUEO : '', contacto_logistica: (await avisos('modificada')).slice(0, 3) });
}
export async function modificarSolicitud(folio, datos) {
  const s = await consultarSolicitud(folio);
  if (motivoBloqueo(s)) throw fallo(LEYENDA_BLOQUEO);
  const { d, fuera, derivados } = prepararDatos(Object.assign({}, datos, { correo: s.correo }));
  const nuevo = Object.assign({}, d, derivados), t = ahora(), patch = { actualizada: t, modificada: t, modificaciones: (Number(s.modificaciones) || 0) + 1, condiciones_fecha: t };
  MODIFICABLES.forEach((k) => { if (nuevo[k] !== undefined) patch[k] = nuevo[k]; });
  /* Qué cambió, con el nombre que ve quien solicita. */
  const etiqueta = (k) => (C.CAMPOS.find((c) => c[0] === k) || [k, { articulos: 'Especificaciones', paquetes: 'Especificaciones', tipo: 'Tipo de movimiento' }[k] || k])[1];
  const igual = (x, y) => JSON.stringify(x === undefined ? '' : x) === JSON.stringify(y === undefined ? '' : y);
  const cambios = [...new Set(MODIFICABLES.filter((k) => !['paq_total', 'paq_peso_kg', 'paq_vol_kg', 'fuera_tiempo', 'aut_estado', 'aut_motivo', 'dev_cumple', 'acepta_condiciones', 'prioridad'].includes(k) &&
    patch[k] !== undefined && !igual(patch[k], s[k])).map(etiqueta))];
  if (!cambios.length) throw fallo('No hay cambios que guardar.');
  delete patch.condiciones_fecha;
  const b = fb.writeBatch(db);
  b.update(ref(COL.sol, s.folio), Object.assign(patch, { condiciones_fecha: t }));
  b.set(ref(COL.sol, s.folio, 'seguimiento', nuevoId()), { fecha: t, autor: d.solicitante, autor_tipo: 'solicitante', visible: true, estado: s.estado,
    mensaje: 'Solicitud modificada. Cambios: ' + cambios.join(', ') + '.' });
  await b.commit();
  const n = await getOne(ref(COL.sol, s.folio));
  await enviarCorreo({ plantilla: 'interno', folio: s.folio, para: [...new Set([correoOk(s.responsable_correo) ? s.responsable_correo : null].concat(await avisos('modificada')))].filter(correoOk),
    etiqueta: 'SOLICITUD MODIFICADA', asunto: 'Modificación · ' + s.folio + ' · ' + productoNombre(n), titulo: d.solicitante + ' modificó la solicitud ' + s.folio,
    parrafos: ['Cambios: ' + cambios.join(', ') + '.'].concat(fuera ? ['Con los cambios queda con menos de 48 horas de anticipación.'] : []),
    datos: [['Qué envías', productoNombre(n)], ['Tipo de servicio', servicioNombre(n.forma_envio)], ['Especificaciones', n.paquetes], ['Costo', costoTexto(n)]]
      .concat(fechasTexto(n), [['Ruta', lugarTexto(n, 'origen') + ' → ' + lugarTexto(n, 'destino')]]),
    boton: { texto: 'Abrir en el panel', url: urlPanel(s.folio) } });
  return vistaPublica(s.folio);
}

/* Archivos: se guardan en Firestore por partes (como los expedientes de proveedores). */
async function guardarArchivo(folio, archivo, autor) {
  if (!archivo || !archivo.base64 || !archivo.nombre) throw fallo('Selecciona un archivo válido.');
  if (Number(archivo.tamano) > MAX_MB * 1048576) throw fallo('El archivo supera ' + MAX_MB + ' MB.');
  const id = nuevoId(), b64 = archivo.base64, partes = Math.max(1, Math.ceil(b64.length / CHUNK));
  for (let i = 0; i < partes; i++) await fb.setDoc(ref(COL.sol, folio, 'archivos', id, 'partes', String(i).padStart(3, '0')), { d: b64.slice(i * CHUNK, (i + 1) * CHUNK) });
  const nombre = String(archivo.nombre).replace(/[^\wÁÉÍÓÚÜÑáéíóúüñ .()-]/g, '_').slice(0, 140);
  await fb.setDoc(ref(COL.sol, folio, 'archivos', id), { fecha: ahora(), autor, nombre, mime: archivo.mime || 'application/octet-stream',
    tamano: Number(archivo.tamano) || 0, partes, evidencia: archivo.clase === 'evidencia', clase: C.CLASES_ARCHIVO.includes(archivo.clase) ? archivo.clase : '' });
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
  const para = [...new Set([correoOk(s.responsable_correo) ? s.responsable_correo : null].concat(await avisos('mensaje')))].filter(correoOk);
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
  return { usuario: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol === 'operador' ? 'planeador' : u.rol, activo: u.activo !== false, debe_cambiar: !!u.cambiar_clave,
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
      await fb.setDoc(ref(COL.admins, u.uid), { nombre: inv.nombre, correo: u.email.toLowerCase(), rol: rolValido(inv.rol), activo: true,
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
/* Perfiles: «operador» es el nombre anterior de «planeador». */
const rolDe = (a) => (a.rol === 'operador' ? 'planeador' : a.rol);
const rolValido = (r) => (C.ROLES.some((x) => x[0] === r) ? r : 'planeador');
function soloPlaneador(a) { if (!['admin', 'planeador'].includes(rolDe(a))) throw fallo('Tu perfil (Facturación) solo puede consultar y descargar las plantillas.'); }
function soloFacturacion(a) { if (!['admin', 'facturacion'].includes(rolDe(a))) throw fallo('Solo los perfiles de Facturación o Administrador pueden hacer esto.'); }
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
    origen: lugarTexto(s, 'origen'), destino: lugarTexto(s, 'destino'), dev_motivo: s.dev_motivo || '',
    dev_cumple: s.dev_cumple || '', forma_envio: servicioNombre(s.forma_envio),
    aut_correo: s.aut_correo || '', aut_enviada: s.aut_enviada || '', aut_por: s.aut_por || s.aut_gerente || '', aut_motivo: s.aut_motivo || '', paq_total: s.paq_total || '', paq_peso_kg: s.paq_peso_kg || '',
    folio_cstext: s.folio_cstext || '', categorizacion: s.categorizacion || '', responsable: s.responsable || '', transportista: s.transportista || '',
    unidad_asignada: s.unidad_asignada || '', guia: s.guia || '', fecha_programada: s.fecha_programada || '', cerrada: s.cerrada || '',
    monto: s.monto || '', maniobra: s.maniobra || 'No', cst: s.cst || C.CST, facturada: s.facturada || '',
    origen_fact: s.origen_fact || s.origen_direccion || lugarTexto(s, 'origen'), destino_fact: s.destino_fact || s.destino_direccion || lugarTexto(s, 'destino'),
    cliente_fact: s.cliente_fact || clienteFactura(s) }))
    .sort((x, y) => String(y.creada).localeCompare(String(x.creada)));
  return { yo: publico(a), solicitudes: lista, usuarios: await equipo(), categorias: C.CATEGORIAS, transportistas: C.TRANSPORTISTAS, tipos_unidad: C.TIPOS_UNIDAD,
    aut_estados: C.AUT_ESTADOS, roles: C.ROLES, alertas: C.ALERTAS, tipos: CAT.tipos };
}

export async function adminDetalle(_t, folio) {
  await sesionPanel(true);
  folio = String(folio || '').trim().toUpperCase();
  const s = await getOne(ref(COL.sol, folio));
  if (!s) throw fallo('No existe la solicitud ' + folio + '.');
  const interno = await getOne(ref(COL.sol, folio, 'interno', 'datos')).catch(() => null);
  const out = Object.assign({}, s, { notas_internas: (interno && interno.notas_internas) || '', tipo_nombre: movimientoNombre(s),
    producto: productoNombre(s), prioridad: prioridad(s.prioridad), forma_envio: servicioNombre(s.forma_envio) });
  out.seguimiento = (await getAll(col(COL.sol, folio, 'seguimiento'))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((m) => ({ fecha: m.fecha, autor: m.autor, visible: m.visible !== false, estado: m.estado, mensaje: m.mensaje }));
  out.archivos = await archivosDe(folio);
  out.correos = (await getAll(donde(COL.correos, 'folio', folio))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((c) => ({ fecha: c.fecha, para: c.para, asunto: c.asunto, estado: c.estado, error: c.error, medio: c.medio }));
  return out;
}

/* cambios: {estado, mensaje, visible, notificar} y los campos de Logística. */
/* Siguiente folio CSTEXT (CSTEXT00747…): consecutivo en sm_config/cstext; el administrador fija desde dónde sigue. */
async function siguienteCstext() {
  let folio = '';
  await fb.runTransaction(db, async (tx) => {
    const r = ref(COL.config, 'cstext'), d = await tx.get(r);
    const n = d.exists() ? Number(d.data().siguiente) || 1 : 1;
    folio = C.CSTEXT_PREFIJO + String(n).padStart(5, '0');
    tx.set(r, { siguiente: n + 1, ultimo: folio, actualizado: ahora() });
  });
  return folio;
}
const montoNumero = (v) => { const t = String(v === undefined || v === null ? '' : v).replace(/[$,\s]/g, ''); return t === '' ? NaN : Number(t); };

export async function adminActualizar(_t, folio, cambios) {
  const a = await sesionPanel(true);
  soloPlaneador(a);
  cambios = cambios || {};
  /* El folio CSTEXT es automático; solo el administrador puede corregirlo a mano. */
  if (rolDe(a) !== 'admin') delete cambios.folio_cstext;
  const s = await getOne(ref(COL.sol, folio));
  if (!s) throw fallo('No existe la solicitud ' + folio + '.');
  const antes = s.estado, mensaje = String(cambios.mensaje || '').trim().slice(0, 2000);
  if (cambios.estado && !C.ESTADOS[cambios.estado]) throw fallo('Estado no válido.');
  if (cambios.estado === 'informacion' && cambios.estado !== antes && !mensaje) throw fallo('Escribe qué información falta.');
  if ((cambios.estado === 'rechazada' || cambios.estado === 'cancelada') && cambios.estado !== antes && !mensaje) throw fallo('Escribe el motivo.');
  const team = await equipo();
  if (cambios.responsable && !team.some((x) => x.usuario === cambios.responsable)) throw fallo('Responsable no válido.');
  ['fecha_programada', 'fecha_requerida', 'fecha_entrega', 'fecha_recoleccion', 'aut_fecha'].forEach((k) => {
    if (cambios[k] && !esFecha(cambios[k])) throw fallo('Fecha no válida.');
  });
  if (cambios.aut_estado && !C.AUT_ESTADOS.includes(cambios.aut_estado)) throw fallo('Estatus de autorización no válido.');
  /* Sin autorización del Gerente de Área no avanza a programada, en tránsito ni completada. */
  const aut = cambios.aut_estado !== undefined ? cambios.aut_estado : s.aut_estado;
  if (aut && aut !== 'Autorizado' && ['programada', 'en_transito', 'completada'].includes(cambios.estado) && cambios.estado !== s.estado) {
    throw fallo('Esta solicitud requiere la autorización del Gerente de Área. Regístrala como «Autorizado» antes de programarla.');
  }
  if (cambios.categorizacion && !C.CATEGORIAS.includes(cambios.categorizacion)) throw fallo('Categorización no válida.');
  if (cambios.monto !== undefined && String(cambios.monto).trim() !== '') {
    const m = montoNumero(cambios.monto);
    if (!(m >= 0 && m < 100000000)) throw fallo('Escribe el monto como número (ej. 2074.80).');
    cambios.monto = m.toFixed(2);
  }
  if (cambios.tipo && !CAT.tipos.concat(C.TIPOS).some((x) => x[0] === cambios.tipo)) throw fallo('Tipo de movimiento no válido.');
  if (cambios.folio_cstext) {
    cambios.folio_cstext = String(cambios.folio_cstext).trim().toUpperCase().replace(/^(\d+)$/, 'CSTEXT$1');
    const otro = (await getAll(donde(COL.sol, 'folio_cstext', cambios.folio_cstext))).find((x) => x.folio !== folio);
    if (otro) throw fallo('El folio ' + cambios.folio_cstext + ' ya está en la solicitud ' + otro.folio + '.');
  }
  const t = ahora(), patch = { actualizada: t };
  ['folio_cstext', 'categorizacion', 'transportista', 'unidad_asignada', 'guia', 'fecha_programada', 'aut_gerente', 'aut_comentario', 'costo_cotizado',
    'monto', 'origen_fact', 'destino_fact', 'cliente_fact', 'cst', 'tipo'].forEach((k) => {
    if (cambios[k] !== undefined) patch[k] = String(cambios[k]).trim().slice(0, k === 'aut_comentario' ? 1000 : 160);
  });
  /* Asignar la fecha a una solicitud con «Fecha abierta» sin crear una nueva. */
  if (cambios.maniobra !== undefined) patch.maniobra = cambios.maniobra === 'Sí' ? 'Sí' : 'No';
  ['cliente_fact', 'cst'].forEach((k) => { if (patch[k]) patch[k] = patch[k].toUpperCase(); });
  if (cambios.fecha_requerida) { patch.fecha_requerida = cambios.fecha_requerida; patch.fecha_abierta = ''; }
  if (cambios.fecha_entrega) { patch.fecha_entrega = cambios.fecha_entrega; patch.fecha_abierta = ''; }
  if (cambios.fecha_recoleccion && s.recoleccion === 'Sí') { patch.fecha_recoleccion = cambios.fecha_recoleccion; patch.recoleccion_abierta = ''; }
  if (cambios.aut_estado !== undefined && s.aut_estado && cambios.aut_estado !== s.aut_estado) {
    patch.aut_estado = cambios.aut_estado;
    patch.aut_fecha = cambios.aut_estado === C.AUT_PENDIENTE ? '' : (cambios.aut_fecha || hoy());
    patch.aut_registro = a.nombre;
    if (cambios.aut_estado !== C.AUT_PENDIENTE) patch.aut_por = s.aut_por || patch.aut_gerente || s.aut_gerente || a.nombre;
  } else if (cambios.aut_fecha && s.aut_estado) patch.aut_fecha = cambios.aut_fecha;
  if (cambios.responsable !== undefined) {
    const r = team.find((x) => x.usuario === cambios.responsable);
    patch.responsable = r ? r.usuario : ''; patch.responsable_nombre = r ? r.nombre : ''; patch.responsable_correo = r ? r.correo : '';
  }
  const estado = cambios.estado || antes;
  patch.estado = estado;
  patch.cerrada = C.ABIERTOS.includes(estado) ? '' : (s.cerrada || t);
  if (!s.folio_cstext && !patch.folio_cstext && ['programada', 'en_transito', 'completada'].includes(estado)) patch.folio_cstext = await siguienteCstext();
  const b = fb.writeBatch(db);
  b.update(ref(COL.sol, folio), patch);
  /* Si Logística registra la autorización a mano, la liga enviada por correo deja de servir. */
  if (patch.aut_estado && patch.aut_estado !== C.AUT_PENDIENTE) {
    (await getAll(donde(COL.aut, 'folio', folio))).filter((x) => x.estado === C.AUT_PENDIENTE)
      .forEach((x) => b.update(ref(COL.aut, x.id), { estado: 'Registrada en el panel', reemplazada: t }));
  }
  if (cambios.notas_internas !== undefined) b.set(ref(COL.sol, folio, 'interno', 'datos'), { notas_internas: String(cambios.notas_internas).slice(0, 2000), actualizado: t });
  const autCambio = patch.aut_estado !== undefined;
  const autTexto = autCambio ? 'Autorización: ' + patch.aut_estado + '.' : '';
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
    const datos = [['Estado', C.ESTADOS[estado]]].concat(autCambio ? [['Autorización', patch.aut_estado]] : []);
    if (n.fecha_programada && ['programada', 'en_transito'].includes(estado)) {
      datos.push(['Fecha de carga', diaTexto(n.fecha_programada)]);
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
  /* Entrega concluida: aviso a Facturación con los datos de la plantilla. */
  if (estado === 'completada' && antes !== 'completada') {
    await enviarCorreo({ plantilla: 'interno', folio, para: await avisos('completada'), etiqueta: 'ENTREGA CONCLUIDA',
      asunto: folio + ' · Entrega concluida' + (n.folio_cstext ? ' · ' + n.folio_cstext : ''), titulo: 'Entrega concluida lista para facturar',
      parrafos: ['La solicitud ' + folio + ' quedó como Completada. Ya aparece en «Facturación» para descargar la plantilla del proveedor.'],
      datos: [['Proveedor', n.transportista || '—'], ['Consecutivo', n.folio_cstext || '—'], ['Fecha de carga', diaTexto(n.fecha_programada) || '—'],
        ['Monto', n.monto ? '$' + Number(n.monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'],
        ['Origen', n.origen_fact || n.origen_direccion || lugarTexto(n, 'origen')], ['Destino', n.destino_fact || n.destino_direccion || lugarTexto(n, 'destino')]],
      boton: { texto: 'Abrir Facturación', url: urlPanel() } });
  }
  return adminDetalle(null, folio);
}

/* ------------------------------------------------------------------ facturación */
export async function adminMarcarFacturadas(_t, folios, facturada) {
  const a = await sesionPanel(true);
  soloFacturacion(a);
  folios = [].concat(folios || []).map((f) => String(f).trim().toUpperCase()).filter((f) => /^SOL-\d+$/.test(f)).slice(0, 400);
  if (!folios.length) throw fallo('No hay solicitudes para marcar.');
  const t = ahora(), b = fb.writeBatch(db);
  folios.forEach((f) => b.update(ref(COL.sol, f), { facturada: facturada === false ? '' : t.slice(0, 10), facturada_por: facturada === false ? '' : a.nombre, actualizada: t }));
  await b.commit();
  return adminDatos();
}

export async function adminSubirArchivo(_t, folio, arch) {
  const a = await sesionPanel(true);
  soloPlaneador(a);
  if (!(await getOne(ref(COL.sol, folio)))) throw fallo('No existe la solicitud ' + folio + '.');
  await guardarArchivo(folio, arch, a.nombre + ' (Logística)');
  return adminDetalle(null, folio);
}

export async function adminConfig() {
  const a = await sesionPanel(true);
  const av = (await getOne(ref(COL.config, 'avisos')).catch(() => null)) || {};
  const esAdmin = a.rol === 'admin';
  let usuarios = [], cstext = null;
  if (esAdmin) {
    usuarios = (await getAll(col(COL.admins))).map(publico)
      .concat((await getAll(col(COL.inv))).map((i) => ({ usuario: '', nombre: i.nombre, correo: i.id, rol: rolValido(i.rol), activo: true, pendiente: true, ultimo_acceso: '' })));
    cstext = (await getOne(ref(COL.config, 'cstext')).catch(() => null)) || {};
  }
  /* Personas que reciben alertas: las guardadas o, la primera vez, la lista general con todas las alertas. */
  const personas = (av.personas || []).length ? av.personas
    : (av.correos || []).map((c) => ({ nombre: '', correo: c, alertas: C.ALERTAS.map((x) => x[0]) }));
  return { avisos: (av.correos || []).join(', '), personas, alertas: C.ALERTAS, roles: C.ROLES, usuarios, version: VERSION, url: urlPortal(), panel: urlPanel(),
    catalogos: { areas: CAT.areas, productos: CAT.productos.map((x) => x[0]).filter((x) => x !== 'Otro'), tipos: CAT.tipos.map((t) => ({ clave: t[0], nombre: t[1], descripcion: t[2] || '' })) },
    tipos_fijos: C.TIPOS_FIJOS, cstext_siguiente: cstext ? Number(cstext.siguiente) || 1 : null, cstext_ultimo: cstext ? cstext.ultimo || '' : '' };
}
export async function adminGuardarAvisos(_t, texto) {
  soloAdmin(await sesionPanel(true));
  const lista = String(texto || '').split(/[\s,;]+/).filter(Boolean).map((x) => x.toLowerCase());
  const malos = lista.filter((c) => !correoOk(c));
  if (malos.length) throw fallo('Correos no válidos: ' + malos.join(', '));
  await fb.setDoc(ref(COL.config, 'avisos'), { correos: lista }, { merge: true });
  return lista.join(', ');
}
/* Alertas por persona: [{nombre, correo, alertas: ['nueva', 'modificada', …]}]. */
export async function adminGuardarAlertas(_t, personas) {
  soloAdmin(await sesionPanel(true));
  const validas = C.ALERTAS.map((x) => x[0]), vistos = new Set();
  const lista = [].concat(personas || []).map((x) => ({ nombre: String(x.nombre || '').trim().slice(0, 120), correo: String(x.correo || '').trim().toLowerCase(),
    alertas: [].concat(x.alertas || []).filter((y) => validas.includes(y)) })).filter((x) => x.correo);
  const malos = lista.filter((x) => !correoOk(x.correo)).map((x) => x.correo);
  if (malos.length) throw fallo('Correos no válidos: ' + malos.join(', '));
  lista.forEach((x) => { if (vistos.has(x.correo)) throw fallo('El correo ' + x.correo + ' está repetido.'); vistos.add(x.correo); });
  await fb.setDoc(ref(COL.config, 'avisos'), { personas: lista, correos: lista.map((x) => x.correo) });
  return (await adminConfig()).personas;
}
/* Catálogos: áreas, «¿Qué envías?» y tipos de movimiento. */
export async function adminGuardarCatalogos(_t, cat) {
  soloAdmin(await sesionPanel(true));
  cat = cat || {};
  const limpia = (l, max) => [...new Set([].concat(l || []).map((x) => String(x || '').trim().slice(0, max)).filter(Boolean))];
  const areas = limpia(cat.areas, 80), productos = limpia(cat.productos, 40).filter((x) => x.toLowerCase() !== 'otro');
  if (!areas.length) throw fallo('Deja al menos un área.');
  if (!productos.length) throw fallo('Deja al menos una opción en «¿Qué envías?».');
  const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
  const tipos = [], claves = new Set();
  [].concat(cat.tipos || []).forEach((t) => {
    const nombre = String((t && t.nombre) || '').trim().slice(0, 60);
    if (!nombre) return;
    let clave = String((t && t.clave) || '').trim() || slug(nombre) || 'tipo';
    while (claves.has(clave)) clave += '_2';
    claves.add(clave);
    tipos.push({ clave, nombre, descripcion: String((t && t.descripcion) || '').trim().slice(0, 120) });
  });
  const faltan = C.TIPOS_FIJOS.filter((k) => !claves.has(k));
  if (faltan.length) throw fallo('No se pueden quitar estos movimientos (los usa el formulario): ' + faltan.map(tipoNombre).join(', ') + '.');
  await fb.setDoc(ref(COL.config, 'catalogos'), { areas, productos, tipos, actualizado: ahora() });
  aplicarCatalogos({ areas, productos, tipos });
  return (await adminConfig()).catalogos;
}
/* Desde qué número sigue el folio CSTEXT (por ejemplo, 760 → CSTEXT00760). */
export async function adminGuardarCstext(_t, siguiente) {
  soloAdmin(await sesionPanel(true));
  const n = Number(String(siguiente || '').replace(/\D/g, ''));
  if (!(n >= 1 && n < 10000000)) throw fallo('Escribe el número con el que sigue el consecutivo (ej. 760).');
  const actual = (await getOne(ref(COL.config, 'cstext')).catch(() => null)) || {};
  await fb.setDoc(ref(COL.config, 'cstext'), { siguiente: n, ultimo: actual.ultimo || '', actualizado: ahora() });
  return n;
}
/* Alta o edición de personal del panel. Si el correo ya tiene cuenta (por ejemplo, del panel de proveedores),
   queda invitado y entra con su misma contraseña. */
export async function adminGuardarUsuario(_t, datos) {
  const a = await sesionPanel(true);
  soloAdmin(a);
  datos = datos || {};
  const nombre = String(datos.nombre || '').trim(), correo = String(datos.correo || '').trim().toLowerCase();
  const rol = rolValido(datos.rol);
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

/* ------------------------------------------------------------------ autorización del costo por correo
   Logística envía a quien autoriza un correo con una liga secreta (un token por envío). La liga abre autorizar.html,
   donde se confirma «Autorizar costo» o «Rechazar» sin iniciar sesión. La respuesta queda en sm_autorizaciones/{token}
   y en el folio (aut_estado, aut_por, aut_fecha) como evidencia. Las reglas solo dejan responder una vez y con ese token. */
const urlAutorizar = (t, d) => new URL('autorizar.html?t=' + encodeURIComponent(t) + (d ? '&d=' + d : ''), base()).href;
function resumenAutorizacion(s, costo) {
  return [['Folio', s.folio], ['Solicitante', s.solicitante], ['Departamento', s.area], ['Qué se envía', productoNombre(s)],
    ['Movimiento', movimientoNombre(s)], ['Origen', s.origen_direccion || lugarTexto(s, 'origen')], ['Destino', s.destino_direccion || lugarTexto(s, 'destino')],
    ['Tipo de servicio', servicioNombre(s.forma_envio)], ['Cantidad, dimensiones y peso', articulosTexto(s) || s.paquetes],
    ['Peso total', s.paq_peso_kg ? s.paq_peso_kg + ' kg' : '']].concat(fechasTexto(s),
    [['Quién absorbe el costo', costoTexto(s)], ['Costo / cotización', costo || 'Ver cotización adjunta'], ['Motivo de la autorización', s.aut_motivo]])
    .filter((x) => x[1]).map((x) => ({ k: x[0], v: String(x[1]) }));
}
export async function adminEnviarAutorizacion(_t, folio, opciones) {
  const a = await sesionPanel(true);
  soloPlaneador(a);
  opciones = opciones || {};
  const s = await getOne(ref(COL.sol, folio));
  if (!s) throw fallo('No existe la solicitud ' + folio + '.');
  if (s.aut_estado && s.aut_estado !== C.AUT_PENDIENTE) throw fallo('La autorización ya tiene respuesta: ' + s.aut_estado + '.');
  const correo = String(opciones.correo || s.aut_correo || '').trim().toLowerCase();
  if (!correoOk(correo)) throw fallo('Escribe el correo de quien autoriza el costo.');
  const costo = String(opciones.costo !== undefined ? opciones.costo : s.costo_cotizado || '').trim().slice(0, 160);
  const t = ahora(), token = azar(32, 'abcdefghijklmnopqrstuvwxyz0123456789');
  const cotizaciones = (await getAll(col(COL.sol, folio, 'archivos'))).filter((x) => x.clase === 'cotizacion').slice(-3);
  const notificar = [...new Set([s.correo, correoOk(s.responsable_correo) ? s.responsable_correo : null].concat(await avisos('autorizacion')))].filter(correoOk);
  const motivo = s.aut_motivo || 'Autorización de costo';
  const resumenAut = resumenAutorizacion(Object.assign({}, s, { aut_motivo: motivo }), costo);
  const b = fb.writeBatch(db);
  (await getAll(donde(COL.aut, 'folio', folio))).filter((x) => x.estado === C.AUT_PENDIENTE)
    .forEach((x) => b.update(ref(COL.aut, x.id), { estado: 'Reemplazada', reemplazada: t }));
  b.set(ref(COL.aut, token), { folio, correo, estado: C.AUT_PENDIENTE, motivo, resumen: resumenAut, costo, enviada: t, enviada_por: a.nombre, notificar,
    archivos: cotizaciones.map((x) => ({ id: x.id, nombre: x.nombre, mime: x.mime, tamano: x.tamano || 0 })) });
  b.update(ref(COL.sol, folio), { aut_estado: C.AUT_PENDIENTE, aut_correo: correo, aut_enviada: t, aut_motivo: motivo, costo_cotizado: costo, actualizada: t });
  b.set(ref(COL.sol, folio, 'seguimiento', nuevoId()), { fecha: t, autor: a.nombre + ' (Logística)', autor_tipo: 'logistica', visible: true, estado: s.estado,
    mensaje: 'Se envió la solicitud de autorización de costo a ' + correo + '.' });
  await b.commit();
  /* Copia de la cotización para que quien autoriza la vea desde la liga, sin cuenta. */
  for (const x of cotizaciones) {
    const partes = await getAll(col(COL.sol, folio, 'archivos', x.id, 'partes'));
    for (const p of partes) await fb.setDoc(ref(COL.aut, token, 'archivos', x.id, 'partes', p.id), { d: p.d });
  }
  const reg = await enviarCorreo({ plantilla: 'solicitante', folio, para: correo, etiqueta: 'AUTORIZACIÓN DE COSTO',
    asunto: 'Autorización de costo · ' + folio + ' · ' + productoNombre(s), titulo: '¿Autorizas el costo de este servicio?',
    parrafos: [s.solicitante + ' (' + s.area + ') solicitó un servicio de Logística que requiere tu autorización.', 'Motivo: ' + motivo + '.'],
    datos: resumenAut.filter((x) => x.k !== 'Folio' && x.k !== 'Motivo de la autorización').map((x) => [x.k, x.v]),
    botones: [{ texto: '✓ Autorizar costo', url: urlAutorizar(token, 'autorizar'), color: '#17693F' }, { texto: '✕ Rechazar', url: urlAutorizar(token, 'rechazar'), color: '#B42318' }],
    nota: 'Al dar clic se abre la plataforma para confirmar tu respuesta. La respuesta queda registrada en el folio como evidencia de la autorización.' });
  const out = await adminDetalle(null, folio);
  out.envio = reg;
  return out;
}

async function autorizacionDoc(token) {
  token = String(token || '').trim();
  if (!/^[a-z0-9]{32}$/.test(token)) throw fallo('Esta liga de autorización no es válida.');
  const a = await getOne(ref(COL.aut, token)).catch(() => null);
  if (!a) throw fallo('Esta liga de autorización no es válida.');
  return a;
}
export async function autorizacionVer(token) {
  const a = await autorizacionDoc(token);
  return { folio: a.folio, correo: a.correo, estado: a.estado, motivo: a.motivo, resumen: a.resumen || [], costo: a.costo, enviada: a.enviada,
    respondida: a.respondida || '', nombre: a.nombre || '', comentario: a.comentario || '',
    archivos: (a.archivos || []).map((x) => Object.assign({}, x, { url: '#autorizacion:' + a.id + ':' + x.id })) };
}
export async function autorizacionArchivo(token, id) {
  const a = await autorizacionDoc(token), meta = (a.archivos || []).find((x) => x.id === id);
  if (!meta) throw fallo('No encontramos el archivo.');
  const partes = (await getAll(col(COL.aut, a.id, 'archivos', id, 'partes'))).sort((x, y) => x.id.localeCompare(y.id));
  return { nombre: meta.nombre, mime: meta.mime, dataUrl: 'data:' + meta.mime + ';base64,' + partes.map((p) => p.d).join('') };
}
export async function autorizacionResponder(token, decision, nombre, comentario) {
  const a = await autorizacionDoc(token);
  if (a.estado !== C.AUT_PENDIENTE) {
    throw fallo(['Reemplazada', 'Registrada en el panel'].includes(a.estado) ? 'Esta liga ya no está vigente: Logística envió una más reciente o registró la autorización.'
      : 'Esta autorización ya fue respondida: ' + a.estado + '.');
  }
  const estado = decision === 'autorizar' ? 'Autorizado' : decision === 'rechazar' ? 'Rechazado' : '';
  if (!estado) throw fallo('Elige autorizar o rechazar.');
  nombre = String(nombre || '').trim().slice(0, 120);
  comentario = String(comentario || '').trim().slice(0, 1000);
  if (estado === 'Rechazado' && !comentario) throw fallo('Escribe el motivo del rechazo.');
  const t = ahora(), b = fb.writeBatch(db);
  b.update(ref(COL.aut, a.id), { estado, respondida: t, nombre, comentario });
  b.update(ref(COL.sol, a.folio), { aut_estado: estado, aut_por: a.correo, aut_nombre: nombre, aut_fecha: t.slice(0, 10), aut_ref: a.id,
    aut_comentario: comentario, actualizada: t });
  await b.commit();
  const quien = (nombre ? nombre + ' · ' : '') + a.correo;
  await enviarCorreo({ plantilla: 'interno', folio: a.folio, para: a.notificar || [], etiqueta: estado === 'Autorizado' ? 'COSTO AUTORIZADO' : 'AUTORIZACIÓN RECHAZADA',
    asunto: a.folio + (estado === 'Autorizado' ? ' · Costo autorizado' : ' · Autorización rechazada'),
    titulo: estado === 'Autorizado' ? '✓ Costo autorizado' : '✕ Autorización rechazada',
    parrafos: [(estado === 'Autorizado' ? 'Autorizado por: ' : 'Rechazado por: ') + quien].concat(comentario ? ['Comentario: ' + comentario] : []),
    datos: [['Folio', a.folio], ['Fecha', diaTexto(t.slice(0, 10))], ['Costo / cotización', a.costo || '—']],
    boton: { texto: 'Ver la solicitud', url: urlPortal() } });
  return autorizacionVer(a.id);
}
