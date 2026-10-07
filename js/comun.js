/* Utilidades compartidas del formulario y del panel. Todo el texto se inserta como texto (sin innerHTML). */
window.U = (function () {
  'use strict';

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = true;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  function mount(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    for (var i = 1; i < arguments.length; i++) add(el, arguments[i]);
    if (el.id === 'main') window.scrollTo(0, 0); // solo al cambiar de pantalla
    return el;
  }

  /* Llama a una función del servidor (servidor.js, sobre Firebase) y devuelve una promesa con un mensaje claro si falla. */
  function run(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return Promise.resolve().then(function () {
      if (!window.API || typeof window.API[fn] !== 'function') throw new Error('Función no disponible: ' + fn);
      return window.API[fn].apply(null, args);
    }).catch(function (e) {
      var msg = window.API && window.API.amigable ? window.API.amigable(e) : String((e && e.message) || e);
      var err = new Error(msg.replace(/^SESION:\s*/, ''));
      err.sesion = /^SESION:/.test(msg);
      err.cuentaExiste = !!(e && e.cuentaExiste);
      throw err;
    });
  }

  /* Lee un archivo como base64. Las fotos (JPG, PNG, WEBP) se reducen en el navegador (lado mayor 2000 px) para no llenar la base. */
  function leerArchivo(file, maxMb) {
    return new Promise(function (resolve, reject) {
      if (file.size > maxMb * 1048576) { reject(new Error('«' + file.name + '» pesa más de ' + maxMb + ' MB.')); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('No se pudo leer ' + file.name + '.')); };
      fr.onload = function () {
        var dataUrl = String(fr.result), salida = { nombre: file.name, mime: file.type || 'application/octet-stream', tamano: file.size, base64: dataUrl.split(',')[1] || '' };
        if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 350000) { resolve(salida); return; }
        var img = new Image();
        img.onload = function () {
          var escala = Math.min(1, 2000 / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          var reducida = c.toDataURL('image/jpeg', 0.82), b64 = reducida.split(',')[1] || '';
          if (b64.length * 0.75 >= file.size) { resolve(salida); return; }
          resolve({ nombre: file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', mime: 'image/jpeg', tamano: Math.round(b64.length * 0.75), base64: b64 });
        };
        img.onerror = function () { resolve(salida); };
        img.src = dataUrl;
      };
      fr.readAsDataURL(file);
    });
  }

  function toast(msg, mal) {
    var box = document.getElementById('avisos');
    var el = h('div', { class: 'toast' + (mal ? ' mal' : ''), role: mal ? 'alert' : 'status' }, msg);
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, mal ? 8000 : 4500);
  }

  function ocupado(btn, si, texto) {
    if (si) { btn.dataset.t = btn.textContent; btn.disabled = true; btn.textContent = texto || 'Procesando…'; }
    else { btn.disabled = false; if (btn.dataset.t) btn.textContent = btn.dataset.t; }
  }

  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function dia(ymd) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(ymd || '')) return '';
    return Number(ymd.slice(8, 10)) + ' ' + MESES[Number(ymd.slice(5, 7)) - 1] + ' ' + ymd.slice(0, 4);
  }
  /* Solo se muestran fechas; la hora se guarda internamente para el orden y las validaciones. */
  function fechaHora(iso) { return iso ? dia(iso) : ''; }
  function tamano(b) { b = Number(b) || 0; return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }

  function estado(cfg, k) { return h('span', { class: 'pill e-' + k }, cfg.estados[k] || k); }

  function logos(destino) {
    mount(destino,
      h('span', { class: 'marco marco-ces' }, h('img', { src: 'img/logo-cesantoni.png', alt: 'CESANTONI · Porcelanato Premium' })),
      h('span', { class: 'divisor', 'aria-hidden': 'true' }),
      h('span', { class: 'marco marco-somos' }, h('img', { src: 'img/logo-somos.png', alt: 'Somos Logística CESANTONI' })));
  }

  /* Pasos visibles para quien solicita. */
  var PASOS = ['recibida', 'en_revision', 'programada', 'en_transito', 'completada'];
  function pasos(cfg, actual) {
    var ref = actual === 'informacion' ? 'en_revision' : actual;
    var idx = PASOS.indexOf(ref);
    if (idx < 0) return null;
    return h('div', { class: 'pasos', 'aria-label': 'Avance de la solicitud' }, PASOS.map(function (k, i) {
      return h('div', { class: (i <= idx ? 'hecho' : '') + (i === idx ? ' actual' : '') }, cfg.estados[k]);
    }));
  }

  /* Bloque de devolución: motivo, checklist con ✓ / ✗ y si cumple todos los puntos. */
  function devolucion(cfg, s) {
    var marcados = String(s.dev_checklist || '').split('\n');
    var cumple = s.dev_cumple === 'Sí';
    return h('section', { class: 'tarjeta' },
      h('div', { class: 'cabecera' }, h('h2', { style: 'margin:0' }, 'Devolución · ' + (s.dev_motivo || 'sin motivo')),
        h('span', { class: 'pill ' + (cumple ? 'e-completada' : 'e-rechazada') }, cumple ? 'Cumple todos los puntos' : 'No cumple todos los puntos')),
      h('ul', { class: 'checklist' }, cfg.checklist.map(function (p) {
        var ok = marcados.indexOf(p) >= 0;
        return h('li', { class: ok ? 'si' : 'no' }, h('span', { 'aria-hidden': 'true' }, ok ? '✓' : '✗'), h('span', { class: 'sr-only' }, ok ? 'Cumple: ' : 'No cumple: '), p);
      })));
  }

  /* Bloque de paquetería: cada tipo de paquete y los totales. */
  function paquetes(s) {
    return h('section', { class: 'tarjeta' },
      h('div', { class: 'cabecera' }, h('h2', { style: 'margin:0' }, 'Paquetería'),
        h('span', { class: 'pill e-programada' }, s.paq_total + (Number(s.paq_total) === 1 ? ' paquete' : ' paquetes') + ' · ' + s.paq_peso_kg + ' kg')),
      h('ul', { class: 'checklist' }, String(s.paquetes || '').split('\n').filter(Boolean).map(function (l) {
        return h('li', null, h('span', { 'aria-hidden': 'true' }, '▪'), l);
      })),
      h('p', { class: 'gris chico', style: 'margin:10px 0 0' }, 'Medidas en cm (largo × ancho × alto). Peso volumétrico aprox.: ' + s.paq_vol_kg + ' kg.'));
  }

  /* Fechas de la solicitud: requerida (o abierta) y recolección. */
  var ENTREGAS = ['envio', 'entrega_recoleccion', 'mercadotecnia'];
  function fechas(s) {
    var out = [];
    if (s.fecha_requerida || s.fecha_abierta) out.push([ENTREGAS.indexOf(s.tipo) >= 0 ? 'Fecha de entrega' : 'Fecha requerida', s.fecha_abierta === 'Sí' ? 'Fecha abierta' : dia(s.fecha_requerida)]);
    if (s.recoleccion === 'Sí') out.push(['Fecha de recolección', s.recoleccion_abierta === 'Sí' ? 'Fecha abierta' : dia(s.fecha_recoleccion)]);
    else if (s.recoleccion === 'No') out.push(['Recolección', 'No requiere recolección']);
    return out;
  }
  function articulos(s) {
    return [].concat(s.articulos || []).map(function (a) { return a.cantidad + ' × ' + a.producto + (a.descripcion ? ' · ' + a.descripcion : ''); }).join('\n');
  }
  function contacto(nombre, tel) { return [nombre, tel].filter(Boolean).join(' · '); }
  /* Datos de la solicitud que ven quien solicita y Logística. */
  function detalle(s) {
    return [['Departamento solicitante', s.area], ['Teléfono', s.telefono],
      ['¿Quién absorbe el costo?', s.costo_absorbe ? s.costo_absorbe + (s.costo_detalle ? ': ' + s.costo_detalle : '') : ''],
      ['Artículos', articulos(s)], ['Folio', s.referencia], ['Factura', s.cliente], ['Requiere cita', s.horario],
      ['Dirección de salida', s.origen_direccion], ['Contacto en salida', contacto(s.origen_contacto, s.origen_telefono)], ['Referencias de salida', s.origen_referencias],
      ['Dirección de entrega', s.destino_direccion], ['Contacto en entrega', contacto(s.destino_contacto, s.destino_telefono)], ['Referencias de entrega', s.destino_referencias],
      ['Descripción de la solicitud', s.motivo], ['Observaciones', s.observaciones]];
  }
  var AUT_CLASE = { 'Pendiente de autorización': 'e-en_revision', 'Autorizado': 'e-completada', 'Rechazado': 'e-rechazada' };
  /* Solicitudes con menos de 48 horas: autorización del Gerente de Área. */
  function autorizacion(s) {
    return h('section', { class: 'tarjeta' },
      h('div', { class: 'cabecera' }, h('h2', { style: 'margin:0' }, 'Autorización de Gerente de Área'),
        h('span', { class: 'pill ' + (AUT_CLASE[s.aut_estado] || '') }, s.aut_estado)),
      h('p', { class: 'gris chico', style: 'margin:8px 0 12px' }, 'Solicitud con menos de 48 horas de anticipación: pueden aplicarse sobrecostos.'),
      h('dl', { class: 'datos' }, [['Nombre del Gerente', s.aut_gerente], ['Estatus', s.aut_estado], ['Fecha de autorización', dia(s.aut_fecha)],
        ['Comentario o evidencia', s.aut_comentario], ['Registró', s.aut_registro]].filter(function (d) { return d[1]; }).map(function (d) {
        return h('div', null, h('dt', null, d[0]), h('dd', { style: 'white-space:pre-wrap' }, d[1]));
      })));
  }

  /* Archivos: los enlaces «#archivo:FOLIO:ID» se abren armando el archivo desde la base. */
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#archivo:"]');
    if (!a) return;
    ev.preventDefault();
    var p = a.getAttribute('href').split(':');
    var ventana = window.open('', '_blank');
    if (ventana) ventana.document.write('<p style="font-family:sans-serif">Abriendo archivo…</p>');
    run('archivo', decodeURIComponent(p[1]), p[2]).then(function (r) {
      return fetch(r.dataUrl).then(function (x) { return x.blob(); }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        if (ventana) ventana.location.href = url;
        else { var d = h('a', { href: url, download: r.nombre }); document.body.appendChild(d); d.click(); d.remove(); }
      });
    }).catch(function (e) { if (ventana) ventana.close(); toast(e.message, true); });
  });

  return { h: h, mount: mount, devolucion: devolucion, paquetes: paquetes, fechas: fechas, articulos: articulos, detalle: detalle, autorizacion: autorizacion, run: run, leerArchivo: leerArchivo, toast: toast, ocupado: ocupado, dia: dia,
    fechaHora: fechaHora, tamano: tamano, estado: estado, logos: logos, pasos: pasos };
})();
