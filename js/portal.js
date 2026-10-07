/* Formulario y seguimiento de solicitudes (Liga 1). Misma interfaz que la versión probada, con acceso de Firebase. */
import * as API from './servidor.js?v=6';
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
          h('p', { class: 'gris' }, 'Pide aquí entregas, recolecciones, devoluciones y traslados a Logística. Primero eliges qué producto se mueve y después qué hacer con él. Cada solicitud recibe un folio y te avisamos por correo cada avance.'),
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
      var generales = [], evidencias = [], cotizaciones = [];
      var ENTREGAS = ['envio', 'entrega_recoleccion', 'mercadotecnia'];
      var AVISO_48 = 'Importante: Si tu solicitud se realiza con menos de 48 horas de anticipación, podrán aplicarse sobrecostos y será necesaria la autorización del Gerente de Área.';

      /* opts.aplica: función que dice si el campo se muestra y se valida (campos que dependen de otra respuesta). */
      function campo(key, label, control, opts) {
        opts = opts || {};
        control.id = 'f-' + key;
        var error = h('p', { class: 'error', hidden: true });
        var texto = h('span', null, label);
        var wrap = h('div', { class: 'campo' + (opts.todo ? ' todo' : '') },
          label ? h(opts.grupo ? 'span' : 'label', opts.grupo ? { class: 'etiqueta' } : { for: control.id }, texto, opts.req ? h('span', { class: 'req' }, ' *') : null) : null,
          control, opts.ayuda ? h('p', { class: 'ayuda' }, opts.ayuda) : null, error);
        campos[key] = { wrap: wrap, error: error, control: control, texto: texto, req: !!opts.req, grupo: !!opts.grupo, aplica: opts.aplica || null };
        var limpiar = function () { error.hidden = true; wrap.classList.remove('invalido'); };
        control.addEventListener('input', limpiar);
        control.addEventListener('change', limpiar);
        return wrap;
      }
      function texto(key, label, opts) {
        opts = opts || {};
        var el = opts.area ? h('textarea', { class: 'entrada', maxlength: opts.max || 1000, rows: opts.filas || 3, placeholder: opts.ejemplo || null })
          : h('input', { class: 'entrada', type: opts.tipo || 'text', maxlength: opts.max || 160, autocomplete: opts.auto || 'off', min: opts.min || null,
            list: opts.lista || null, placeholder: opts.ejemplo || null });
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
      function marcar(key, v) {
        var el = campos[key].control.querySelector('input[value="' + v + '"]');
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
      function seccion(titulo, intro) {
        var hijos = Array.prototype.slice.call(arguments, 2);
        return h('section', { class: 'tarjeta' }, h('h2', null, titulo), intro ? h('p', { class: 'gris chico' }, intro) : null, h('div', { class: 'rejilla' }, hijos));
      }
      function numero(el) { var v = String(el.value).replace(',', '.').trim(); return v === '' ? NaN : Number(v); }

      /* Reglas que deciden qué campos aplican según lo elegido. */
      var esTipo = function (t) { return function () { return valor('tipo') === t; }; };
      var preguntaRecoleccion = function () { return cfg.con_recoleccion.indexOf(valor('tipo')) >= 0; };
      var conRecoleccion = function () { return valor('tipo') === 'entrega_recoleccion' || (preguntaRecoleccion() && valor('recoleccion') === 'Sí'); };
      var fechaAbierta = function () { return valor('fecha_abierta') === 'Sí'; };
      function fueraDeTiempo() {
        var f = valor('fecha_requerida');
        return !fechaAbierta() && /^\d{4}-\d{2}-\d{2}$/.test(f) && f < cfg.limite_programado;
      }

      /* ---------- Paso 1 · Tipo de producto */
      var pasoProducto = h('div', { class: 'paso' }, seccion('¿Qué se va a mover o solicitar?', 'Elige el tipo de producto. Si son varios, elige el principal: en el paso 3 puedes agregar más artículos.',
        opciones('producto_tipo', 'Tipo de producto', cfg.productos.map(function (p) { return [p[0], p[0], p[1]]; }), { req: true }),
        texto('producto_otro', 'Especificar tipo de producto', { req: true, max: 120, todo: true, aplica: function () { return valor('producto_tipo') === 'Otro'; },
          ejemplo: 'Ej.: lonas, equipo de cómputo, muestras' })));

      /* ---------- Paso 2 · Tipo de movimiento */
      var pasoMovimiento = h('div', { class: 'paso' }, seccion('¿Qué necesitas hacer con el producto?', 'Elige el tipo de movimiento.',
        opciones('tipo', 'Tipo de movimiento', cfg.tipos, { req: true }),
        texto('tipo_otro', 'Especificar movimiento', { req: true, max: 120, todo: true, aplica: esTipo('otro') })));

      /* ---------- Paso 3 · Datos del producto: artículos, descripción, forma de envío y paquetería */
      var filasArt = [];
      var cajaArt = h('div', { class: 'articulos' });
      var catalogoProductos = h('datalist', { id: 'cat-productos' }, cfg.productos.filter(function (p) { return p[0] !== 'Otro'; }).map(function (p) { return h('option', { value: p[0] }); }));
      function leerArticulos() {
        return filasArt.map(function (f) { return { producto: f.producto.value.trim(), cantidad: f.cantidad.value.trim(), descripcion: f.descripcion.value.trim() }; })
          .filter(function (a) { return a.producto || a.cantidad || a.descripcion; });
      }
      function validarArticulos(lista) {
        if (!lista.length) return 'Agrega al menos un artículo con su cantidad.';
        for (var i = 0; i < lista.length; i++) {
          var n = Number(String(lista[i].cantidad).replace(',', '.'));
          if (!lista[i].producto || !(n > 0)) return 'Escribe el producto y la cantidad (número mayor a cero) de cada artículo.';
        }
        return '';
      }
      function agregarArticulo(producto) {
        var f = {};
        f.cantidad = h('input', { class: 'entrada', type: 'text', inputmode: 'numeric', maxlength: 8, 'aria-label': 'Cantidad', placeholder: 'Ej. 20' });
        f.producto = h('input', { class: 'entrada', type: 'text', maxlength: 80, list: 'cat-productos', 'aria-label': 'Producto', placeholder: 'Ej. sillas' });
        f.descripcion = h('input', { class: 'entrada', type: 'text', maxlength: 300, 'aria-label': 'Descripción', placeholder: 'Ej. color, modelo, medidas' });
        if (producto) f.producto.value = producto;
        f.quitar = h('button', { type: 'button', class: 'liga chico' }, 'Quitar');
        f.fila = h('div', { class: 'art-fila' },
          h('label', { class: 'art-campo' }, h('span', null, 'Cantidad'), f.cantidad),
          h('label', { class: 'art-campo' }, h('span', null, 'Producto'), f.producto),
          h('label', { class: 'art-campo' }, h('span', null, 'Descripción'), f.descripcion), f.quitar);
        f.quitar.addEventListener('click', function () { filasArt.splice(filasArt.indexOf(f), 1); f.fila.remove(); pintarArticulos(); });
        filasArt.push(f);
        cajaArt.appendChild(f.fila);
        pintarArticulos();
        return f;
      }
      function pintarArticulos() { filasArt.forEach(function (f) { f.quitar.hidden = filasArt.length === 1; }); }
      var botonArt = h('button', { type: 'button', class: 'btn btn-chico', onclick: function () { agregarArticulo('').cantidad.focus(); } }, '+ Agregar otro artículo');
      var wrapArt = campo('articulos', 'Artículos y cantidades', h('div', null, cajaArt, catalogoProductos, h('div', { style: 'margin-top:10px' }, botonArt)),
        { req: true, todo: true, ayuda: 'Un renglón por producto. Ejemplo: 20 sillas, 4 mesas, 1 stand completo.' });
      campos.articulos.leer = leerArticulos;
      campos.articulos.validar = validarArticulos;
      agregarArticulo('');

      /* Paquetería: cada renglón es un tipo de paquete. Iguales = un renglón con su cantidad; distintos = otro renglón. */
      var filasPaq = [];
      var cajaPaq = h('div', { class: 'paquetes' });
      var resumenPaq = h('div', { class: 'aviso aviso-info', style: 'margin:10px 0 0' });
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
      var esPaqueteria = function () { return valor('forma_envio') === cfg.paqueteria; };
      var botonPaq = h('button', { type: 'button', class: 'btn btn-chico', onclick: function () { agregarPaquete().cantidad.focus(); } }, '+ Agregar otro tipo de paquete');
      var seccionPaquetes = h('section', { class: 'tarjeta' },
        h('h2', null, h('span', { class: 'num' }, '📦'), 'Paquetería: medidas de los paquetes'),
        h('p', { class: 'gris chico' }, 'Si todos los paquetes son iguales, llena un solo renglón con la cantidad. Si son distintos, agrega un renglón por cada tipo de paquete.'),
        h('div', { class: 'rejilla' }, campo('paquetes', 'Paquetes', h('div', null, cajaPaq, h('div', { style: 'margin-top:10px' }, botonPaq), resumenPaq),
          { req: true, todo: true, aplica: esPaqueteria })));
      campos.paquetes.leer = leerPaquetes;
      campos.paquetes.validar = function (v) { return !v.length || !v.every(paqueteValido) ? 'Completa cantidad, largo, ancho, alto y peso de cada paquete (números mayores a cero).' : ''; };
      agregarPaquete();

      var pasoDetalle = h('div', { class: 'paso' },
        seccion('Datos del producto', 'Qué se mueve, cuánto y para qué.',
          wrapArt,
          texto('motivo', 'Descripción de la solicitud', { req: true, area: true, filas: 4, max: 5000, todo: true,
            ejemplo: 'Ej.: Se requieren 20 sillas para el evento de lanzamiento. Entregar el 15 de octubre y recoger el 17 de octubre.',
            ayuda: 'Explica qué necesitas. Mientras más claro, más rápido lo programamos.' }),
          opciones('forma_envio', 'Forma de envío', cfg.formas_envio.map(function (f) {
            return [f, f, f === cfg.paqueteria ? 'Te pediremos las medidas y el peso de los paquetes.' : ''];
          }), { req: true }),
          texto('referencia', 'Folio', { max: 120, ayuda: 'Opcional. Folio del pedido, remisión o nota de crédito.' }),
          texto('cliente', 'Factura', { max: 160, ayuda: 'Opcional. Número de factura relacionada.' })),
        seccionPaquetes);

      /* ---------- Devolución: solo cuando el movimiento es «Devolución de producto». */
      var estadoCheck = h('div', { class: 'aviso aviso-info', style: 'margin:0' });
      var pasoDevolucion = h('div', { class: 'paso' }, h('section', { class: 'tarjeta' },
        h('h2', null, h('span', { class: 'num' }, '!'), 'Devolución: pruebas y revisión del material'),
        h('p', { class: 'gris chico' }, 'Para seguir adelante con la devolución, el material debe cumplir todos los puntos. Si alguno no se cumple, Logística revisará el caso antes de programar la recolección.'),
        h('div', { class: 'rejilla' },
          lista('dev_motivo', 'Motivo de la devolución', cfg.motivos_devolucion, { req: true, aplica: esTipo('devolucion') }),
          h('div'),
          selector('evidencia', 'Pruebas del material (fotos o video)', evidencias, 'image/*,video/*,.pdf',
            { req: true, aplica: esTipo('devolucion'), ayuda: 'Fotos de las tarimas completas, de las etiquetas (lote, tono y calibre) y de cualquier daño. Hasta ' + cfg.max_mb + ' MB cada una.' }),
          casillas('dev_checklist', 'Marca todo lo que SÍ cumple el material', cfg.checklist, { aplica: esTipo('devolucion') }),
          h('div', { class: 'todo' }, estadoCheck))));
      function revisarChecklist() {
        var n = valor('dev_checklist').length, total = cfg.checklist.length;
        estadoCheck.className = 'aviso ' + (n === total ? 'aviso-ok' : 'aviso-alerta');
        mount(estadoCheck, h('p', null, n === total ? '✓ El material cumple todos los puntos: la devolución puede seguir adelante.'
          : 'Cumple ' + n + ' de ' + total + ' puntos. Puedes enviarla, pero Logística la revisará antes de programar.'));
      }

      /* ---------- Paso 4 · Datos administrativos */
      var catalogoAreas = h('datalist', { id: 'cat-areas' }, cfg.areas.map(function (a) { return h('option', { value: a }); }));
      var costoOtro = function () { return ['Otro departamento', 'Otro'].indexOf(valor('costo_absorbe')) >= 0; };
      var pasoAdmin = h('div', { class: 'paso' },
        seccion('Quién solicita', 'Se recuerdan en este equipo para la próxima vez.',
          texto('solicitante', 'Nombre completo', { req: true, max: 120, auto: 'name', recordar: true }),
          texto('area', 'Departamento solicitante', { req: true, max: 80, lista: 'cat-areas', recordar: true, ayuda: 'Elige de la lista o escríbelo.' }),
          texto('correo', 'Correo', { req: true, tipo: 'email', auto: 'email', recordar: true }),
          texto('telefono', 'Teléfono o extensión', { req: true, tipo: 'tel', max: 40, auto: 'tel', recordar: true }), catalogoAreas),
        seccion('Costo', null,
          opciones('costo_absorbe', '¿Quién absorbe el costo?', cfg.costos.map(function (c) { return [c, c, '']; }), { req: true }),
          texto('costo_detalle', 'Especificar quién absorbe el costo', { req: true, max: 120, todo: true, aplica: costoOtro })));

      /* ---------- Paso 5 · Fechas y tipo de solicitud */
      var aviso48 = h('div', { class: 'aviso aviso-mal todo', role: 'alert' },
        h('p', null, h('b', null, 'Importante: '), AVISO_48.replace(/^Importante: /, '')),
        h('p', { class: 'chico' }, 'Tu solicitud se registrará como Urgente y quedará pendiente de autorización.'));
      var seccionAut = h('section', { class: 'tarjeta' }, h('h2', null, h('span', { class: 'num' }, '!'), 'Autorización de Gerente de Área'),
        h('p', { class: 'gris chico' }, 'Estatus inicial: Pendiente de autorización. Logística registrará quién la autorizó y la fecha; no se programa hasta que el Gerente la apruebe. Si ya tienes la autorización por correo, adjúntala en el paso de documentos.'),
        h('div', { class: 'rejilla' }, texto('aut_gerente', 'Nombre del Gerente de Área que autoriza', { req: true, max: 120, todo: true, aplica: fueraDeTiempo })));
      var tituloRecoleccion = h('h3', { class: 'todo', style: 'margin:6px 0 0' }, 'Recolección');
      var pasoFechas = h('div', { class: 'paso' },
        h('section', { class: 'tarjeta' }, h('h2', null, 'Fechas'),
          h('p', { class: 'gris chico' }, 'Solo fechas. Si todavía no hay una fecha exacta, marca «Fecha abierta» y Logística la asignará después.'),
          h('div', { class: 'rejilla' },
            texto('fecha_requerida', 'Fecha requerida', { req: true, tipo: 'date', min: cfg.hoy, aplica: function () { return !fechaAbierta(); } }),
            casilla('fecha_abierta', ' ', 'Fecha abierta (aún no hay fecha exacta)'),
            aviso48,
            tituloRecoleccion,
            opciones('recoleccion', '¿El material regresa?', [['Sí', 'Requiere recolección', 'Sillas, mobiliario, stands, estructuras, equipo reutilizable.'],
              ['No', 'No requiere recolección', 'Regalos, vinos, material promocional o consumible.']], { req: true, aplica: preguntaRecoleccion }),
            texto('fecha_recoleccion', 'Fecha de recolección', { req: true, tipo: 'date', min: cfg.hoy,
              aplica: function () { return conRecoleccion() && valor('recoleccion_abierta') !== 'Sí'; } }),
            casilla('recoleccion_abierta', ' ', 'Fecha de recolección abierta', { aplica: conRecoleccion }),
            opciones('prioridad', 'Tipo de solicitud', [['Programado', 'Programado', 'Con 48 horas o más de anticipación.'],
              ['Urgente', 'Urgente', 'Requiere atención prioritaria.']], { req: true }))),
        seccionAut);

      /* ---------- Paso 6 · Origen y destino */
      var avisoRegreso = h('div', { class: 'aviso aviso-info todo' }, h('p', null, 'La recolección se hace en el lugar de entrega y el material regresa al lugar de salida.'));
      function lugar(pre, titulo, ayudaNombre) {
        return [h('h3', { class: 'todo', style: 'margin:6px 0 0' }, titulo),
          texto(pre + '_nombre', 'Empresa o lugar', { req: true, ayuda: ayudaNombre || null }),
          texto(pre + '_ciudad', 'Ciudad y estado', { req: true, max: 120 }),
          texto(pre + '_direccion', 'Dirección (calle, número, colonia y CP)', { req: true, max: 240, todo: true }),
          texto(pre + '_contacto', 'Nombre del contacto', { max: 160, ayuda: 'Opcional.' }),
          texto(pre + '_telefono', 'Teléfono del contacto', { tipo: 'tel', max: 40, ayuda: 'Opcional.' }),
          texto(pre + '_referencias', 'Referencias', { max: 300, todo: true, ayuda: 'Opcional. Cómo llegar, andén, entre qué calles.' })];
      }
      var pasoRuta = h('div', { class: 'paso' },
        h('section', { class: 'tarjeta' }, h('h2', null, 'Origen y destino'),
          h('div', { class: 'rejilla' }, avisoRegreso,
            lugar('origen', 'Lugar de salida · dónde recogemos', 'En devoluciones, normalmente es el cliente.'),
            lugar('destino', 'Lugar de entrega · a dónde lo llevamos'))),
        seccion('Indicaciones para la entrega o recolección', null,
          casilla('horario', 'Cita', 'Para entregar o recoger se requiere cita', { todo: true,
            ayuda: 'Márcala si el lugar pide agendar cita. Logística te avisará qué día se puede hacer la cita o cuándo agendarla.' }),
          texto('observaciones', 'Observaciones', { area: true, max: 2000, todo: true, ayuda: 'Opcional. Horarios del lugar, maniobras, permisos de acceso, etc.' })));

      /* ---------- Paso 7 · Cotización y documentos */
      var ARCHIVOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.csv,.docx,.doc,.pptx,.eml,.msg,.txt';
      var pasoDocs = h('div', { class: 'paso' },
        seccion('Cotización', 'Si ya tienes una cotización aprobada o enviada por correo, adjúntala para que quede en la solicitud.',
          selector('cotizacion', 'Adjuntar cotización o correo de cotización (opcional)', cotizaciones, ARCHIVOS,
            { ayuda: 'PDF, imagen, Excel, Word o correo exportado (.eml, .msg) de hasta ' + cfg.max_mb + ' MB cada uno.' })),
        seccion('Documentos y archivos', null,
          selector('archivos', 'Fotografías, correos, croquis, instrucciones, evidencias o autorizaciones (opcional)', generales, ARCHIVOS,
            { ayuda: 'Hasta ' + cfg.max_mb + ' MB cada uno.' })));

      /* ---------- Paso 8 · Confirmación */
      var cajaResumen = h('div');
      var pasoResumen = h('div', { class: 'paso' }, cajaResumen);

      var feedback = h('div');
      var enviar = h('button', { class: 'btn btn-pri', type: 'submit' }, 'Confirmar solicitud');
      var cancelar = function () { if (cfg.sesion) misSolicitudes(); else inicio(); };

      var PASOS = [
        { titulo: 'Tipo de producto', el: pasoProducto },
        { titulo: 'Tipo de movimiento', el: pasoMovimiento },
        { titulo: 'Datos del producto', el: pasoDetalle },
        { titulo: 'Devolución', el: pasoDevolucion, aplica: esTipo('devolucion') },
        { titulo: 'Datos administrativos', el: pasoAdmin },
        { titulo: 'Fechas', el: pasoFechas },
        { titulo: 'Origen y destino', el: pasoRuta },
        { titulo: 'Cotización y documentos', el: pasoDocs },
        { titulo: 'Confirmación', el: pasoResumen }
      ];
      var paso = 0;
      var avance = h('div', { class: 'avance', 'aria-live': 'polite' });
      var anterior = h('button', { class: 'btn', type: 'button' }, '← Anterior');
      var siguiente = h('button', { class: 'btn btn-pri', type: 'button' }, 'Siguiente →');
      function activos() { return PASOS.filter(function (x) { return !x.aplica || x.aplica(); }); }

      /* Muestra u oculta lo que depende de otras respuestas. */
      function actualizar() {
        var tipo = valor('tipo');
        Object.keys(campos).forEach(function (k) { var c = campos[k]; if (c.aplica) c.wrap.hidden = !c.aplica(); });
        seccionPaquetes.hidden = !esPaqueteria();
        campos.fecha_requerida.texto.textContent = ENTREGAS.indexOf(tipo) >= 0 ? 'Fecha de entrega' : 'Fecha requerida';
        tituloRecoleccion.hidden = !(preguntaRecoleccion() || tipo === 'entrega_recoleccion');
        avisoRegreso.hidden = !conRecoleccion();
        var fuera = fueraDeTiempo();
        aviso48.hidden = !fuera;
        seccionAut.hidden = !fuera;
        var programado = campos.prioridad.control.querySelector('input[value="Programado"]');
        programado.disabled = fuera;
        programado.parentNode.classList.toggle('deshabilitada', fuera);
        if (fuera) marcar('prioridad', 'Urgente');
      }

      function mostrar(i) {
        var lista = activos();
        paso = Math.max(0, Math.min(i, lista.length - 1));
        PASOS.forEach(function (x) { x.el.hidden = x !== lista[paso]; });
        var ultimo = paso === lista.length - 1;
        mount(avance, h('div', { class: 'avance-txt' }, h('b', null, 'Paso ' + (paso + 1) + ' de ' + lista.length), ' · ' + lista[paso].titulo),
          h('div', { class: 'avance-barra' }, lista.map(function (x, k) { return h('span', { class: k <= paso ? 'hecho' : '' }); })));
        anterior.hidden = paso === 0;
        anterior.textContent = ultimo ? '← Editar' : '← Anterior';
        siguiente.hidden = ultimo;
        enviar.hidden = !ultimo;
        if (lista[paso].el === pasoDetalle && filasArt.length === 1 && !filasArt[0].producto.value) {
          filasArt[0].producto.value = valor('producto_tipo') === 'Otro' ? valor('producto_otro') : valor('producto_tipo');
        }
        if (lista[paso].el === pasoFechas && preguntaRecoleccion() && !valor('recoleccion')) {
          marcar('recoleccion', cfg.reutilizables.indexOf(valor('producto_tipo')) >= 0 ? 'Sí' : 'No');
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
          else if (c.req && (!v || (Array.isArray(v) && !v.length))) msg = c.archivos ? 'Agrega al menos una foto o video.' : 'Obligatorio.';
          else if (k === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = 'Escribe un correo válido.';
          else if (k === 'fecha_requerida' && v < cfg.hoy) msg = 'La fecha ya pasó.';
          else if (k === 'fecha_recoleccion' && datos.fecha_requerida && v < datos.fecha_requerida) msg = 'Debe ser igual o posterior a la fecha de entrega.';
          c.error.textContent = msg; c.error.hidden = !msg;
          c.wrap.classList.toggle('invalido', !!msg);
          if (msg) faltan.push(c.wrap);
        });
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
        var d = revisar(null).datos, tipo = valor('tipo'), fuera = fueraDeTiempo();
        var nombreTipo = (cfg.tipos.filter(function (t) { return t[0] === tipo; })[0] || ['', tipo])[1] + (tipo === 'otro' && d.tipo_otro ? ': ' + d.tipo_otro : '');
        var dia = function (v) { return v ? v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4) : ''; };
        var bloque = function (titulo, pasoEl, filas) {
          return h('section', { class: 'tarjeta resumen' },
            h('div', { class: 'cabecera' }, h('h2', { style: 'margin:0' }, titulo),
              h('button', { class: 'liga chico', type: 'button', onclick: function () { irA(pasoEl); } }, 'Editar')),
            h('dl', { class: 'datos', style: 'margin-top:12px' }, filas.filter(function (x) { return x[1]; }).map(function (x) {
              return h('div', null, h('dt', null, x[0]), h('dd', { style: 'white-space:pre-wrap' }, x[1]));
            })));
        };
        var recoleccion = conRecoleccion() ? (d.recoleccion_abierta === 'Sí' ? 'Fecha abierta' : dia(d.fecha_recoleccion))
          : (preguntaRecoleccion() ? 'No requiere recolección' : '');
        mount(cajaResumen,
          h('section', { class: 'tarjeta' }, h('h2', null, 'Revisa tu solicitud'),
            h('p', { class: 'gris chico', style: 'margin:0' }, 'Confirma que todo esté correcto. Si algo falta, usa «Editar».')),
          fuera ? h('div', { class: 'aviso aviso-mal', role: 'alert' }, h('p', null, h('b', null, 'Importante: '), AVISO_48.replace(/^Importante: /, '')),
            h('p', { class: 'chico' }, 'Gerente que autoriza: ' + d.aut_gerente + ' · Estatus: Pendiente de autorización.')) : null,
          bloque('Producto y movimiento', pasoProducto, [
            ['Producto', d.producto_tipo === 'Otro' ? d.producto_otro : d.producto_tipo], ['Movimiento', nombreTipo],
            ['Cantidad', d.articulos.map(function (a) { return a.cantidad + ' × ' + a.producto + (a.descripcion ? ' · ' + a.descripcion : ''); }).join('\n')],
            ['Forma de envío', d.forma_envio], ['Descripción', d.motivo], ['Folio', d.referencia], ['Factura', d.cliente],
            ['Devolución', tipo === 'devolucion' ? d.dev_motivo + ' · ' + (d.dev_checklist.length === cfg.checklist.length ? 'cumple todos los puntos' : 'no cumple todos los puntos') : '']]),
          bloque('Datos administrativos', pasoAdmin, [
            ['Solicita', d.solicitante], ['Departamento', d.area], ['Costo', d.costo_absorbe + (d.costo_detalle ? ': ' + d.costo_detalle : '')],
            ['Correo', d.correo], ['Teléfono', d.telefono]]),
          bloque('Fechas', pasoFechas, [
            [ENTREGAS.indexOf(tipo) >= 0 ? 'Fecha de entrega' : 'Fecha requerida', d.fecha_abierta === 'Sí' ? 'Fecha abierta' : dia(d.fecha_requerida)],
            ['Fecha de recolección', recoleccion], ['Tipo de solicitud', d.prioridad]]),
          bloque('Origen y destino', pasoRuta, [
            ['Lugar de salida', [d.origen_nombre, d.origen_ciudad].filter(Boolean).join(', ')],
            ['Lugar de entrega', [d.destino_nombre, d.destino_ciudad].filter(Boolean).join(', ')],
            ['Requiere cita', d.horario], ['Observaciones', d.observaciones]]),
          bloque('Cotización y documentos', pasoDocs, [
            ['Cotización', cotizaciones.length ? 'Adjunta (' + cotizaciones.length + ')' : 'No adjunta'],
            ['Documentos', generales.length ? generales.length + (generales.length === 1 ? ' archivo' : ' archivos') : 'Sin archivos'],
            ['Evidencias', tipo === 'devolucion' ? evidencias.length + (evidencias.length === 1 ? ' foto o video' : ' fotos o videos') : '']]));
      }

      anterior.addEventListener('click', function () { mostrar(paso - 1); });
      siguiente.addEventListener('click', function () {
        var r = revisar(activos()[paso].el);
        if (r.faltan.length) { enfocar(r.faltan[0]); return; }
        if (activos()[paso + 1] && activos()[paso + 1].el === pasoResumen) {
          /* Antes del resumen se revisa todo el formulario. */
          var todo = revisar(null);
          if (todo.faltan.length) { var k = 0, lista = activos(); for (; k < lista.length; k++) if (lista[k].el.contains(todo.faltan[0])) break; mostrar(k); enfocar(todo.faltan[0]); return; }
        }
        mostrar(paso + 1);
      });

      var form = h('form', { novalidate: true },
        h('h1', null, 'Nueva solicitud'), avance,
        pasoProducto, pasoMovimiento, pasoDetalle, pasoDevolucion, pasoAdmin, pasoFechas, pasoRuta, pasoDocs, pasoResumen,
        feedback,
        h('div', { class: 'acciones pasos-acciones' }, anterior, siguiente, enviar, h('span', { class: 'espacio' }),
          h('button', { class: 'liga', type: 'button', onclick: cancelar }, 'Cancelar')));
      if (cfg.sesion) {
        campos.correo.control.value = cfg.sesion.correo;
        campos.correo.control.readOnly = true;
        campos.correo.wrap.querySelector('label').appendChild(h('span', { class: 'gris' }, ' (tu correo de acceso)'));
      }

      /* Al elegir producto o movimiento se avanza solo (salvo «Otro», que pide especificar). */
      campos.producto_tipo.control.addEventListener('change', function () {
        actualizar();
        if (valor('producto_tipo') !== 'Otro') setTimeout(function () { if (paso === 0) mostrar(1); }, 250);
      });
      campos.tipo.control.addEventListener('change', function () {
        actualizar();
        if (valor('tipo') !== 'otro') setTimeout(function () { if (paso === 1) mostrar(2); }, 250);
      });
      form.addEventListener('change', actualizar);
      form.addEventListener('input', function (ev) { if (ev.target.type === 'date') actualizar(); });
      campos.dev_checklist.control.addEventListener('change', revisarChecklist);
      revisarChecklist();
      mostrar(0);

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
        var porSubir = (datos.tipo === 'devolucion' ? evidencias.map(function (f) { return { file: f, clase: 'evidencia' }; }) : [])
          .concat(cotizaciones.map(function (f) { return { file: f, clase: 'cotizacion' }; }))
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
        ['Producto', s.producto], ['Movimiento', s.tipo_nombre], ['Tipo de solicitud', s.prioridad], ['Forma de envío', s.forma_envio]]
        .concat(U.fechas(s), [
        ['Lugar de salida', s.origen_nombre + ', ' + s.origen_ciudad], ['Lugar de entrega', s.destino_nombre + ', ' + s.destino_ciudad],
        ['Fecha programada', s.fecha_programada ? U.dia(s.fecha_programada) : ''], ['Folio CSTEXT', s.folio_cstext],
        ['Transportista', s.transportista], ['Guía o referencia', s.guia]
      ]).filter(function (d) { return d[1]; });

      var partes = [h('section', { class: 'tarjeta' },
        h('div', { class: 'cabecera' },
          h('div', null, h('div', { class: 'folio' }, s.folio), h('p', { class: 'gris chico', style: 'margin:6px 0 0' }, 'Creada el ' + U.dia(s.creada) + ' por ' + s.solicitante)),
          h('div', { class: 'acciones' }, U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('span', { class: 'pill urgente' }, 'Urgente') : null)),
        U.pasos(cfg, s.estado),
        h('dl', { class: 'datos', style: 'margin-top:16px' }, datos.map(function (d) { return h('div', null, h('dt', null, d[0]), h('dd', null, d[1])); })))];

      if (s.aut_estado) partes.push(U.autorizacion(s));
      if (s.estado === 'informacion') partes.push(h('div', { class: 'aviso aviso-alerta' }, h('p', null, h('b', null, 'Logística necesita más información. '), 'Lee el último mensaje y responde abajo.')));
      if (s.tipo === 'devolucion') partes.push(U.devolucion(cfg, s));
      if (s.paq_total) partes.push(U.paquetes(s));

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

      var subir = h('input', { type: 'file', multiple: true, class: 'entrada', accept: '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.csv,.docx,.doc,.pptx,.eml,.msg,.txt' });
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
            a.evidencia ? h('span', { class: 'pill e-informacion', style: 'margin-left:6px' }, 'Evidencia') : null,
            a.cotizacion ? h('span', { class: 'pill e-programada', style: 'margin-left:6px' }, 'Cotización') : null),
            h('span', { class: 'gris chico' }, U.tamano(a.tamano) + ' · ' + a.autor));
        })) : h('p', { class: 'gris' }, 'Sin archivos.'),
        abierta ? h('div', { style: 'margin-top:12px' }, h('label', { class: 'chico', style: 'font-weight:600' }, 'Agregar archivos'), subir) : null));

      partes.push(h('section', { class: 'tarjeta' }, h('h2', null, 'Detalle de la solicitud'),
        h('dl', { class: 'datos' }, U.detalle(s).filter(function (d) { return d[1]; }).map(function (d) {
          return h('div', null, h('dt', null, d[0]), h('dd', { style: 'font-weight:500;white-space:pre-wrap' }, d[1]));
        }))));

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
