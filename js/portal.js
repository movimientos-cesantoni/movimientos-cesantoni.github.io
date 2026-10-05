/* Formulario y seguimiento de solicitudes (Liga 1). Misma interfaz que la versión probada, con acceso de Firebase. */
import * as API from './servidor.js?v=4';
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
        inicio();
      }).catch(function (e) { mount(main, h('div', { class: 'aviso aviso-mal' }, h('p', null, e.message))); });
    }

    function arriba(contenido) { mount(document.getElementById('arriba'), contenido || null); }

    /* ---------------------------------------------------------------- portada */
    function inicio() {
      acceso = null;
      arriba(null);
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
      mount(main, h('div', { class: 'portada' },
        h('section', { class: 'tarjeta' },
          h('h1', null, '¿Necesitas mover algo?'),
          h('p', { class: 'gris' }, 'Pide aquí devoluciones, recolecciones, envíos o camiones a Logística. Cada solicitud recibe un folio y te avisamos por correo cada avance.'),
          h('ul', { class: 'lista-tipos' }, cfg.tipos.map(function (t) { return h('li', null, h('b', null, t[1]), ' · ', h('span', { class: 'gris' }, t[2])); })),
          h('p', { style: 'margin-top:18px' }, h('button', { class: 'btn btn-pri', type: 'button', onclick: formulario }, 'Nueva solicitud'))),
        h('section', { class: 'tarjeta' },
          h('h2', null, 'Mis solicitudes'),
          h('p', { class: 'gris chico' }, 'Entra con tu correo y la clave que te enviamos con tu primera solicitud para ver el estado, responder a Logística o agregar archivos.'),
          form)));
    }

    function arribaSesion() {
      arriba([
        h('button', { class: 'btn btn-chico', type: 'button', onclick: misSolicitudes }, 'Mis solicitudes'), ' ',
        h('button', { class: 'btn btn-chico', type: 'button', onclick: formulario }, 'Nueva solicitud'), ' ',
        h('button', { class: 'btn btn-chico', type: 'button', title: cfg.sesion.correo, onclick: salir }, 'Salir')]);
    }
    function salir() { run('salirSolicitante').then(function () { cfg.sesion = null; inicio(); }); }

    function misSolicitudes() {
      acceso = null;
      arribaSesion();
      mount(main, h('p', { class: 'gris' }, 'Cargando tus solicitudes…'));
      run('misSolicitudes').then(function (lista) {
        var tabla = lista.length ? h('div', { class: 'tabla-caja' }, h('table', null,
          h('thead', null, h('tr', null, ['Folio', 'Estado', 'Tipo', 'Ruta', 'Creada'].map(function (t) { return h('th', null, t); }))),
          h('tbody', null, lista.map(function (s) {
            var tr = h('tr', { tabindex: '0' }, h('td', { style: 'white-space:nowrap' }, h('b', null, s.folio)),
              h('td', null, U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('div', { style: 'margin-top:4px' }, h('span', { class: 'pill urgente' }, 'Urgente')) : null),
              h('td', null, s.tipo_nombre), h('td', null, s.origen, h('div', { class: 'sub' }, '→ ' + s.destino)),
              h('td', { style: 'white-space:nowrap' }, U.dia(s.creada)));
            tr.addEventListener('click', function () { abrir(s.folio); });
            tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') abrir(s.folio); });
            return tr;
          }))))
          : h('div', { class: 'tarjeta', style: 'text-align:center' }, h('p', { class: 'gris' }, 'Aún no tienes solicitudes con este correo.'),
            h('button', { class: 'btn btn-pri', type: 'button', onclick: formulario }, 'Nueva solicitud'));
        mount(main, h('div', { class: 'cabecera', style: 'margin-bottom:14px' }, h('h1', { style: 'margin:0' }, 'Mis solicitudes'),
          h('span', { class: 'gris chico' }, cfg.sesion.correo)), tabla);
      }).catch(function (e) { if (e.sesion) { cfg.sesion = null; inicio(); } U.toast(e.message, true); });
    }

    /* ---------------------------------------------------------------- formulario */
    function recordado() { try { return JSON.parse(localStorage.getItem(GUARDADO) || '{}'); } catch (e) { return {}; } }

    function formulario() {
      arriba(h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { if (cfg.sesion) misSolicitudes(); else inicio(); } }, 'Cancelar'));
      var prev = recordado();
      var claveCuenta = null;
      var campos = {};
      var generales = [], evidencias = [];

      function campo(key, label, control, opts) {
        opts = opts || {};
        control.id = 'f-' + key;
        var error = h('p', { class: 'error', hidden: true });
        var wrap = h('div', { class: 'campo' + (opts.todo ? ' todo' : '') },
          h(opts.grupo ? 'span' : 'label', opts.grupo ? { class: 'etiqueta' } : { for: control.id }, label, opts.req ? h('span', { class: 'req' }, ' *') : null),
          control, opts.ayuda ? h('p', { class: 'ayuda' }, opts.ayuda) : null, error);
        campos[key] = { wrap: wrap, error: error, control: control, req: !!opts.req, grupo: !!opts.grupo, solo: opts.solo || '' };
        var limpiar = function () { error.hidden = true; wrap.classList.remove('invalido'); };
        control.addEventListener('input', limpiar);
        control.addEventListener('change', limpiar);
        return wrap;
      }
      function texto(key, label, opts) {
        opts = opts || {};
        var el = opts.area ? h('textarea', { class: 'entrada', maxlength: opts.max || 1000, rows: 3 })
          : h('input', { class: 'entrada', type: opts.tipo || 'text', maxlength: opts.max || 160, autocomplete: opts.auto || 'off', min: opts.min });
        el.value = prev[key] && opts.recordar ? prev[key] : '';
        return campo(key, label, el, opts);
      }
      function lista(key, label, valores, opts) {
        var el = h('select', { class: 'entrada' }, h('option', { value: '' }, 'Selecciona…'), valores.map(function (v) { return h('option', { value: v }, v); }));
        if (opts && opts.recordar && prev[key]) el.value = prev[key];
        return campo(key, label, el, opts);
      }
      function opciones(key, label, valores, opts) {
        var box = h('div', { class: 'opciones', role: 'radiogroup' }, valores.map(function (v) {
          return h('label', { class: 'opcion' }, h('input', { type: 'radio', name: key, value: v[0] }),
            h('span', null, h('b', null, v[1]), v[2] ? h('small', null, v[2]) : null));
        }));
        return campo(key, label, box, Object.assign({ grupo: true, todo: true }, opts));
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
        var input = h('input', { type: 'file', multiple: true, accept: accept, class: 'entrada' });
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
        var wrap = campo(key, label, h('div', null, input, ul), Object.assign({ todo: true }, opts));
        campos[key].archivos = lista;
        return wrap;
      }

      /* Devolución: solo aparece cuando el tipo es «Devolución de cliente». */
      var estadoCheck = h('div', { class: 'aviso aviso-info', style: 'margin:0' });
      var seccionDevolucion = h('section', { class: 'tarjeta', hidden: true },
        h('h2', null, h('span', { class: 'num' }, '!'), 'Devolución: pruebas y revisión del material'),
        h('p', { class: 'gris chico' }, 'Para seguir adelante con la devolución, el material debe cumplir todos los puntos. Si alguno no se cumple, Logística revisará el caso antes de programar la recolección.'),
        h('div', { class: 'rejilla' },
          lista('dev_motivo', 'Motivo de la devolución', cfg.motivos_devolucion, { req: true, solo: 'devolucion' }),
          h('div'),
          selector('evidencia', 'Pruebas del material (fotos o video)', evidencias, 'image/*,video/*,.pdf',
            { req: true, solo: 'devolucion', ayuda: 'Fotos de las tarimas completas, de las etiquetas (lote, tono y calibre) y de cualquier daño. Hasta ' + cfg.max_mb + ' MB cada una.' }),
          casillas('dev_checklist', 'Marca todo lo que SÍ cumple el material', cfg.checklist, { solo: 'devolucion' }),
          h('div', { class: 'todo' }, estadoCheck)));
      function revisarChecklist() {
        var n = valor('dev_checklist').length, total = cfg.checklist.length;
        estadoCheck.className = 'aviso ' + (n === total ? 'aviso-ok' : 'aviso-alerta');
        mount(estadoCheck, h('p', null, n === total ? '✓ El material cumple todos los puntos: la devolución puede seguir adelante.'
          : 'Cumple ' + n + ' de ' + total + ' puntos. Puedes enviarla, pero Logística la revisará antes de programar.'));
      }

      /* Paquetería: cada renglón es un tipo de paquete. Iguales = un renglón con su cantidad; distintos = otro renglón. */
      var filasPaq = [];
      var cajaPaq = h('div', { class: 'paquetes' });
      var resumenPaq = h('div', { class: 'aviso aviso-info', style: 'margin:10px 0 0' });
      function numero(el) { var v = String(el.value).replace(',', '.').trim(); return v === '' ? NaN : Number(v); }
      function leerPaquetes() {
        return filasPaq.map(function (f) {
          return { cantidad: numero(f.cantidad), largo: numero(f.largo), ancho: numero(f.ancho), alto: numero(f.alto), peso: numero(f.peso) };
        });
      }
      function paqueteValido(p) {
        return p.cantidad >= 1 && Math.floor(p.cantidad) === p.cantidad && p.cantidad <= 999 && p.largo > 0 && p.ancho > 0 && p.alto > 0 &&
          p.largo <= 400 && p.ancho <= 400 && p.alto <= 400 && p.peso > 0 && p.peso <= 2000;
      }
      function resumirPaquetes() {
        var lista = leerPaquetes().filter(paqueteValido), total = 0, peso = 0, vol = 0;
        lista.forEach(function (p) { total += p.cantidad; peso += p.cantidad * p.peso; vol += p.cantidad * p.largo * p.ancho * p.alto / cfg.factor_volumetrico; });
        var r = function (x) { return Math.round(x * 10) / 10; };
        mount(resumenPaq, h('p', null, total ? h('b', null, total + (total === 1 ? ' paquete' : ' paquetes') + ' · ' + r(peso) + ' kg en total') : 'Agrega las medidas para ver el total.',
          total ? ' · peso volumétrico aprox. ' + r(vol) + ' kg' : null));
        filasPaq.forEach(function (f, i) { f.titulo.textContent = 'Tipo de paquete ' + (i + 1); f.quitar.hidden = filasPaq.length === 1; });
      }
      function agregarPaquete() {
        var f = {};
        var num = function (key, label, sufijo, extra) {
          f[key] = h('input', Object.assign({ class: 'entrada', type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label }, extra || {}));
          f[key].addEventListener('input', resumirPaquetes);
          return h('label', { class: 'paq-campo' }, h('span', null, label), h('span', { class: 'con-sufijo' }, f[key], h('i', null, sufijo)));
        };
        f.titulo = h('b', { class: 'chico' });
        f.quitar = h('button', { type: 'button', class: 'liga chico' }, 'Quitar');
        f.fila = h('div', { class: 'paq-fila' },
          h('div', { class: 'paq-cabeza' }, f.titulo, f.quitar),
          h('div', { class: 'paq-medidas' },
            num('cantidad', 'Cantidad', 'pzas', { inputmode: 'numeric' }),
            num('largo', 'Largo', 'cm'), num('ancho', 'Ancho', 'cm'), num('alto', 'Alto', 'cm'),
            num('peso', 'Peso c/u', 'kg')));
        f.quitar.addEventListener('click', function () { filasPaq.splice(filasPaq.indexOf(f), 1); f.fila.remove(); resumirPaquetes(); });
        filasPaq.push(f);
        cajaPaq.appendChild(f.fila);
        resumirPaquetes();
        return f;
      }
      var botonPaq = h('button', { type: 'button', class: 'btn btn-chico', onclick: function () { agregarPaquete().cantidad.focus(); } }, '+ Agregar otro tipo de paquete');
      var seccionPaquetes = h('section', { class: 'tarjeta', hidden: true },
        h('h2', null, h('span', { class: 'num' }, '📦'), 'Paquetería: medidas de los paquetes'),
        h('p', { class: 'gris chico' }, 'Si todos los paquetes son iguales, llena un solo renglón con la cantidad. Si son distintos, agrega un renglón por cada tipo de paquete.'),
        h('div', { class: 'rejilla' }, campo('paquetes', 'Paquetes', h('div', null, cajaPaq, h('div', { style: 'margin-top:10px' }, botonPaq), resumenPaq),
          { req: true, solo: 'paqueteria', todo: true })));
      campos.paquetes.leer = leerPaquetes;
      agregarPaquete();

      var feedback = h('div');
      var enviar = h('button', { class: 'btn btn-pri', type: 'submit' }, 'Enviar solicitud');
      var cancelar = function () { if (cfg.sesion) misSolicitudes(); else inicio(); };

      /* Formulario por pasos: una sección por pantalla, con barra de avance. */
      var pasoTipo = h('section', { class: 'tarjeta paso' }, h('h2', null, '¿Qué necesitas mover?'),
        h('p', { class: 'gris chico' }, 'Elige el tipo de movimiento.'), h('div', { class: 'rejilla' }, opciones('tipo', 'Tipo de movimiento', cfg.tipos, { req: true })));
      var pasoDetalles = h('div', { class: 'paso' }, h('section', { class: 'tarjeta' }, h('h2', null, 'Detalles'),
        h('div', { class: 'rejilla' },
          opciones('prioridad', 'Prioridad', [['Normal', 'Normal', ''], ['Urgente', 'Urgente', 'Menos de 48 horas; explica el motivo.']], { req: true }),
          opciones('forma_envio', 'Forma de envío', cfg.formas_envio.map(function (f) {
            return [f, f, f === cfg.paqueteria ? 'Te pediremos las medidas y el peso de los paquetes.' : ''];
          }), { req: true }),
          texto('motivo', 'Motivo y detalles', { req: true, area: true, max: 2000, todo: true, ayuda: 'Qué se va a mover, cuánto y por qué. Mientras más claro, más rápido lo programamos.' }),
          texto('referencia', 'Folio', { max: 120, ayuda: 'Opcional. Folio del pedido, remisión o nota de crédito.' }),
          texto('cliente', 'Factura', { max: 160, ayuda: 'Opcional. Número de factura relacionada.' }),
          casilla('horario', 'Cita', 'Para entregar o recoger se requiere cita', { todo: true,
            ayuda: 'Márcala si el lugar pide agendar cita. Logística te avisará qué día se puede hacer la cita o cuándo agendarla.' }))),
        seccionPaquetes);
      seccionDevolucion.hidden = false;
      var pasoDevolucion = h('div', { class: 'paso' }, seccionDevolucion);
      var pasoRuta = h('section', { class: 'tarjeta paso' }, h('h2', null, 'Origen y destino'),
        h('div', { class: 'rejilla' },
          h('h3', { class: 'todo', style: 'margin:0' }, 'Origen · dónde recogemos'),
          texto('origen_nombre', 'Lugar o empresa', { req: true, ayuda: 'En devoluciones, normalmente es el cliente.' }),
          texto('origen_ciudad', 'Ciudad y estado', { req: true, max: 120 }),
          texto('origen_direccion', 'Calle, número, colonia y CP', { req: true, max: 240, todo: true }),
          texto('origen_contacto', 'Contacto y teléfono en origen', { todo: true, ayuda: 'Opcional.' }),
          h('h3', { class: 'todo', style: 'margin:8px 0 0' }, 'Destino · a dónde lo llevamos'),
          texto('destino_nombre', 'Lugar o empresa', { req: true }),
          texto('destino_ciudad', 'Ciudad y estado', { req: true, max: 120 }),
          texto('destino_direccion', 'Calle, número, colonia y CP', { req: true, max: 240, todo: true }),
          texto('destino_contacto', 'Contacto y teléfono en destino', { todo: true, ayuda: 'Opcional.' })));
      var pasoDatos = h('div', { class: 'paso' },
        h('section', { class: 'tarjeta' }, h('h2', null, 'Tus datos'),
          h('p', { class: 'gris chico' }, 'Se recuerdan en este equipo para la próxima vez.'),
          h('div', { class: 'rejilla' },
            texto('solicitante', 'Nombre completo', { req: true, max: 120, auto: 'name', recordar: true }),
            lista('area', 'Área', cfg.areas, { req: true, recordar: true }),
            texto('correo', 'Correo', { req: true, tipo: 'email', auto: 'email', recordar: true }),
            texto('telefono', 'Teléfono o extensión', { req: true, tipo: 'tel', max: 40, auto: 'tel', recordar: true }))),
        h('section', { class: 'tarjeta' }, h('h2', null, 'Archivos (opcional)'),
          h('div', { class: 'rejilla' }, selector('archivos', 'Factura, autorización, lista de empaque u otros', generales, '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx',
            { ayuda: 'PDF, imagen, Excel o Word de hasta ' + cfg.max_mb + ' MB cada uno.' }))));

      var PASOS = [
        { titulo: 'Qué necesitas', el: pasoTipo },
        { titulo: 'Detalles', el: pasoDetalles },
        { titulo: 'Devolución', el: pasoDevolucion, aplica: function () { return valor('tipo') === 'devolucion'; } },
        { titulo: 'Origen y destino', el: pasoRuta },
        { titulo: 'Tus datos y envío', el: pasoDatos }
      ];
      var paso = 0;
      var avance = h('div', { class: 'avance', 'aria-live': 'polite' });
      var anterior = h('button', { class: 'btn', type: 'button' }, '← Anterior');
      var siguiente = h('button', { class: 'btn btn-pri', type: 'button' }, 'Siguiente →');
      function activos() { return PASOS.filter(function (x) { return !x.aplica || x.aplica(); }); }
      function mostrar(i) {
        var lista = activos();
        paso = Math.max(0, Math.min(i, lista.length - 1));
        PASOS.forEach(function (x) { x.el.hidden = x !== lista[paso]; });
        var ultimo = paso === lista.length - 1;
        mount(avance, h('div', { class: 'avance-txt' }, h('b', null, 'Paso ' + (paso + 1) + ' de ' + lista.length), ' · ' + lista[paso].titulo),
          h('div', { class: 'avance-barra' }, lista.map(function (x, k) { return h('span', { class: k <= paso ? 'hecho' : '' }); })));
        anterior.hidden = paso === 0;
        siguiente.hidden = ultimo;
        enviar.hidden = !ultimo;
        if (!ultimo && !claveCuenta) mount(feedback);
        window.scrollTo(0, 0);
      }
      /* Revisa los campos (de un paso o de todos). Devuelve los datos y los campos con error. */
      function revisar(dentroDe) {
        var datos = {}, faltan = [], devolucion = valor('tipo') === 'devolucion', paqueteria = valor('forma_envio') === cfg.paqueteria;
        Object.keys(campos).forEach(function (k) {
          var c = campos[k], v = c.archivos ? c.archivos : (c.leer ? c.leer() : valor(k)), msg = '';
          var aplica = !c.solo || (c.solo === 'devolucion' && devolucion) || (c.solo === 'paqueteria' && paqueteria);
          if (!c.archivos) datos[k] = aplica ? v : (c.leer ? [] : '');
          if (dentroDe && !dentroDe.contains(c.wrap)) return;
          if (aplica && c.leer) { if (!v.length || !v.every(paqueteValido)) msg = 'Completa cantidad, largo, ancho, alto y peso de cada paquete (números mayores a cero).'; }
          else if (aplica && c.req && (!v || (Array.isArray(v) && !v.length))) msg = c.archivos ? 'Agrega al menos una foto o video.' : 'Obligatorio.';
          else if (k === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Escribe un correo válido.';
          c.error.textContent = msg; c.error.hidden = !msg;
          c.wrap.classList.toggle('invalido', !!msg);
          if (msg) faltan.push(c.wrap);
        });
        return { datos: datos, faltan: faltan, devolucion: devolucion };
      }
      function enfocar(wrap) {
        wrap.scrollIntoView({ block: 'center' });
        var ctl = wrap.querySelector('input, select, textarea');
        if (ctl) ctl.focus({ preventScroll: true });
      }
      anterior.addEventListener('click', function () { mostrar(paso - 1); });
      siguiente.addEventListener('click', function () {
        var r = revisar(activos()[paso].el);
        if (r.faltan.length) { enfocar(r.faltan[0]); return; }
        mostrar(paso + 1);
      });

      var form = h('form', { novalidate: true },
        h('h1', null, 'Nueva solicitud'), avance,
        pasoTipo, pasoDetalles, pasoDevolucion, pasoRuta, pasoDatos,
        feedback,
        h('div', { class: 'acciones pasos-acciones' }, anterior, siguiente, enviar, h('span', { class: 'espacio' }),
          h('button', { class: 'liga', type: 'button', onclick: cancelar }, 'Cancelar')));
      if (cfg.sesion) {
        campos.correo.control.value = cfg.sesion.correo;
        campos.correo.control.readOnly = true;
        campos.correo.wrap.querySelector('label').appendChild(h('span', { class: 'gris' }, ' (tu correo de acceso)'));
      }

      /* Al elegir el tipo se avanza solo al siguiente paso. */
      campos.tipo.control.addEventListener('change', function () { setTimeout(function () { if (paso === 0) mostrar(1); }, 250); });
      campos.forma_envio.control.addEventListener('change', function () { seccionPaquetes.hidden = valor('forma_envio') !== cfg.paqueteria; });
      campos.dev_checklist.control.addEventListener('change', revisarChecklist);
      revisarChecklist();
      mostrar(0);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var r = revisar(null), datos = r.datos, faltan = r.faltan, devolucion = r.devolucion;
        if (faltan.length) {
          var lista = activos();
          for (var k = 0; k < lista.length; k++) if (lista[k].el.contains(faltan[0])) { mostrar(k); break; }
          mount(feedback, h('div', { class: 'aviso aviso-mal', role: 'alert' }, h('p', null, faltan.length === 1 ? 'Revisa el campo marcado en rojo.' : 'Revisa los ' + faltan.length + ' campos marcados en rojo.')));
          enfocar(faltan[0]);
          return;
        }
        try { localStorage.setItem(GUARDADO, JSON.stringify({ solicitante: datos.solicitante, area: datos.area, correo: datos.correo, telefono: datos.telefono })); } catch (e) { /* sin almacenamiento */ }
        var porSubir = (devolucion ? evidencias.map(function (f) { return { file: f, clase: 'evidencia' }; }) : [])
          .concat(generales.map(function (f) { return { file: f, clase: '' }; }));
        U.ocupado(enviar, true, 'Enviando…');
        run('crearSolicitud', datos, { clave: claveCuenta ? claveCuenta.value : '' }).then(function (res) {
          cfg.sesion = { correo: datos.correo };
          acceso = res.folio;
          return subirTodos(porSubir, enviar).then(function (ultima) { confirmacion(ultima || res.solicitud, res.clave); });
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

    function confirmacion(s, clave) {
      arribaSesion();
      mount(main, h('section', { class: 'tarjeta', style: 'text-align:center;padding:36px 22px' },
        h('p', { class: 'gris', style: 'margin:0' }, 'Tu folio es'),
        h('div', { class: 'folio', style: 'font-size:40px;margin:6px 0 14px' }, s.folio),
        h('h1', null, 'Solicitud recibida'),
        h('p', { class: 'gris' }, 'Te enviamos un correo con tu folio. Logística la revisará y te avisará cada avance.'),
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
      var datos = [
        ['Tipo', s.tipo_nombre], ['Prioridad', s.prioridad], ['Forma de envío', s.forma_envio],
        ['Origen', s.origen_nombre + ', ' + s.origen_ciudad], ['Destino', s.destino_nombre + ', ' + s.destino_ciudad],
        ['Fecha programada', s.fecha_programada ? U.dia(s.fecha_programada) : ''], ['Folio CSTEXT', s.folio_cstext],
        ['Transportista', s.transportista], ['Guía o referencia', s.guia]
      ].filter(function (d) { return d[1]; });

      var partes = [h('section', { class: 'tarjeta' },
        h('div', { class: 'cabecera' },
          h('div', null, h('div', { class: 'folio' }, s.folio), h('p', { class: 'gris chico', style: 'margin:6px 0 0' }, 'Creada el ' + U.fechaHora(s.creada) + ' por ' + s.solicitante)),
          h('div', { class: 'acciones' }, U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('span', { class: 'pill urgente' }, 'Urgente') : null)),
        U.pasos(cfg, s.estado),
        h('dl', { class: 'datos', style: 'margin-top:16px' }, datos.map(function (d) { return h('div', null, h('dt', null, d[0]), h('dd', null, d[1])); })))];

      if (s.estado === 'informacion') partes.push(h('div', { class: 'aviso aviso-alerta' }, h('p', null, h('b', null, 'Logística necesita más información. '), 'Lee el último mensaje y responde abajo.')));
      if (s.tipo === 'devolucion') partes.push(U.devolucion(cfg, s));
      if (s.paq_total) partes.push(U.paquetes(s));

      var hilo = h('ul', { class: 'hilo' }, s.seguimiento.slice().reverse().map(function (m) {
        return h('li', null, h('div', { class: 'quien' }, U.fechaHora(m.fecha) + ' · ' + m.autor), h('div', { class: 'texto' }, m.mensaje));
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

      var subir = h('input', { type: 'file', multiple: true, class: 'entrada', accept: '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx' });
      subir.addEventListener('change', function () {
        var lista = Array.prototype.slice.call(subir.files);
        if (!lista.length) return;
        subir.disabled = true;
        U.toast('Subiendo ' + lista.length + ' archivo(s)…');
        subirTodos(lista.map(function (f) { return { file: f, clase: '' }; })).then(function (r) { if (r) seguimiento(r); else subir.disabled = false; });
      });
      partes.push(h('section', { class: 'tarjeta' }, h('h2', null, 'Archivos'),
        s.archivos.length ? h('ul', { class: 'archivos' }, s.archivos.map(function (a) {
          return h('li', null, h('span', null, h('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.nombre),
            a.evidencia ? h('span', { class: 'pill e-informacion', style: 'margin-left:6px' }, 'Evidencia') : null),
            h('span', { class: 'gris chico' }, U.tamano(a.tamano) + ' · ' + a.autor));
        })) : h('p', { class: 'gris' }, 'Sin archivos.'),
        abierta ? h('div', { style: 'margin-top:12px' }, h('label', { class: 'chico', style: 'font-weight:600' }, 'Agregar archivos'), subir) : null));

      partes.push(h('section', { class: 'tarjeta' }, h('h2', null, 'Detalle de la solicitud'),
        h('dl', { class: 'datos' }, [
          ['Área', s.area], ['Teléfono', s.telefono], ['Folio', s.referencia], ['Factura', s.cliente],
          ['Requiere cita', s.horario], ['Dirección de origen', s.origen_direccion], ['Contacto en origen', s.origen_contacto],
          ['Dirección de destino', s.destino_direccion], ['Contacto en destino', s.destino_contacto], ['Motivo y detalles', s.motivo]
        ].filter(function (d) { return d[1]; }).map(function (d) { return h('div', null, h('dt', null, d[0]), h('dd', { style: 'font-weight:500;white-space:pre-wrap' }, d[1])); }))));

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
