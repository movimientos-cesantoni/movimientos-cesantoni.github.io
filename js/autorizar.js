/* Autorización de costo desde el correo (sin cuenta). La liga trae un token de un solo uso. */
import * as API from './servidor.js?v=18';
window.API = API;
(function () {
    'use strict';
    var h = U.h, mount = U.mount, run = U.run;
    var params = new URLSearchParams(location.search);
    var token = params.get('t') || '', sugerida = params.get('d') || '';
    var main = document.getElementById('main');

    function datos(filas) {
      return h('dl', { class: 'datos' }, filas.map(function (x) { return h('div', null, h('dt', null, x.k), h('dd', { style: 'white-space:pre-wrap' }, x.v)); }));
    }
    function resultado(a) {
      var ok = a.estado === 'Autorizado';
      return h('div', { class: 'aviso ' + (ok ? 'aviso-ok' : a.estado === 'Rechazado' ? 'aviso-mal' : 'aviso-info') },
        h('p', null, h('b', null, ok ? '✓ Costo autorizado' : a.estado === 'Rechazado' ? '✕ Autorización rechazada' : 'Esta liga ya no está vigente')),
        a.respondida ? h('p', { class: 'chico' }, (ok ? 'Autorizado por: ' : 'Respondido por: ') + [a.nombre, a.correo].filter(Boolean).join(' · ') + ' · ' + U.dia(a.respondida)) : null,
        a.comentario ? h('p', { class: 'chico' }, 'Comentario: ' + a.comentario) : null,
        h('p', { class: 'chico' }, a.respondida ? 'La respuesta quedó registrada en el folio ' + a.folio + ' como evidencia. Ya puedes cerrar esta página.'
          : 'Logística envió una liga más reciente o registró la autorización en el panel.'));
    }

    function pintar(a) {
      var cabecera = h('section', { class: 'tarjeta' },
        h('div', { class: 'cabecera' }, h('div', null, h('p', { class: 'gris chico', style: 'margin:0' }, 'Folio'), h('div', { class: 'folio' }, a.folio)),
          h('span', { class: 'pill ' + (a.estado === 'Autorizado' ? 'e-completada' : a.estado === 'Rechazado' ? 'e-rechazada' : 'e-en_revision') }, a.estado)),
        h('p', { class: 'gris', style: 'margin:12px 0 0' }, 'Solicitud de autorización enviada a ' + a.correo + ' · ' + U.dia(a.enviada) + '. Motivo: ' + a.motivo + '.'));
      var resumen = h('section', { class: 'tarjeta' }, h('h2', null, 'Resumen de la solicitud'), datos(a.resumen.filter(function (x) { return x.k !== 'Folio'; })));
      var cotizacion = h('section', { class: 'tarjeta' }, h('h2', null, 'Cotización'),
        a.archivos.length ? h('ul', { class: 'archivos' }, a.archivos.map(function (x) {
          return h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.nombre), h('span', { class: 'gris chico' }, U.tamano(x.tamano)));
        })) : h('p', { class: 'gris' }, a.costo ? 'Costo: ' + a.costo : 'Sin archivo de cotización.'));
      if (a.estado !== 'Pendiente de autorización') { mount(main, cabecera, resultado(a), resumen, cotizacion); return; }

      var nombre = h('input', { class: 'entrada', id: 'a-nombre', maxlength: 120, autocomplete: 'name' });
      var comentario = h('textarea', { class: 'entrada', id: 'a-comentario', rows: 2, maxlength: 1000 });
      var autorizar = h('button', { class: 'btn btn-ok', type: 'button' }, '✓ Autorizar costo');
      var rechazar = h('button', { class: 'btn btn-mal', type: 'button' }, '✕ Rechazar');
      var error = h('p', { class: 'chico', style: 'color:var(--mal)', role: 'alert', hidden: true });
      function responder(decision, btn) {
        error.hidden = true;
        if (decision === 'rechazar' && !comentario.value.trim()) { error.textContent = 'Escribe el motivo del rechazo.'; error.hidden = false; comentario.focus(); return; }
        U.ocupado(btn, true, 'Registrando…');
        run('autorizacionResponder', token, decision, nombre.value, comentario.value).then(pintar)
          .catch(function (e) { U.ocupado(btn, false); error.textContent = e.message; error.hidden = false; });
      }
      autorizar.addEventListener('click', function () { responder('autorizar', autorizar); });
      rechazar.addEventListener('click', function () { responder('rechazar', rechazar); });
      var decidir = h('section', { class: 'tarjeta decision' }, h('h2', null, sugerida === 'rechazar' ? '¿Rechazas el costo de este servicio?' : '¿Autorizas el costo de este servicio?'),
        h('p', { class: 'gris chico' }, 'Tu respuesta queda registrada en el folio con tu correo (' + a.correo + ') y la fecha, como evidencia de la autorización.'),
        h('div', { class: 'rejilla' },
          h('div', { class: 'campo' }, h('label', { for: 'a-nombre' }, 'Tu nombre (opcional)'), nombre),
          h('div', { class: 'campo' }, h('label', { for: 'a-comentario' }, sugerida === 'rechazar' ? 'Motivo del rechazo' : 'Comentario (opcional)'), comentario)),
        error,
        h('div', { class: 'acciones', style: 'margin-top:14px' }, sugerida === 'rechazar' ? [rechazar, autorizar] : [autorizar, rechazar]));
      mount(main, cabecera, decidir, resumen, cotizacion);
    }

    U.logos(document.getElementById('logos'));
    API.iniciar('autorizar').then(function () {
      if (!token) throw new Error('Abre esta página desde la liga del correo de autorización.');
      return run('autorizacionVer', token);
    }).then(pintar).catch(function (e) { mount(main, h('div', { class: 'aviso aviso-mal' }, h('p', null, e.message))); });
})();
