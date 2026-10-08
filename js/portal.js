/* Formulario y seguimiento de solicitudes (Liga 1). Misma interfaz que la versión probada, con acceso de Firebase. */
import * as API from './servidor.js?v=29';
window.API = API;
(function () {
    'use strict';
    var h = U.h, mount = U.mount, run = U.run;
    var PARAMS = { folio: new URLSearchParams(location.search).get('folio') || '' };
    var main = document.getElementById('main');
    var cfg = null;
    var acceso = null;     // folio de la solicitud abierta
    var GUARDADO = 'sol_solicitante';

    function init() {
      U.logos(document.getElementById('logos'));
      API.iniciar('portal').then(function () { return run('configPortal'); }).then(function (c) {
        cfg = c;
        if (cfg.sesion) { if (PARAMS.folio) abrir(PARAMS.folio); else misSolicitudes(); return; }
        if (PARAMS.folio) pantallaEntrar(); else inicio();
      }).catch(function (e) { mount(main, h('div', { class: 'aviso aviso-mal' }, h('p', null, e.message))); });
    }

    function arriba(contenido) { mount(document.getElementById('arriba'), contenido || null); }
    /* Menú lateral del portal: lo básico, con una línea de ayuda en cada opción. */
    function menuPortal(activa) {
      U.menu(document.getElementById('menu'), [
        { clave: 'nueva', icono: '➕', titulo: 'Nueva solicitud', ayuda: 'Pide un envío o una recolección', accion: function () { formulario(); } },
        { clave: 'mis', icono: '📋', titulo: 'Mis solicitudes', ayuda: 'Revisa el avance de tus folios', accion: function () { if (cfg.sesion) misSolicitudes(); else pantallaEntrar(); } },
        { clave: 'modificar', icono: '✎', titulo: 'Modificar una solicitud', ayuda: 'Cambia un folio que aún no se revisa', accion: pantallaModificar },
        { clave: 'ayuda', icono: '❔', titulo: '¿Cómo funciona?', ayuda: 'Los pasos, explicados', accion: ayuda }
      ], activa, cfg.sesion ? [h('div', { class: 'lateral-usuario' }, h('span', null, 'Entraste como'), h('b', null, cfg.sesion.correo)),
        h('button', { class: 'btn btn-chico', type: 'button', onclick: salir }, 'Salir')] : null, 'Solicitudes de movimientos');
    }
    function pantallaModificar() {
      acceso = null; arriba(null); menuPortal('modificar');
      mount(main, h('div', { class: 'centrado' }, h('h1', null, 'Modificar una solicitud'),
        h('p', { class: 'ayuda-pantalla' }, 'Escribe el folio que te llegó por correo. Puedes cambiarlo mientras Logística no lo haya puesto en revisión.'),
        buscadorModificar(true)));
    }
    function ayuda() {
      acceso = null; arriba(null); menuPortal('ayuda');
      var pasos = [
        ['➕', 'Llena tu solicitud', 'Dinos qué envías, quién lo pide, de dónde sale, a dónde va, cómo se envía, quién paga y las fechas. Te guiamos paso a paso.'],
        ['📧', 'Recibe tu folio', 'Te llega un correo con tu folio (CSTEXT) y, la primera vez, una clave para entrar a «Mis solicitudes».'],
        ['🚚', 'Logística la atiende', 'La revisa, programa la fecha de carga y, si lo paga CESANTONI, pide la autorización del costo por correo.'],
        ['📋', 'Sigue el avance', 'En «Mis solicitudes» ves el estatus, los mensajes y los documentos. Mientras esté «Recibida» la puedes modificar.']];
      mount(main, h('h1', null, '¿Cómo funciona?'),
        h('p', { class: 'ayuda-pantalla', style: 'margin-bottom:16px' }, 'Cuatro pasos. Si tienes dudas, escribe a Logística desde el seguimiento de tu folio.'),
        h('ol', { class: 'pasos-ayuda' }, pasos.map(function (p, i) {
          return h('li', { class: 'tarjeta' }, h('span', { class: 'paso-icono', 'aria-hidden': 'true' }, p[0]), h('div', null, h('h2', null, (i + 1) + '. ' + p[1]), h('p', { class: 'gris', style: 'margin:0' }, p[2])));
        })),
        h('p', null, h('button', { class: 'btn btn-pri', type: 'button', onclick: function () { formulario(); } }, 'Hacer una solicitud')));
    }

    /* ---------------------------------------------------------------- portada */
    function inicio() {
      acceso = null;
      arriba(null);
      menuPortal('');
      mount(main, h('div', { class: 'portada portada-sola' },
        h('section', { class: 'tarjeta' },
          h('h1', null, '¿Necesitas mover algo?'),
          h('p', { class: 'gris' }, 'Pide aquí envíos, recolecciones, devoluciones y traslados a Logística: qué envías, de dónde sale, a dónde va, cómo se envía, quién paga y cuándo. Cada solicitud recibe un folio con su expediente y te avisamos por correo cada avance.'),
          h('ul', { class: 'lista-tipos' }, [['📦', '¿Qué envías?', 'Producto, mobiliario, sillas, stands, regalos, vinos…'], ['📍', '¿De dónde y a dónde?', 'Ciudad, Estado, ubicación, link y contacto'],
            ['🚚', '¿Cómo y cuánto?', 'Unidad dedicada o paquetería, con medidas y peso'], ['🗓️', '¿Quién paga y cuándo?', 'Costo, documentos y fechas tentativas']].map(function (t) {
            return h('li', null, h('span', { class: 'tipo-icono', 'aria-hidden': 'true' }, t[0]), h('span', null, h('b', null, t[1]), h('span', { class: 'gris' }, t[2])));
          })),
          h('p', null, h('button', { class: 'btn btn-pri btn-grande', type: 'button', onclick: formulario }, 'Nueva solicitud →')),
          h('p', { class: 'gris chico', style: 'margin:0' }, '¿Ya tienes solicitudes? Abre el menú ☰ y elige «Mis solicitudes» o «Modificar una solicitud».'))));
    }

    /* «Mis solicitudes» sin sesión: correo y la clave que llegó con la primera solicitud. */
    function pantallaEntrar() {
      acceso = null;
      arriba(null);
      menuPortal('mis');
      var correo = h('input', { class: 'entrada', id: 'c-correo', type: 'email', placeholder: 'tu.correo@cesantoni.com.mx', autocomplete: 'email', value: recordado().correo || '' });
      var clave = h('input', { class: 'entrada', id: 'c-clave', type: 'password', autocomplete: 'current-password', placeholder: 'XXXX-XXXX' });
      var err = h('p', { class: 'chico', style: 'color:var(--mal)', role: 'alert', hidden: true });
      var btn = h('button', { class: 'btn btn-osc', type: 'submit' }, 'Entrar');
      var olvide = h('button', { class: 'liga chico', type: 'button' }, 'Olvidé mi clave');
      olvide.addEventListener('click', function () {
        if (!correo.value.trim()) { err.textContent = 'Escribe tu correo y vuelve a dar clic en «Olvidé mi clave».'; err.hidden = false; return; }
        run('recuperarClave', correo.value.trim()).then(function (m) { U.toast(m); });
      });
      var form = h('form', { novalidate: true },
        h('div', { class: 'campo', style: 'margin-bottom:10px' }, h('label', { for: 'c-correo' }, 'Correo'), correo),
        h('div', { class: 'campo', style: 'margin-bottom:12px' }, h('label', { for: 'c-clave' }, 'Clave'), clave),
        err, h('div', { class: 'acciones' }, btn, olvide));
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        err.hidden = true;
        if (!correo.value.trim() || !clave.value.trim()) { err.textContent = 'Escribe tu correo y tu clave.'; err.hidden = false; return; }
        U.ocupado(btn, true, 'Entrando…');
        run('entrarSolicitante', correo.value.trim(), clave.value).then(function (s) {
          cfg.sesion = s;
          if (PARAMS.folio) abrir(PARAMS.folio); else misSolicitudes();
        }).catch(function (e) { U.ocupado(btn, false); err.textContent = e.message; err.hidden = false; });
      });
      mount(main, h('div', { class: 'centrado' }, h('h1', null, 'Mis solicitudes'),
        h('p', { class: 'ayuda-pantalla' }, 'Entra con tu correo y la clave que te enviamos con tu primera solicitud para ver el estado, responder a Logística o agregar archivos.'),
        h('section', { class: 'tarjeta' }, form)));
      correo.focus();
    }

    /* «Modificar una solicitud»: con el folio (y correo + clave si no hay sesión) abre el formulario con sus datos. */
    function buscadorModificar(solo) {
      var folio = h('input', { class: 'entrada', id: 'm-folio', placeholder: 'CSTEXT00760', autocomplete: 'off', style: 'text-transform:uppercase' });
      var correo = cfg.sesion ? null : h('input', { class: 'entrada', id: 'm-correo', type: 'email', autocomplete: 'email', value: recordado().correo || '' });
      var clave = cfg.sesion ? null : h('input', { class: 'entrada', id: 'm-clave', type: 'password', autocomplete: 'current-password', placeholder: 'XXXX-XXXX' });
      var err = h('p', { class: 'chico', style: 'color:var(--mal)', role: 'alert', hidden: true });
      var btn = h('button', { class: 'btn btn-chico', type: 'submit' }, 'Buscar folio');
      var f = h('form', { class: 'tarjeta', novalidate: true }, solo ? null : h('h2', null, 'Modificar una solicitud'),
        solo ? null : h('p', { class: 'gris chico' }, 'Puedes cambiar tu solicitud mientras Logística no la haya puesto en revisión.'),
        h('div', { class: 'campo', style: 'margin-bottom:10px' }, h('label', { for: 'm-folio' }, 'Folio'), folio),
        correo ? h('div', { class: 'campo', style: 'margin-bottom:10px' }, h('label', { for: 'm-correo' }, 'Correo'), correo) : null,
        clave ? h('div', { class: 'campo', style: 'margin-bottom:12px' }, h('label', { for: 'm-clave' }, 'Clave'), clave) : null,
        err, btn);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); err.hidden = true;
        /* Acepta «CSTEXT00760», «760» o los folios anteriores «SOL-0001». */
        var t = folio.value.trim().toUpperCase(), n = t.replace(/\D/g, '');
        if (!n) { err.textContent = 'Escribe el folio (por ejemplo, CSTEXT00760).'; err.hidden = false; return; }
        var buscado = /^SOL/.test(t) ? 'SOL-' + n.padStart(4, '0') : 'CSTEXT' + n.padStart(5, '0');
        if (!cfg.sesion && (!correo.value.trim() || !clave.value.trim())) { err.textContent = 'Escribe tu correo y tu clave.'; err.hidden = false; return; }
        U.ocupado(btn, true, 'Buscando…');
        (cfg.sesion ? Promise.resolve() : run('entrarSolicitante', correo.value.trim(), clave.value).then(function (r) { cfg.sesion = r; }))
          .then(function () { return abrirModificacion(buscado); })
          .catch(function (e) { U.ocupado(btn, false); err.textContent = e.message; err.hidden = false; });
      });
      return f;
    }
    function abrirModificacion(folio) {
      return run('solicitudParaModificar', folio).then(function (s) {
        acceso = s.folio;
        if (s.modificable) formulario({ modificar: s }); else bloqueado(s);
      });
    }
    /* Folio que ya no se puede modificar: leyenda, nueva solicitud con estos datos y aviso a Logística por correo. */
    function bloqueado(s) {
      arribaSesion();
      var para = (s.contacto_logistica || []).join(',');
      var asunto = 'Modificación de la solicitud ' + s.folio;
      var cuerpo = 'Hola, necesito modificar la solicitud ' + s.folio + ' (' + (s.producto || '') + ').\n\nCambio que necesito:\n\n\nGracias.';
      mount(main, h('section', { class: 'tarjeta' },
        h('div', { class: 'cabecera' }, h('div', null, h('p', { class: 'gris chico', style: 'margin:0' }, 'Folio'), h('div', { class: 'folio' }, s.folio)), U.estado(cfg, s.estado)),
        h('div', { class: 'aviso aviso-alerta', role: 'alert', style: 'margin-top:16px' }, h('p', null, h('b', null, 'No se puede modificar. '), s.leyenda)),
        h('div', { class: 'acciones', style: 'margin-top:8px' },
          h('button', { class: 'btn btn-pri', type: 'button', onclick: function () { formulario({ copia: s }); } }, 'Crear nueva solicitud con estos datos'),
          para ? h('a', { class: 'btn', href: 'mailto:' + para + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo) }, '✉ Avisar a Logística por correo') : null,
          h('button', { class: 'liga', type: 'button', onclick: function () { seguimiento(s); } }, 'Ver seguimiento'))));
    }

    function arribaSesion(activa) { arriba(null); menuPortal(activa || 'mis'); }
    function salir() { run('salirSolicitante').then(function () { cfg.sesion = null; inicio(); }); }

    function misSolicitudes() {
      acceso = null;
      arribaSesion();
      mount(main, h('p', { class: 'gris' }, 'Cargando tus solicitudes…'));
      run('misSolicitudes').then(function (lista) {
        var tabla = lista.length ? h('div', { class: 'tabla-caja' }, h('table', null,
          h('thead', null, h('tr', null, ['Folio', 'Estado', 'Producto y movimiento', 'Ruta', 'Fecha'].map(function (t) { return h('th', null, t); }))),
          h('tbody', null, lista.map(function (s) {
            var tr = h('tr', { tabindex: '0' }, h('td', { style: 'white-space:nowrap' }, h('b', null, s.folio)),
              h('td', null, U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('div', { style: 'margin-top:4px' }, h('span', { class: 'pill urgente' }, 'Urgente')) : null),
              h('td', null, s.producto || '—', h('div', { class: 'sub' }, s.tipo_nombre)), h('td', null, s.origen, h('div', { class: 'sub' }, '→ ' + s.destino)),
              h('td', { style: 'white-space:nowrap' }, s.fecha_abierta === 'Sí' ? 'Fecha abierta' : (U.dia(s.fecha_requerida) || U.dia(s.creada)),
                s.fecha_requerida || s.fecha_abierta ? null : h('div', { class: 'sub' }, 'Creada')));
            tr.addEventListener('click', function () { abrir(s.folio); });
            tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') abrir(s.folio); });
            return tr;
          }))))
          : h('div', { class: 'tarjeta', style: 'text-align:center' }, h('p', { class: 'gris' }, 'Aún no tienes solicitudes con este correo.'),
            h('button', { class: 'btn btn-pri', type: 'button', onclick: formulario }, 'Nueva solicitud'));
        mount(main, h('div', { class: 'cabecera', style: 'margin-bottom:14px' }, h('h1', { style: 'margin:0' }, 'Mis solicitudes'),
          h('div', { class: 'acciones' }, h('span', { class: 'gris chico' }, cfg.sesion.correo),
            h('button', { class: 'btn btn-pri', type: 'button', onclick: function () { formulario(); } }, 'Nueva solicitud'))), tabla, h('div', { class: 'mis-modificar' }, buscadorModificar()));
      }).catch(function (e) { if (e.sesion) { cfg.sesion = null; inicio(); } U.toast(e.message, true); });
    }

    /* ---------------------------------------------------------------- formulario */
    function recordado() { try { return JSON.parse(localStorage.getItem(GUARDADO) || '{}'); } catch (e) { return {}; } }

    /* op.modificar: abre el folio con sus datos para cambiarlo; op.copia: nueva solicitud con los datos de otro folio. */
    function formulario(op) {
      op = op && (op.modificar || op.copia) ? op : {};
      menuPortal(op.modificar ? 'modificar' : 'nueva');
      var base = op.modificar || op.copia || null;
      arriba(h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { if (cfg.sesion) misSolicitudes(); else inicio(); } }, 'Cancelar'));
      var prev = recordado();
      var claveCuenta = null;
      var campos = {};
      var generales = [], evidencias = [], cotizaciones = [], correosCotizacion = [], autorizaciones = [], salidas = [];
      var AVISO_48 = 'Si tu solicitud se realiza con menos de 48 horas de anticipación, podrán aplicarse sobrecostos y será necesaria la autorización del Gerente de Área.';
      var ARCHIVOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.csv,.docx,.doc,.pptx,.eml,.msg,.txt';

      /* opts.aplica: función que dice si el campo se muestra y se valida (campos que dependen de otra respuesta). */
      function campo(key, label, control, opts) {
        opts = opts || {};
        control.id = 'f-' + key;
        var error = h('p', { class: 'error', hidden: true });
        var texto = h('span', null, label);
        var wrap = h('div', { class: 'campo' + (opts.todo ? ' todo' : '') },
          label ? h(opts.grupo ? 'span' : 'label', opts.grupo ? { class: 'etiqueta' } : { for: control.id }, texto, opts.req ? h('span', { class: 'req' }, ' *') : null) : null,
          control, opts.ayuda ? h('p', { class: 'ayuda' }, opts.ayuda) : null, error);
        campos[key] = { wrap: wrap, error: error, control: control, texto: texto, req: !!opts.req, grupo: !!opts.grupo, aplica: opts.aplica || null, correo: !!opts.correo };
        var limpiar = function () { error.hidden = true; wrap.classList.remove('invalido'); };
        control.addEventListener('input', limpiar);
        control.addEventListener('change', limpiar);
        return wrap;
      }
      function texto(key, label, opts) {
        opts = opts || {};
        var el = opts.area ? h('textarea', { class: 'entrada', maxlength: opts.max || 1000, rows: opts.filas || 3, placeholder: opts.ejemplo || null })
          : h('input', { class: 'entrada', type: opts.tipo || 'text', maxlength: opts.max || 160, autocomplete: opts.auto || 'off', min: opts.min || null,
            list: opts.lista || null, placeholder: opts.ejemplo || null, inputmode: opts.modo || null });
        el.value = prev[key] && opts.recordar ? prev[key] : '';
        return campo(key, label, el, opts);
      }
      function lista(key, label, valores, opts) {
        var el = h('select', { class: 'entrada' }, h('option', { value: '' }, 'Selecciona…'), valores.map(function (v) { return h('option', { value: v }, v); }));
        return campo(key, label, el, opts);
      }
      function opciones(key, label, valores, opts) {
        var box = h('div', { class: 'opciones' + (opts && opts.centro ? ' opciones-centro' : ''), role: 'radiogroup' }, valores.map(function (v) {
          return h('label', { class: 'opcion' }, h('input', { type: 'radio', name: key, value: v[0] }),
            h('span', null, h('b', null, v[1]), v[2] ? h('small', null, v[2]) : null));
        }));
        return campo(key, label, box, Object.assign({ grupo: true, todo: true }, opts));
      }
      function marcar(key, v) {
        var el = Array.prototype.filter.call(campos[key].control.querySelectorAll('input'), function (x) { return x.value === v; })[0];
        if (el) el.checked = true;
      }
      function valor(key) {
        var c = campos[key];
        if (c.casilla) return c.casilla.checked ? 'Sí' : '';
        if (c.multiple) return Array.prototype.map.call(c.control.querySelectorAll('input:checked'), function (x) { return x.value; });
        if (c.grupo) { var sel = c.control.querySelector('input:checked'); return sel ? sel.value : ''; }
        return c.control.value.trim();
      }
      function casillas(key, label, valores, opts) {
        var box = h('div', { class: 'casillas' }, valores.map(function (v) {
          return h('label', { class: 'casilla' }, h('input', { type: 'checkbox', name: key, value: v }), h('span', null, v));
        }));
        var wrap = campo(key, label, box, Object.assign({ grupo: true, todo: true }, opts));
        campos[key].multiple = true;
        return wrap;
      }
      /* Una sola casilla de Sí/No: guarda «Sí» cuando está marcada. */
      function casilla(key, label, texto, opts) {
        var el = h('input', { type: 'checkbox', value: 'Sí' });
        var wrap = campo(key, label, h('label', { class: 'casilla' }, el, h('span', null, texto)), Object.assign({ grupo: true }, opts));
        campos[key].casilla = el;
        return wrap;
      }
      /* Selector de archivos con lista para quitar antes de enviar. */
      function selector(key, label, lista, accept, opts) {
        var ul = h('ul', { class: 'archivos' });
        var input = h('input', { type: 'file', multiple: true, accept: accept, class: opts && opts.boton ? 'archivo-oculto' : 'entrada' });
        function pintar() {
          mount(ul, lista.map(function (f, i) {
            return h('li', null, h('span', null, f.name, h('span', { class: 'gris' }, ' · ' + U.tamano(f.size))),
              h('button', { type: 'button', class: 'liga', onclick: function () { lista.splice(i, 1); pintar(); } }, 'Quitar'));
          }));
        }
        input.addEventListener('change', function () {
          Array.prototype.forEach.call(input.files || [], function (f) {
            if (f.size > cfg.max_mb * 1048576) { U.toast('«' + f.name + '» pesa más de ' + cfg.max_mb + ' MB.', true); return; }
            if (lista.length < 10) lista.push(f);
          });
          if (input.files && input.files.length) { input.value = ''; pintar(); }
        });
        var control = opts && opts.boton ? h('div', null, h('label', { class: 'btn btn-chico btn-adjuntar' }, '📎 ' + opts.boton, input), ul) : h('div', null, input, ul);
        var wrap = campo(key, label, control, Object.assign({ todo: true }, opts));
        campos[key].archivos = lista;
        return wrap;
      }
      function seccion(titulo, intro) {
        var hijos = Array.prototype.slice.call(arguments, 2);
        return h('section', { class: 'tarjeta paso-tarjeta' }, h('header', { class: 'paso-encabezado' }, h('h2', null, titulo), intro ? h('p', { class: 'gris' }, intro) : null),
          h('div', { class: 'rejilla' }, hijos));
      }
      function numero(v) { v = String(v).replace(',', '.').trim(); return v === '' ? NaN : Number(v); }
      var r1 = function (x) { return Math.round(x * 10) / 10; };

      /* Reglas que deciden qué campos aplican según lo elegido. */
      /* El movimiento se deduce: devolución (casilla del paso 1), entrega con recolección posterior (casilla de fechas) o envío. */
      function tipoActual() { return valor('es_devolucion') === 'Sí' ? 'devolucion' : valor('regresa') === 'Sí' ? 'entrega_recoleccion' : 'envio'; }
      var esTipo = function (t) { return function () { return tipoActual() === t; }; };
      var fechaAbierta = function () { return valor('fecha_abierta') === 'Sí'; };
      var cesantoni = function () { return valor('costo_absorbe') === cfg.costo_autoriza; };
      var esPaqueteria = function () { return valor('forma_envio') === cfg.paqueteria; };
      function fueraDeTiempo() {
        var f = valor('fecha_requerida');
        return !fechaAbierta() && /^\d{4}-\d{2}-\d{2}$/.test(f) && f < cfg.limite_programado;
      }

      /* ---------- 1 · ¿Qué envías? */
      var pasoQue = h('div', { class: 'paso' }, seccion('¿Qué envías?', 'Elige el material que se va a transportar.',
        opciones('producto_tipo', '¿Qué envías?', cfg.productos.map(function (p) { return [p[0], p[0], '']; }), { req: true, centro: true }),
        texto('producto_otro', 'Especificar qué envías', { req: true, max: 120, todo: true, aplica: function () { return valor('producto_tipo') === 'Otro'; },
          ejemplo: 'Ej.: lonas, equipo de cómputo, muestras' }),
        casilla('es_devolucion', null, 'Es una devolución de cliente (te pediremos fotos y la revisión del material)', { todo: true })));

      /* Clave de confirmación: llega al correo de quien solicita para confirmar que es suyo (no se pide si ya entró con su clave). */
      var correoConfirmado = '', claveEnviadaA = '';
      function confirmarCorreo() {
        var correoActual = function () { return String(valor('correo') || '').trim().toLowerCase(); };
        var codigo = h('input', { class: 'entrada', id: 'f-codigo', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', placeholder: '6 dígitos', 'aria-label': 'Clave de confirmación' });
        var boton = h('button', { class: 'btn btn-osc', type: 'button' }, 'Enviar clave a mi correo');
        var nota = h('p', { class: 'ayuda' }, 'Para confirmar que eres tú, te enviamos una clave de 6 dígitos a tu correo.');
        var caja = h('div', { class: 'confirmar-correo' }, h('div', { class: 'confirmar-fila' }, codigo, boton), nota);
        function pintarNota(texto, ok) { nota.textContent = texto; nota.style.color = ok ? 'var(--ok)' : ''; nota.style.fontWeight = ok ? '600' : ''; }
        boton.addEventListener('click', function () {
          var correo = correoActual();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { pintarNota('Primero escribe tu correo completo.'); campos.correo.control.focus(); return; }
          U.ocupado(boton, true, 'Enviando…');
          run('enviarCodigoCorreo', correo).then(function (m) {
            claveEnviadaA = correo; U.ocupado(boton, false); boton.textContent = 'Reenviar clave'; pintarNota(m); codigo.focus();
          }).catch(function (e) { U.ocupado(boton, false); pintarNota(e.message); });
        });
        codigo.addEventListener('input', function () {
          var v = codigo.value.replace(/\D/g, '');
          if (v.length < 6) return;
          if (API.verificarCodigoCorreo(correoActual(), v)) { correoConfirmado = correoActual(); pintarNota('✓ Correo confirmado.', true); campos.codigo_correo.error.hidden = true; campos.codigo_correo.wrap.classList.remove('invalido'); }
          else pintarNota('La clave no coincide. Revisa el último correo que te enviamos.');
        });
        var wrap = campo('codigo_correo', 'Clave de confirmación del correo', caja, { req: true, todo: true, aplica: function () { return !cfg.sesion; } });
        campos.codigo_correo.leer = function () { return codigo.value; };
        campos.codigo_correo.validar = function () {
          var correo = correoActual();
          if (correoConfirmado && correoConfirmado === correo) return '';
          if (claveEnviadaA !== correo) return 'Da clic en «Enviar clave a mi correo» y escribe la clave que te llegue.';
          return 'Escribe la clave de 6 dígitos que te enviamos a ' + correo + '.';
        };
        return wrap;
      }

      /* ---------- 2 · Solicitante */
      /* Departamento: lista desplegable con todas las áreas (siempre completa) y «Otra» para escribirla. */
      function selectorArea() {
        var OTRA = '__otra';
        var sel = h('select', { class: 'entrada', 'aria-label': 'Departamento / Área' }, h('option', { value: '' }, 'Selecciona tu departamento…'),
          cfg.areas.map(function (a) { return h('option', { value: a }, a); }), h('option', { value: OTRA }, 'Otra (escribirla)'));
        var otra = h('input', { class: 'entrada', id: 'f-area-otra', maxlength: 80, placeholder: 'Escribe tu departamento', 'aria-label': 'Otro departamento', hidden: true, style: 'margin-top:8px' });
        var caja = h('div', null, sel, otra);
        function poner(v) {
          v = API.nombreArea(v);
          if (!v) { sel.value = ''; otra.hidden = true; return; }
          if (cfg.areas.indexOf(v) >= 0) { sel.value = v; otra.hidden = true; otra.value = ''; }
          else { sel.value = OTRA; otra.hidden = false; otra.value = v; }
        }
        sel.addEventListener('change', function () { otra.hidden = sel.value !== OTRA; if (!otra.hidden) otra.focus(); });
        var wrap = campo('area', 'Departamento / Área', caja, { req: true });
        caja.removeAttribute('id'); sel.id = 'f-area';
        wrap.querySelector('label').setAttribute('for', 'f-area');
        campos.area.leer = function () { return sel.value === OTRA ? otra.value.trim() : sel.value; };
        campos.area.poner = poner;
        poner(prev.area);
        return wrap;
      }
      var pasoSolicitante = h('div', { class: 'paso' }, seccion('Solicitante', 'Quedan ligados al folio. Se recuerdan en este equipo para la próxima vez.',
        texto('solicitante', 'Nombre del solicitante', { req: true, max: 120, auto: 'name', recordar: true }),
        selectorArea(),
        texto('correo', 'Correo', { req: true, tipo: 'email', auto: 'email', recordar: true }),
        texto('telefono', 'Teléfono', { tipo: 'tel', max: 40, auto: 'tel', recordar: true, ayuda: 'Opcional.' }),
        confirmarCorreo()));

      /* ---------- 3 y 4 · ¿De dónde? / ¿A dónde? (misma lógica) */
      /* Lugares frecuentes (CEDIS Planta, CEDIS Cuautitlán…): un clic llena ciudad, Estado, dirección y contacto; se puede corregir después. */
      function lugaresFrecuentes(pre) {
        var lista = cfg.lugares || [];
        if (!lista.length) return null;
        var botones = [];
        var poner = function (k, v) { var c = campos[pre + k]; if (c) { c.control.value = v || ''; c.error.hidden = true; c.wrap.classList.remove('invalido'); } };
        function elegir(l, b) {
          botones.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          if (!l) { ['_ciudad', '_estado', '_direccion', '_link'].forEach(function (k) { poner(k, ''); }); campos[pre + '_ciudad'].control.focus(); return; }
          poner('_ciudad', l.ciudad); poner('_estado', l.estado); poner('_direccion', l.direccion || l.nombre); poner('_link', l.link);
          if (l.contacto) poner('_contacto', l.contacto);
          if (l.telefono) poner('_telefono', l.telefono);
        }
        lista.forEach(function (l) {
          var b = h('button', { type: 'button', class: 'lugar-btn', 'aria-pressed': 'false' }, h('b', null, l.nombre), h('small', null, [l.ciudad, l.estado].filter(Boolean).join(', ')));
          b.addEventListener('click', function () { elegir(l, b); });
          botones.push(b);
        });
        var otro = h('button', { type: 'button', class: 'lugar-btn', 'aria-pressed': 'false' }, h('b', null, 'Otro lugar'), h('small', null, 'Escribir la dirección'));
        otro.addEventListener('click', function () { elegir(null, otro); });
        botones.push(otro);
        return h('div', { class: 'campo todo' }, h('span', { class: 'etiqueta' }, 'Lugares frecuentes'),
          h('div', { class: 'lugares' }, botones), h('p', { class: 'ayuda' }, 'Elige uno y se llenan los datos; puedes corregirlos abajo.'));
      }
      function ubicacion(pre, titulo, intro) {
        return h('div', { class: 'paso' }, seccion(titulo, intro,
          lugaresFrecuentes(pre),
          texto(pre + '_ciudad', 'Ciudad o municipio', { req: true, max: 80 }),
          lista(pre + '_estado', 'Estado', cfg.estados_mx, { req: true }),
          texto(pre + '_direccion', 'Ubicación / dirección', { req: true, max: 300, todo: true }),
          texto(pre + '_link', 'Link de ubicación (opcional)', { tipo: 'url', max: 500, todo: true, modo: 'url' }),
          texto(pre + '_contacto', 'Nombre del contacto', { max: 160 }),
          texto(pre + '_telefono', 'Teléfono del contacto', { tipo: 'tel', max: 40 })));
      }
      var pasoOrigen = ubicacion('origen', '¿De dónde sale?', 'Dónde recogemos el material y con quién nos dirigimos.');
      var pasoDestino = ubicacion('destino', '¿A dónde va?', 'Dónde entregamos el material y con quién nos dirigimos.');
      var avisoRegreso = h('div', { class: 'aviso aviso-info' }, h('p', null, 'Entrega y posterior recolección: al terminar, el material se recoge en este destino y regresa al origen.'));
      pasoDestino.querySelector('.tarjeta').appendChild(avisoRegreso);

      /* ---------- 5 · Tipo de servicio y especificaciones */
      var filas = [];
      var cajaEsp = h('div', { class: 'grupos' });
      var resumenEsp = h('div', { class: 'aviso aviso-info', style: 'margin:10px 0 0' });
      function leerEsp() {
        return filas.map(function (f) {
          return { cantidad: f.cantidad.value.trim(), largo: f.largo.value.trim(), ancho: f.ancho.value.trim(), alto: f.alto.value.trim(),
            peso: f.peso.value.trim(), descripcion: f.descripcion.value.trim() };
        }).filter(function (g) { return Object.keys(g).some(function (k) { return g[k]; }); });
      }
      function validarEsp(lista) {
        if (!lista.length) return 'Agrega al menos un grupo con cantidad y descripción.';
        for (var i = 0; i < lista.length; i++) {
          var g = lista[i], n = numero(g.cantidad), med = [numero(g.largo), numero(g.ancho), numero(g.alto)], kg = numero(g.peso);
          var conMedidas = med.some(function (m) { return !isNaN(m); });
          if (!(n >= 1 && Math.floor(n) === n) || !g.descripcion) return 'Cada grupo necesita cantidad (número entero) y descripción.';
          if ((esPaqueteria() || conMedidas) && !med.every(function (m) { return m > 0; })) return 'Escribe largo, ancho y alto en centímetros' + (esPaqueteria() ? ' (obligatorio en paquetería).' : '.');
          if ((esPaqueteria() || !isNaN(kg)) && !(kg > 0)) return 'Escribe el peso por pieza en kilos' + (esPaqueteria() ? ' (obligatorio en paquetería).' : '.');
        }
        return '';
      }
      function pintarEsp() {
        var total = 0, peso = 0;
        filas.forEach(function (f, i) {
          var n = numero(f.cantidad.value), kg = numero(f.peso.value);
          f.titulo.textContent = 'Grupo ' + (i + 1);
          f.quitar.hidden = filas.length === 1;
          f.total.textContent = n > 0 && kg > 0 ? n + ' × ' + r1(kg) + ' kg = ' + r1(n * kg) + ' kg' : '';
          if (n > 0) total += n;
          if (n > 0 && kg > 0) peso += n * kg;
        });
        mount(resumenEsp, h('p', null, total ? [h('b', null, total + (total === 1 ? ' pieza' : ' piezas')), peso ? ' · peso total ' + r1(peso) + ' kg' : ''] : 'Escribe la cantidad y el peso para ver el total.'));
      }
      function agregarGrupo() {
        var f = {};
        var num = function (key, label, sufijo, extra) {
          f[key] = h('input', Object.assign({ class: 'entrada', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label }, extra || {}));
          f[key].addEventListener('input', pintarEsp);
          return h('label', { class: 'paq-campo' }, h('span', null, label), h('span', { class: 'con-sufijo' }, f[key], h('i', null, sufijo)));
        };
        f.titulo = h('b', { class: 'chico' });
        f.total = h('span', { class: 'grupo-total' });
        f.quitar = h('button', { type: 'button', class: 'liga chico' }, 'Quitar');
        f.descripcion = h('input', { class: 'entrada', type: 'text', maxlength: 200, 'aria-label': 'Descripción del material', placeholder: 'Ej. caja de material promocional' });
        f.fila = h('div', { class: 'paq-fila' },
          h('div', { class: 'paq-cabeza' }, h('span', null, f.titulo, ' ', f.total), f.quitar),
          h('div', { class: 'grupo-medidas' },
            num('cantidad', 'Cantidad', 'pzas', { inputmode: 'numeric' }),
            num('largo', 'Largo', 'cm'), num('ancho', 'Ancho', 'cm'), num('alto', 'Alto', 'cm'),
            num('peso', 'Peso c/u', 'kg'),
            h('label', { class: 'paq-campo grupo-desc' }, h('span', null, 'Descripción del material'), f.descripcion)));
        f.quitar.addEventListener('click', function () { filas.splice(filas.indexOf(f), 1); f.fila.remove(); pintarEsp(); });
        filas.push(f);
        cajaEsp.appendChild(f.fila);
        pintarEsp();
        return f;
      }
      var botonGrupo = h('button', { type: 'button', class: 'btn btn-chico', onclick: function () { agregarGrupo().cantidad.focus(); } }, '+ Agregar otro tipo de paquete o material');
      var seccionEsp = h('section', { class: 'tarjeta paso-tarjeta' }, h('header', { class: 'paso-encabezado' }, h('h2', null, 'Especificaciones'),
        h('p', { class: 'gris' }, 'Si todo es igual (mismas medidas, mismo peso y mismo material), captúralo en un solo renglón con la cantidad. Agrega otro grupo solo cuando cambien las medidas, el peso o el material.')),
        h('div', { class: 'rejilla' },
          campo('especificaciones', 'Cantidad, dimensiones (largo × ancho × alto, en cm) y peso por pieza (kg)',
            h('div', null, cajaEsp, h('div', { style: 'margin-top:10px' }, botonGrupo), resumenEsp), { req: true, todo: true }),
          texto('motivo', 'Descripción general', { area: true, max: 5000, todo: true, ayuda: 'Opcional. Para qué es el envío o indicaciones del material.' })));
      campos.especificaciones.leer = leerEsp;
      campos.especificaciones.validar = validarEsp;
      agregarGrupo();
      var pasoServicio = h('div', { class: 'paso' },
        seccion('¿Cómo lo vas a enviar?', null,
          opciones('forma_envio', 'Tipo de servicio', [['Unidad dedicada', 'Unidad dedicada', 'Camión o camioneta exclusiva para tu envío.'],
            [cfg.paqueteria, 'Paquetería', 'Por mensajería; requiere medidas y peso de cada grupo.']], { req: true })),
        seccionEsp);

      /* ---------- Devolución: solo cuando el movimiento es «Devolución de producto». */
      var estadoCheck = h('div', { class: 'aviso aviso-info', style: 'margin:0' });
      var pasoDevolucion = h('div', { class: 'paso' }, h('section', { class: 'tarjeta paso-tarjeta' },
        h('header', { class: 'paso-encabezado' }, h('h2', null, 'Devolución: pruebas y revisión del material'),
          h('p', { class: 'gris' }, 'Para seguir adelante con la devolución, el material debe cumplir todos los puntos. Si alguno no se cumple, Logística revisará el caso antes de programar la recolección.')),
        h('div', { class: 'rejilla' },
          lista('dev_motivo', 'Motivo de la devolución', cfg.motivos_devolucion, { req: true, aplica: esTipo('devolucion') }),
          h('div'),
          selector('evidencia', 'Pruebas del material (fotos o video)', evidencias, 'image/*,video/*,.pdf',
            { req: true, aplica: function () { return esTipo('devolucion')() && !(op.modificar && (op.modificar.archivos || []).some(function (a) { return a.evidencia; })); }, ayuda: 'Fotos de las tarimas completas, de las etiquetas (lote, tono y calibre) y de cualquier daño. Hasta ' + cfg.max_mb + ' MB cada una.' }),
          casillas('dev_checklist', 'Marca todo lo que SÍ cumple el material', cfg.checklist, { aplica: esTipo('devolucion') }),
          h('div', { class: 'todo' }, estadoCheck))));
      function revisarChecklist() {
        var n = valor('dev_checklist').length, total = cfg.checklist.length;
        estadoCheck.className = 'aviso ' + (n === total ? 'aviso-ok' : 'aviso-alerta');
        mount(estadoCheck, h('p', null, n === total ? '✓ El material cumple todos los puntos: la devolución puede seguir adelante.'
          : 'Cumple ' + n + ' de ' + total + ' puntos. Puedes enviarla, pero Logística la revisará antes de programar.'));
      }

      /* ---------- 6 · ¿Quién absorbe el costo? (+ autorización si es CESANTONI) */
      var infoAut = h('div', { class: 'aviso aviso-alerta todo' },
        h('p', null, h('b', null, 'Autorización de costo. '), 'Cuando Logística tenga la cotización, la plataforma enviará un correo a esta persona con los botones «Autorizar costo» y «Rechazar». Su respuesta queda registrada en el folio.'));
      var pasoCosto = h('div', { class: 'paso' }, seccion('¿Quién absorbe el costo del servicio?', null,
        opciones('costo_absorbe', '¿Quién absorbe el costo?', cfg.costos.map(function (c) { return [c, c, '']; }), { req: true }),
        texto('costo_detalle', 'Especificar quién absorbe el costo', { req: true, max: 120, todo: true, aplica: function () { return valor('costo_absorbe') === 'Otro'; } }),
        infoAut,
        texto('aut_correo', 'Correo de la persona que autoriza el costo', { req: true, correo: true, tipo: 'email', max: 160, todo: true, aplica: cesantoni,
          ejemplo: 'gerente@cesantoni.com.mx' })));

      /* ---------- 7 · Documentación del servicio */
      var infoAutDoc = h('div', { class: 'aviso aviso-info todo' });
      var pasoDocs = h('div', { class: 'paso' },
        h('section', { class: 'tarjeta paso-tarjeta' }, h('header', { class: 'paso-encabezado' }, h('h2', null, 'Documentación del servicio'),
          h('p', { class: 'gris' }, 'Todo queda en el mismo folio: solicitud → cotización → autorización → salida. Si aún no tienes algún documento, lo agregas después desde «Mis solicitudes».')),
          h('div', { class: 'docs' },
            h('div', { class: 'doc-bloque' }, h('h3', null, 'Cotización'),
              selector('cotizacion', null, cotizaciones, ARCHIVOS, { boton: 'Adjuntar cotización' }),
              selector('cotizacion_correo', 'Correo de cotización', correosCotizacion, ARCHIVOS, { boton: 'Adjuntar correo', ayuda: '.eml, .msg, PDF o captura' })),
            h('div', { class: 'doc-bloque' }, h('h3', null, 'Autorización'), infoAutDoc,
              selector('autorizacion', 'Documento externo', autorizaciones, ARCHIVOS, { boton: 'Adjuntar autorización' })),
            h('div', { class: 'doc-bloque' }, h('h3', null, 'Salida'),
              selector('salida', null, salidas, ARCHIVOS, { boton: 'Adjuntar salida', ayuda: 'Si aún no la tienes, la agregas después.' }))),
          h('p', { class: 'gris chico centro', style: 'margin:14px 0 0' }, 'Todos son opcionales · PDF, imagen, Excel, Word o correo de hasta ' + cfg.max_mb + ' MB.')));

      /* ---------- 8 · Fechas tentativas y condiciones */
      var aviso48 = h('div', { class: 'aviso aviso-mal todo', role: 'alert' },
        h('p', null, h('b', null, 'Importante: '), AVISO_48),
        h('p', { class: 'chico' }, 'Tu solicitud se registrará como Urgente y requerirá autorización.'));
      var pasoFechas = h('div', { class: 'paso' },
        h('section', { class: 'tarjeta paso-tarjeta' }, h('header', { class: 'paso-encabezado' }, h('h2', null, 'Fechas tentativas'),
          h('p', { class: 'gris' }, 'Cuándo se recoge y cuándo se entrega. Logística confirma la fecha definitiva.')),
          h('div', { class: 'rejilla' },
            texto('fecha_requerida', 'Fecha tentativa de recolección', { req: true, tipo: 'date', min: cfg.hoy, aplica: function () { return !fechaAbierta(); } }),
            texto('fecha_entrega', 'Fecha tentativa de entrega', { req: true, tipo: 'date', min: cfg.hoy, aplica: function () { return !fechaAbierta(); } }),
            casilla('fecha_abierta', null, 'Fecha abierta (aún no hay fecha definida)', { todo: true }),
            texto('fecha_recoleccion', 'Fecha tentativa de recolección posterior (regreso)', { req: true, tipo: 'date', min: cfg.hoy,
              aplica: function () { return esTipo('entrega_recoleccion')() && !fechaAbierta() && valor('recoleccion_abierta') !== 'Sí'; } }),
            casilla('regresa', null, 'El material regresa después (se recoge en el destino y vuelve al origen)', { todo: true, aplica: function () { return !esTipo('devolucion')(); } }),
            casilla('recoleccion_abierta', ' ', 'Recolección posterior con fecha abierta', { aplica: function () { return esTipo('entrega_recoleccion')() && !fechaAbierta(); } }),
            aviso48,
            texto('aut_correo_gerente', 'Correo del Gerente de Área que autoriza', { req: true, correo: true, tipo: 'email', max: 160, todo: true,
              aplica: function () { return fueraDeTiempo() && !cesantoni(); } }),
            h('div', { class: 'condiciones todo' }, h('p', null, cfg.condiciones)),
            casilla('horario', 'Cita', 'Para recoger o entregar se requiere cita', { ayuda: 'Logística te avisará qué día se puede hacer la cita o cuándo agendarla.' }),
            texto('observaciones', 'Observaciones', { area: true, max: 2000, filas: 2, ayuda: 'Opcional. Horarios del lugar, maniobras, accesos.' }))));

      /* ---------- 9 · Confirmación */
      var cajaResumen = h('div');
      var pasoResumen = h('div', { class: 'paso' }, cajaResumen,
        h('section', { class: 'tarjeta' }, h('div', { class: 'rejilla' },
          casilla('acepta_condiciones', null, 'He leído y acepto las condiciones de la solicitud.', { req: true, todo: true }))));

      var feedback = h('div');
      var enviar = h('button', { class: 'btn btn-pri', type: 'submit' }, 'Enviar solicitud');
      var cancelar = function () { if (op.modificar) seguimiento(op.modificar); else if (cfg.sesion) misSolicitudes(); else inicio(); };
      if (op.modificar) enviar.textContent = 'Guardar cambios';

      var PASOS = [
        { corto: 'Qué envías', titulo: '¿Qué envías?', el: pasoQue },
        { corto: 'Solicitante', titulo: 'Solicitante', el: pasoSolicitante },
        { corto: 'Origen', titulo: '¿De dónde?', el: pasoOrigen },
        { corto: 'Destino', titulo: '¿A dónde?', el: pasoDestino },
        { corto: 'Servicio', titulo: 'Tipo de servicio y especificaciones', el: pasoServicio },
        { corto: 'Devolución', titulo: 'Devolución', el: pasoDevolucion, aplica: esTipo('devolucion') },
        { corto: 'Costo', titulo: '¿Quién absorbe el costo?', el: pasoCosto },
        { corto: 'Documentos', titulo: 'Documentación', el: pasoDocs },
        { corto: 'Fechas', titulo: 'Fechas tentativas', el: pasoFechas },
        { corto: 'Confirmar', titulo: 'Confirmación', el: pasoResumen }
      ];
      var paso = 0;
      var avance = h('div', { class: 'avance', 'aria-live': 'polite' });
      var anterior = h('button', { class: 'btn', type: 'button' }, '← Anterior');
      var siguiente = h('button', { class: 'btn btn-pri', type: 'button' }, 'Siguiente →');
      function activos() { return PASOS.filter(function (x) { return !x.aplica || x.aplica(); }); }

      /* Muestra u oculta lo que depende de otras respuestas. */
      function actualizar() {
        Object.keys(campos).forEach(function (k) { var c = campos[k]; if (c.aplica) c.wrap.hidden = !c.aplica(); });
        seccionEsp.hidden = !valor('forma_envio');
        avisoRegreso.hidden = !esTipo('entrega_recoleccion')();
        infoAut.hidden = !cesantoni();
        var fuera = fueraDeTiempo();
        aviso48.hidden = !fuera;
        var correoAut = cesantoni() ? valor('aut_correo') : (fuera ? valor('aut_correo_gerente') : '');
        mount(infoAutDoc, h('p', null, cesantoni() || fuera
          ? ['Esta solicitud requiere autorización', cesantoni() ? ' del costo (lo absorbe CESANTONI)' : ' del Gerente de Área (menos de 48 horas)',
            '. El resultado aparecerá aquí como ', h('b', null, 'Pendiente de autorización'), correoAut ? ' hasta que responda ' + correoAut + '.' : '.']
          : 'Esta solicitud no requiere autorización de costo. Si tienes una autorización por escrito, puedes adjuntarla.'));
        enviar.disabled = activos()[paso] && activos()[paso].el === pasoResumen && valor('acepta_condiciones') !== 'Sí';
      }

      function mostrar(i) {
        var lista = activos();
        paso = Math.max(0, Math.min(i, lista.length - 1));
        PASOS.forEach(function (x) { x.el.hidden = x !== lista[paso]; });
        var ultimo = paso === lista.length - 1;
        /* Línea de pasos: los terminados se pueden abrir con un clic. */
        mount(avance, h('div', { class: 'avance-txt' }, h('b', null, 'Paso ' + (paso + 1) + ' de ' + lista.length), ' · ' + lista[paso].titulo),
          h('ol', { class: 'stepper' }, lista.map(function (x, k) {
            var estado = k < paso ? 'hecho' : k === paso ? 'actual' : '';
            var punto = h('span', { class: 'punto', 'aria-hidden': 'true' }, k < paso ? '✓' : String(k + 1));
            var etq = h('span', { class: 'etq' }, x.corto);
            return h('li', { class: estado, 'aria-current': k === paso ? 'step' : null },
              k < paso ? h('button', { type: 'button', title: 'Volver a ' + x.titulo, onclick: function () { mostrar(k); } }, punto, etq) : h('span', { class: 'paso-nodo' }, punto, etq));
          })));
        anterior.hidden = paso === 0;
        anterior.textContent = ultimo ? '← Editar' : '← Anterior';
        siguiente.hidden = ultimo;
        enviar.hidden = !ultimo;
        if (lista[paso].el === pasoServicio && filas.length === 1 && !filas[0].descripcion.value) {
          filas[0].descripcion.value = valor('producto_tipo') === 'Otro' ? valor('producto_otro') : valor('producto_tipo');
        }
        if (ultimo) pintarResumen();
        actualizar();
        if (!ultimo && !claveCuenta) mount(feedback);
        window.scrollTo(0, 0);
      }
      /* Revisa los campos (de un paso o de todos). Devuelve los datos y los campos con error. */
      function revisar(dentroDe) {
        actualizar();
        var datos = {}, faltan = [];
        Object.keys(campos).forEach(function (k) {
          var c = campos[k], v = c.archivos ? c.archivos : (c.leer ? c.leer() : valor(k)), msg = '';
          var aplica = !c.aplica || c.aplica();
          if (!c.archivos) datos[k] = aplica ? v : (c.leer ? [] : '');
          if (dentroDe && !dentroDe.contains(c.wrap)) return;
          if (!aplica) msg = '';
          else if (c.validar) msg = c.validar(v);
          else if (c.req && (!v || (Array.isArray(v) && !v.length))) msg = c.archivos ? 'Agrega al menos una foto o video.' : (k === 'acepta_condiciones' ? 'Marca la casilla para enviar la solicitud.' : 'Obligatorio.');
          else if ((k === 'correo' || c.correo) && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Escribe un correo válido.';
          else if (/_link$/.test(k) && v && !/^https?:\/\/\S+$/i.test(v)) msg = 'Pega el link completo (empieza con https://).';
          else if (k === 'fecha_requerida' && v < cfg.hoy) msg = 'La fecha ya pasó.';
          else if (k === 'fecha_entrega' && datos.fecha_requerida && v < datos.fecha_requerida) msg = 'Debe ser igual o posterior a la recolección.';
          else if (k === 'fecha_recoleccion' && datos.fecha_entrega && v < datos.fecha_entrega) msg = 'Debe ser igual o posterior a la entrega.';
          c.error.textContent = msg; c.error.hidden = !msg;
          c.wrap.classList.toggle('invalido', !!msg);
          if (msg) faltan.push(c.wrap);
        });
        datos.tipo = tipoActual();
        delete datos.es_devolucion; delete datos.regresa;
        datos.aut_correo = cesantoni() ? datos.aut_correo : datos.aut_correo_gerente;
        delete datos.aut_correo_gerente;
        datos.especificaciones = datos.especificaciones || [];
        return { datos: datos, faltan: faltan };
      }
      function enfocar(wrap) {
        wrap.scrollIntoView({ block: 'center' });
        var ctl = wrap.querySelector('input:not([type=hidden]), select, textarea');
        if (ctl) ctl.focus({ preventScroll: true });
      }
      function irA(el) { var lista = activos(); for (var k = 0; k < lista.length; k++) if (lista[k].el === el) { mostrar(k); return; } }

      /* Resumen antes de enviar, con «Editar» en cada bloque. */
      function pintarResumen() {
        var d = revisar(document.createElement('div')).datos, tipo = tipoActual(), fuera = fueraDeTiempo(); // solo lee los datos
        var nombreTipo = (cfg.tipos.filter(function (t) { return t[0] === tipo; })[0] || ['', tipo])[1] + (tipo === 'otro' && d.tipo_otro ? ': ' + d.tipo_otro : '');
        var dia = function (v) { return v ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) : ''; };
        var esp = d.especificaciones.map(function (g) {
          var n = numero(g.cantidad), kg = numero(g.peso);
          return g.cantidad + ' × ' + g.descripcion + (g.largo ? ' · ' + g.largo + ' × ' + g.ancho + ' × ' + g.alto + ' cm' : '') +
            (kg > 0 ? ' · ' + kg + ' kg c/u' + (n > 1 ? ' (' + r1(n * kg) + ' kg)' : '') : '');
        });
        var pesoTotal = d.especificaciones.reduce(function (t, g) { var n = numero(g.cantidad), kg = numero(g.peso); return t + (n > 0 && kg > 0 ? n * kg : 0); }, 0);
        var docs = function (l) { return l.length ? l.length + (l.length === 1 ? ' archivo' : ' archivos') : ''; };
        var bloque = function (titulo, pasoEl, filasR) {
          return h('section', { class: 'tarjeta resumen' },
            h('div', { class: 'cabecera' }, h('h2', { style: 'margin:0' }, titulo),
              h('button', { class: 'liga chico', type: 'button', onclick: function () { irA(pasoEl); } }, 'Editar')),
            h('dl', { class: 'datos', style: 'margin-top:12px' }, filasR.filter(function (x) { return x[1]; }).map(function (x) {
              return h('div', null, h('dt', null, x[0]), h('dd', { style: 'white-space:pre-wrap' }, x[1]));
            })));
        };
        var lugar = function (pre) { return [[d[pre + '_ciudad'], d[pre + '_estado']].filter(Boolean).join(', '), d[pre + '_direccion'], d[pre + '_contacto'] ? 'Contacto: ' + [d[pre + '_contacto'], d[pre + '_telefono']].filter(Boolean).join(' · ') : ''].filter(Boolean).join('\n'); };
        mount(cajaResumen,
          h('section', { class: 'tarjeta' }, h('h2', null, 'Revisa tu solicitud'),
            h('p', { class: 'gris chico', style: 'margin:0' }, 'Confirma que todo esté correcto. Si algo falta, usa «Editar».')),
          fuera ? h('div', { class: 'aviso aviso-mal', role: 'alert' }, h('p', null, h('b', null, 'Importante: '), AVISO_48)) : null,
          bloque('Qué envías', pasoQue, [['Qué envías', d.producto_tipo === 'Otro' ? d.producto_otro : d.producto_tipo], ['Movimiento', nombreTipo],
            ['Devolución', tipo === 'devolucion' ? d.dev_motivo + ' · ' + (d.dev_checklist.length === cfg.checklist.length ? 'cumple todos los puntos' : 'no cumple todos los puntos') : '']]),
          bloque('Solicitante', pasoSolicitante, [['Nombre', d.solicitante], ['Departamento', d.area], ['Correo', d.correo], ['Teléfono', d.telefono]]),
          bloque('Origen y destino', pasoOrigen, [['¿De dónde?', lugar('origen')], ['¿A dónde?', lugar('destino')]]),
          bloque('Servicio y especificaciones', pasoServicio, [['Tipo de servicio', d.forma_envio], ['Cantidad, dimensiones y peso', esp.join('\n')],
            ['Peso total', pesoTotal ? r1(pesoTotal) + ' kg' : ''], ['Descripción general', d.motivo]]),
          bloque('Costo y autorización', pasoCosto, [['¿Quién absorbe el costo?', d.costo_absorbe + (d.costo_detalle ? ': ' + d.costo_detalle : '')],
            ['Autorización', d.aut_correo ? 'Pendiente de autorización · se enviará a ' + d.aut_correo : 'No requiere']]),
          bloque('Documentación', pasoDocs, [['Cotización', cotizaciones.length || correosCotizacion.length ? 'Adjunta (' + (cotizaciones.length + correosCotizacion.length) + ')' : 'Pendiente'],
            ['Autorización adicional', docs(autorizaciones)], ['Salida', docs(salidas) || 'Pendiente'], ['Otros archivos', docs(generales)],
            ['Evidencias', tipo === 'devolucion' ? docs(evidencias) : ''], ['Folio', d.referencia], ['Factura', d.cliente]]),
          bloque('Fechas tentativas', pasoFechas, [['Recolección', d.fecha_abierta === 'Sí' ? 'Fecha abierta' : dia(d.fecha_requerida)],
            ['Entrega', d.fecha_abierta === 'Sí' ? 'Fecha abierta' : dia(d.fecha_entrega)],
            ['Recolección posterior', tipo === 'entrega_recoleccion' ? (d.fecha_abierta === 'Sí' || d.recoleccion_abierta === 'Sí' ? 'Fecha abierta' : dia(d.fecha_recoleccion)) : ''],
            ['Tipo de solicitud', fuera ? 'Urgente' : 'Programado'], ['Requiere cita', d.horario], ['Observaciones', d.observaciones]]),
          h('div', { class: 'condiciones' }, h('p', null, cfg.condiciones)));
      }

      anterior.addEventListener('click', function () { mostrar(paso - 1); });
      siguiente.addEventListener('click', function () {
        var r = revisar(activos()[paso].el);
        if (r.faltan.length) { enfocar(r.faltan[0]); return; }
        if (activos()[paso + 1] && activos()[paso + 1].el === pasoResumen) {
          /* Antes del resumen se revisa todo el formulario (menos la aceptación, que va en el resumen). */
          var todo = revisar(null), pend = todo.faltan.filter(function (w) { return !pasoResumen.contains(w); });
          campos.acepta_condiciones.error.hidden = true; campos.acepta_condiciones.wrap.classList.remove('invalido');
          if (pend.length) { var k = 0, lista = activos(); for (; k < lista.length; k++) if (lista[k].el.contains(pend[0])) break; mostrar(k); enfocar(pend[0]); return; }
        }
        mostrar(paso + 1);
      });

      var form = h('form', { novalidate: true, class: 'asistente' },
        h('div', { class: 'asistente-cabeza' }, h('h1', null, op.modificar ? 'Modificar ' + op.modificar.folio : 'Nueva solicitud'),
          h('p', { class: 'gris' }, 'Te guiamos paso a paso. Al final revisas todo antes de enviarlo.')),
        op.copia ? h('div', { class: 'aviso aviso-info' }, h('p', null, 'Nueva solicitud con los datos de ' + op.copia.folio + '. Revisa las fechas y lo que cambió antes de enviarla; los archivos no se copian.')) : null,
        op.modificar ? h('div', { class: 'aviso aviso-info' }, h('p', null, 'Estás modificando ' + op.modificar.folio + '. Al guardar, Logística recibe un aviso con los cambios. Los archivos que ya subiste se conservan.')) : null,
        avance,
        pasoQue, pasoSolicitante, pasoOrigen, pasoDestino, pasoServicio, pasoDevolucion, pasoCosto, pasoDocs, pasoFechas, pasoResumen,
        feedback,
        h('div', { class: 'acciones pasos-acciones' }, h('button', { class: 'liga', type: 'button', onclick: cancelar }, 'Cancelar'), h('span', { class: 'espacio' }),
          anterior, siguiente, enviar));
      if (cfg.sesion) {
        campos.correo.control.value = cfg.sesion.correo;
        campos.correo.control.readOnly = true;
        campos.correo.wrap.querySelector('label').appendChild(h('span', { class: 'gris' }, ' (tu correo de acceso)'));
      }

      form.addEventListener('change', actualizar);
      form.addEventListener('input', function (ev) { if (ev.target.type === 'date') actualizar(); });
      campos.dev_checklist.control.addEventListener('change', revisarChecklist);
      revisarChecklist();
      if (base) precargar(base);
      mostrar(0);

      /* Llena el formulario con los datos de un folio (para modificarlo o copiarlo). */
      function precargar(s) {
        var poner = function (k, v) { var c = campos[k]; if (!c || v === undefined || v === null) return; if (c.poner) c.poner(v); else if (c.casilla) c.casilla.checked = v === 'Sí'; else if (c.grupo) marcar(k, v); else c.control.value = v; };
        poner('producto_tipo', s.producto_tipo); poner('producto_otro', s.producto_otro);
        poner('es_devolucion', s.tipo === 'devolucion' ? 'Sí' : ''); poner('regresa', s.recoleccion === 'Sí' && s.tipo !== 'devolucion' ? 'Sí' : '');
        ['solicitante', 'area', 'telefono', 'motivo', 'observaciones', 'dev_motivo', 'costo_detalle', 'horario'].forEach(function (k) { poner(k, s[k]); });
        ['origen', 'destino'].forEach(function (p) {
          poner(p + '_direccion', s[p + '_direccion'] || [s[p + '_nombre'], s[p + '_ciudad']].filter(Boolean).join(', '));
          ['_ciudad', '_estado', '_link', '_contacto', '_telefono'].forEach(function (x) { poner(p + x, s[p + x]); });
        });
        poner('forma_envio', s.forma_envio === 'Camión / unidad' ? 'Unidad dedicada' : s.forma_envio);
        poner('costo_absorbe', s.costo_absorbe);
        if (s.aut_correo) poner(s.costo_absorbe === cfg.costo_autoriza ? 'aut_correo' : 'aut_correo_gerente', s.aut_correo);
        if (op.modificar) {
          ['fecha_requerida', 'fecha_entrega', 'fecha_recoleccion'].forEach(function (k) { poner(k, s[k]); });
          poner('fecha_abierta', s.fecha_abierta); poner('recoleccion_abierta', s.recoleccion_abierta);
        }
        String(s.dev_checklist || '').split('\n').forEach(function (x) { var el = campos.dev_checklist.control.querySelector('input[value="' + x.replace(/"/g, '\\"') + '"]'); if (el) el.checked = true; });
        var arts = [].concat(s.articulos || []);
        if (arts.length) {
          filas.slice().forEach(function (f) { f.fila.remove(); }); filas.length = 0;
          arts.forEach(function (a) {
            var f = agregarGrupo();
            f.cantidad.value = a.cantidad || ''; f.largo.value = a.largo || ''; f.ancho.value = a.ancho || ''; f.alto.value = a.alto || ''; f.peso.value = a.peso || '';
            f.descripcion.value = a.descripcion || a.producto || '';
          });
          pintarEsp();
        }
        revisarChecklist();
      }

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (activos()[paso].el !== pasoResumen) { siguiente.click(); return; }
        var r = revisar(null), datos = r.datos, faltan = r.faltan;
        if (faltan.length) {
          var lista = activos();
          for (var k = 0; k < lista.length; k++) if (lista[k].el.contains(faltan[0])) { mostrar(k); break; }
          mount(feedback, h('div', { class: 'aviso aviso-mal', role: 'alert' }, h('p', null, faltan.length === 1 ? 'Revisa el campo marcado en rojo.' : 'Revisa los ' + faltan.length + ' campos marcados en rojo.')));
          enfocar(faltan[0]);
          return;
        }
        try { localStorage.setItem(GUARDADO, JSON.stringify({ solicitante: datos.solicitante, area: datos.area, correo: datos.correo, telefono: datos.telefono })); } catch (e) { /* sin almacenamiento */ }
        var clase = function (lista, c) { return lista.map(function (f) { return { file: f, clase: c }; }); };
        var porSubir = (datos.tipo === 'devolucion' ? clase(evidencias, 'evidencia') : [])
          .concat(clase(cotizaciones, 'cotizacion'), clase(correosCotizacion, 'cotizacion'), clase(autorizaciones, 'autorizacion'), clase(salidas, 'salida'), clase(generales, ''));
        U.ocupado(enviar, true, op.modificar ? 'Guardando…' : 'Enviando…');
        if (op.modificar) {
          acceso = op.modificar.folio;
          run('modificarSolicitud', op.modificar.folio, datos).then(function (r) {
            return subirTodos(porSubir, enviar).then(function (ultima) { U.toast('Cambios guardados. Logística recibió el aviso.'); seguimiento(ultima || r); });
          }).catch(function (e) { U.ocupado(enviar, false); mount(feedback, h('div', { class: 'aviso aviso-mal', role: 'alert' }, h('p', null, e.message))); });
          return;
        }
        run('crearSolicitud', datos, { clave: claveCuenta ? claveCuenta.value : '' }).then(function (res) {
          cfg.sesion = { correo: datos.correo };
          acceso = res.folio;
          return subirTodos(porSubir, enviar).then(function (ultima) {
            /* Con la cotización ya subida, la autorización de costo sale sola a quien autoriza. */
            if (enviar) enviar.textContent = 'Enviando autorización…';
            return run('enviarAutorizacionAuto', res.folio).catch(function () { return null; }).then(function (envio) { confirmacion(ultima || res.solicitud, res.clave, envio); });
          });
        }).catch(function (e) {
          U.ocupado(enviar, false);
          if (e.cuentaExiste) {
            /* El correo ya tiene acceso: pide su clave aquí mismo y se vuelve a enviar. */
            claveCuenta = h('input', { class: 'entrada', id: 'f-clave-cuenta', type: 'password', autocomplete: 'current-password' });
            var olvide = h('button', { class: 'liga chico', type: 'button' }, 'Olvidé mi clave');
            olvide.addEventListener('click', function () { run('recuperarClave', datos.correo).then(function (m) { U.toast(m); }); });
            mount(feedback, h('div', { class: 'aviso aviso-alerta', role: 'alert' }, h('p', null, e.message),
              h('div', { class: 'campo', style: 'max-width:320px;margin:8px 0' }, h('label', { for: 'f-clave-cuenta' }, 'Tu clave'), claveCuenta),
              h('p', null, olvide)));
            claveCuenta.focus();
            return;
          }
          mount(feedback, h('div', { class: 'aviso aviso-mal', role: 'alert' }, h('p', null, e.message)));
        });
      });
      mount(main, form);
    }

    /* lista: [{file, clase}] */
    function subirTodos(lista, btn) {
      var ultima = null, fallos = [];
      return lista.reduce(function (p, item, i) {
        return p.then(function () {
          if (btn) btn.textContent = 'Subiendo archivo ' + (i + 1) + ' de ' + lista.length + '…';
          return U.leerArchivo(item.file, cfg.max_mb).then(function (a) { a.clase = item.clase; return run('subirArchivo', acceso, a); })
            .then(function (s) { ultima = s; }).catch(function (e) { fallos.push(item.file.name + ': ' + e.message); });
        });
      }, Promise.resolve()).then(function () {
        if (fallos.length) U.toast('No se subieron: ' + fallos.join(' · '), true);
        return ultima;
      });
    }

    function confirmacion(s, clave, envio) {
      arribaSesion();
      mount(main, h('section', { class: 'tarjeta', style: 'text-align:center;padding:36px 22px' },
        h('p', { class: 'gris', style: 'margin:0' }, 'Tu folio es'),
        h('div', { class: 'folio', style: 'font-size:40px;margin:6px 0 14px' }, s.folio),
        h('h1', null, 'Solicitud recibida'),
        h('p', { class: 'gris' }, 'Te enviamos un correo con tu folio. Logística la revisará y te avisará cada avance.'),
        envio ? h('div', { class: 'aviso ' + (envio.estado === 'enviado' ? 'aviso-ok' : 'aviso-alerta'), style: 'text-align:left;max-width:460px;margin:14px auto 0' },
          h('p', null, envio.estado === 'enviado' ? 'Enviamos la solicitud de autorización de costo a ' + envio.para + '. Te avisaremos cuando responda.'
            : 'No se pudo enviar la solicitud de autorización a ' + envio.para + '. Logística la reenviará desde el panel.')) : null,
        clave ? h('div', { class: 'aviso aviso-info', style: 'text-align:left;max-width:460px;margin:14px auto 0' },
          h('p', null, h('b', null, 'Tu acceso para consultar tus solicitudes')),
          h('p', null, 'Correo: ', h('b', null, cfg.sesion.correo), h('br'), 'Clave: ', h('b', { style: 'font-size:18px;letter-spacing:1px' }, clave)),
          h('p', { class: 'chico' }, 'También te la enviamos por correo. Guárdala: la usarás para entrar a «Mis solicitudes».')) : null,
        h('div', { class: 'acciones', style: 'justify-content:center;margin-top:18px' },
          h('button', { class: 'btn btn-pri', type: 'button', onclick: function () { seguimiento(s); } }, 'Ver seguimiento'),
          h('button', { class: 'btn', type: 'button', onclick: formulario }, 'Hacer otra solicitud'))));
    }

    /* ---------------------------------------------------------------- seguimiento */
    function abrir(folio) {
      PARAMS.folio = '';
      run('consultarSolicitud', folio).then(function (s) {
        acceso = s.folio;
        seguimiento(s);
      }).catch(function (e) {
        U.toast(e.message, true);
        if (cfg.sesion && !e.sesion) misSolicitudes(); else { cfg.sesion = null; inicio(); }
      });
    }

    function seguimiento(s) {
      arribaSesion();
      var abierta = cfg.abiertos.indexOf(s.estado) >= 0;
      var corto = function (pre) { return s[pre + '_nombre'] ? s[pre + '_nombre'] + ', ' + s[pre + '_ciudad'] : s[pre + '_direccion']; };
      var datos = [
        ['Qué envías', s.producto], ['Movimiento', s.tipo_nombre], ['Tipo de servicio', s.forma_envio], ['Tipo de solicitud', s.prioridad]]
        .concat(U.fechas(s), [
        ['¿De dónde?', corto('origen')], ['¿A dónde?', corto('destino')],
        ['Fecha programada', s.fecha_programada ? U.dia(s.fecha_programada) : ''], ['Folio CSTEXT', s.folio_cstext],
        ['Transportista', s.transportista], ['Guía o referencia', s.guia]
      ]).filter(function (d) { return d[1]; });

      var partes = [h('section', { class: 'tarjeta' },
        h('div', { class: 'cabecera' },
          h('div', null, h('div', { class: 'folio' }, s.folio), h('p', { class: 'gris chico', style: 'margin:6px 0 0' }, 'Creada el ' + U.dia(s.creada) + ' por ' + s.solicitante)),
          h('div', { class: 'acciones' }, U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('span', { class: 'pill urgente' }, 'Urgente') : null)),
        U.pasos(cfg, s.estado),
        h('dl', { class: 'datos', style: 'margin-top:16px' }, datos.map(function (d) { return h('div', null, h('dt', null, d[0]), h('dd', null, d[1])); })))];

      if (s.estado === 'informacion') partes.push(h('div', { class: 'aviso aviso-alerta' }, h('p', null, h('b', null, 'Logística necesita más información. '), 'Lee el último mensaje y responde abajo.')));
      if (s.tipo === 'devolucion') partes.push(U.devolucion(cfg, s));
      if (s.paq_total && !(s.articulos || []).some(function (a) { return a.largo || a.peso; })) partes.push(U.paquetes(s));

      var hilo = h('ul', { class: 'hilo' }, s.seguimiento.slice().reverse().map(function (m) {
        return h('li', null, h('div', { class: 'quien' }, U.dia(m.fecha) + ' · ' + m.autor), h('div', { class: 'texto' }, m.mensaje));
      }));
      var mensajeBox = null;
      if (abierta) {
        var txt = h('textarea', { class: 'entrada', rows: 3, maxlength: 2000, placeholder: 'Escribe un mensaje para Logística…' });
        var btn = h('button', { class: 'btn btn-osc btn-chico', type: 'submit' }, 'Enviar mensaje');
        mensajeBox = h('form', { style: 'margin-bottom:16px' }, txt, h('div', { class: 'acciones', style: 'margin-top:8px' }, btn));
        mensajeBox.addEventListener('submit', function (ev) {
          ev.preventDefault();
          if (!txt.value.trim()) return;
          U.ocupado(btn, true, 'Enviando…');
          run('agregarMensaje', acceso, txt.value).then(function (r) { U.toast('Mensaje enviado a Logística.'); seguimiento(r); })
            .catch(function (e) { U.ocupado(btn, false); U.toast(e.message, true); });
        });
      }
      partes.push(h('section', { class: 'tarjeta' }, h('h2', null, 'Seguimiento'), mensajeBox, hilo));

      /* Expediente: cotización, autorización, salida y otros documentos del mismo folio. */
      partes.push(U.expediente(s, abierta ? function (clase, lista) {
        U.toast('Subiendo ' + lista.length + ' archivo(s)…');
        subirTodos(lista.map(function (f) { return { file: f, clase: clase }; })).then(function (r) { if (r) { U.toast('Archivos agregados al folio.'); seguimiento(r); } });
      } : null));

      partes.push(h('section', { class: 'tarjeta' }, h('h2', null, 'Detalle de la solicitud'),
        h('dl', { class: 'datos' }, U.detalle(s).filter(function (d) { return d[1]; }).map(function (d) {
          return h('div', null, h('dt', null, d[0]), h('dd', { style: 'font-weight:500;white-space:pre-wrap' }, d[1]));
        }))));

      /* Modificar mientras está «Recibida»; después, la leyenda y la opción de una nueva solicitud. */
      if (s.estado === 'recibida' && !s.aut_enviada) {
        partes.splice(1, 0, h('div', { class: 'acciones', style: 'margin:-6px 0 14px' }, h('button', { class: 'btn btn-chico', type: 'button', onclick: function () {
          abrirModificacion(s.folio).catch(function (e) { U.toast(e.message, true); });
        } }, '✎ Modificar solicitud'), h('span', { class: 'gris chico' }, 'Puedes cambiarla mientras Logística no la ponga en revisión.')));
      } else if (abierta) {
        partes.splice(1, 0, h('p', { class: 'chico gris', style: 'margin:-6px 0 14px' }, 'Este folio ya no admite modificaciones. ',
          h('button', { class: 'liga chico', type: 'button', onclick: function () { abrirModificacion(s.folio).catch(function (e) { U.toast(e.message, true); }); } }, '¿Necesitas un cambio?')));
      }
      if (cfg.cancelables.indexOf(s.estado) >= 0) {
        /* Confirmación en la misma página (sin ventanas emergentes). */
        var cancelar = h('button', { class: 'liga', type: 'button' }, 'Cancelar esta solicitud');
        var motivoCancel = h('textarea', { class: 'entrada', id: 'cancel-motivo', rows: 2, maxlength: 500, placeholder: '¿Por qué la cancelas? Logística recibirá el aviso.' });
        var confirmar = h('button', { class: 'btn btn-chico', type: 'button' }, 'Sí, cancelar la solicitud');
        var cajaCancel = h('div', { class: 'tarjeta', hidden: true }, h('label', { for: 'cancel-motivo', class: 'chico', style: 'font-weight:600' }, 'Motivo de la cancelación'),
          motivoCancel, h('div', { class: 'acciones', style: 'margin-top:8px' }, confirmar,
            h('button', { class: 'liga chico', type: 'button', onclick: function () { cajaCancel.hidden = true; cancelar.hidden = false; } }, 'No cancelar')));
        cancelar.addEventListener('click', function () { cajaCancel.hidden = false; cancelar.hidden = true; motivoCancel.focus(); });
        confirmar.addEventListener('click', function () {
          U.ocupado(confirmar, true, 'Cancelando…');
          run('cancelarSolicitud', acceso, motivoCancel.value).then(function (r) { U.toast('Solicitud cancelada.'); seguimiento(r); })
            .catch(function (e) { U.ocupado(confirmar, false); U.toast(e.message, true); });
        });
        partes.push(h('p', { class: 'chico' }, cancelar), cajaCancel);
      }
      mount(main, partes);
    }

    init();
  })();
