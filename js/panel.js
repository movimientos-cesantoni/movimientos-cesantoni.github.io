/* Panel de Logística (Liga 2): base de solicitudes. Misma interfaz que la versión probada, con acceso de Firebase. */
import * as API from './servidor.js?v=4';
window.API = API;
(function () {
    'use strict';
    var h = U.h, mount = U.mount;
    var PARAMS = { folio: new URLSearchParams(location.search).get('folio') || '' };
    var main = document.getElementById('main');
    var KEY = 'sol_panel_token';
    var cfg = null, yo = null, datos = null;
    var filtros = { vista: 'abiertas', q: '', tipo: '', area: '', prioridad: '', responsable: '' };

    function token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
    function setToken(t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { /* nada */ } }
    function run() {
      var args = Array.prototype.slice.call(arguments);
      args.splice(1, 0, token());
      return U.run.apply(null, args).catch(function (e) {
        if (e.sesion) { setToken(''); yo = null; login(); U.toast(e.message, true); }
        throw e;
      });
    }
    function fallo(e) { if (!e.sesion) U.toast(e.message, true); }
    function campo(label, control, extra) {
      control.id = control.id || 'c' + Math.random().toString(36).slice(2, 8);
      return h('div', { class: 'campo' + (extra ? ' ' + extra : '') }, h('label', { for: control.id }, label), control);
    }
    function lista(opciones, valor) {
      var el = h('select', { class: 'entrada' }, opciones.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
      el.value = valor || '';
      return el;
    }
    function tipoNombre(k) { var t = cfg.tipos.filter(function (x) { return x[0] === k; })[0]; return t ? t[1] : k; }
    function nombreDe(usuario) { var u = (datos ? datos.usuarios : []).filter(function (x) { return x.usuario === usuario; })[0]; return u ? u.nombre : usuario; }
    function devolucionPendiente(s) { return s.tipo === 'devolucion' && s.dev_cumple === 'No' && cfg.abiertos.indexOf(s.estado) >= 0; }

    /* ---------------------------------------------------------------- sesión */
    function init() {
      U.logos(document.getElementById('logos'));
      API.iniciar('panel').then(function () { return U.run('configPortal'); }).then(function (c) {
        cfg = c;
        return U.run('adminEstado');
      }).then(function (e) {
        if (!e.tieneAdmin) return primerAdmin();
        return U.run('adminYo').then(function (u) { yo = u; despues(); }).catch(function () { login(); });
      }).catch(function (e) { mount(main, h('div', { class: 'aviso aviso-mal' }, h('p', null, e.message))); });
    }

    function nav(activa) {
      var items = yo && !yo.debe_cambiar ? [['solicitudes', 'Solicitudes'], ['config', 'Configuración']] : [];
      mount(document.getElementById('nav'), items.map(function (i) {
        return h('button', { type: 'button', 'aria-current': activa === i[0] ? 'page' : null, onclick: function () { i[0] === 'config' ? configuracion() : tablero(); } }, i[1]);
      }), yo ? h('button', { type: 'button', onclick: salir }, 'Salir (' + yo.nombre + ')') : null);
    }

    function login() {
      nav('');
      var u = h('input', { class: 'entrada', type: 'email', autocomplete: 'username', placeholder: 'tu.correo@cesantoni.com.mx' });
      var p = h('input', { class: 'entrada', type: 'password', autocomplete: 'current-password' });
      var err = h('p', { class: 'chico', style: 'color:var(--mal)', hidden: true, role: 'alert' });
      var btn = h('button', { class: 'btn btn-pri', type: 'submit' }, 'Entrar');
      var olvide = h('button', { class: 'liga chico', type: 'button' }, 'Olvidé mi contraseña');
      olvide.addEventListener('click', function () {
        if (!u.value.trim()) { err.textContent = 'Escribe tu correo y vuelve a dar clic en «Olvidé mi contraseña».'; err.hidden = false; return; }
        U.run('adminRecuperar', u.value.trim()).then(function (m) { U.toast(m); });
      });
      var f = h('form', { class: 'tarjeta login', novalidate: true }, h('h1', null, 'Panel de Logística'),
        h('p', { class: 'gris' }, 'Acceso para el equipo de Logística de CESANTONI.'),
        campo('Correo', u), h('div', { style: 'height:10px' }), campo('Contraseña', p), h('div', { style: 'height:12px' }), err,
        h('div', { class: 'acciones' }, btn, olvide),
        h('p', { class: 'gris chico', style: 'margin-top:12px' }, 'Si ya tienes acceso al panel de proveedores, entra con el mismo correo y contraseña una vez que un administrador te invite.'));
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); err.hidden = true;
        U.ocupado(btn, true, 'Entrando…');
        U.run('adminEntrar', u.value.trim(), p.value).then(function (r) { setToken(r.token); yo = r.usuario; despues(); })
          .catch(function (e) { U.ocupado(btn, false); err.textContent = e.message; err.hidden = false; });
      });
      mount(main, f);
      u.focus();
    }

    function salir() { U.run('adminSalir').catch(function () {}).then(function () { setToken(''); yo = null; login(); }); }

    /* Primera vez: crea la cuenta del administrador principal (igual que el panel de proveedores). */
    function primerAdmin() {
      nav('');
      var n = h('input', { class: 'entrada', autocomplete: 'name' });
      var c = h('input', { class: 'entrada', type: 'email', autocomplete: 'username' });
      var p1 = h('input', { class: 'entrada', type: 'password', autocomplete: 'new-password' });
      var p2 = h('input', { class: 'entrada', type: 'password', autocomplete: 'new-password' });
      var btn = h('button', { class: 'btn btn-pri', type: 'submit' }, 'Crear administrador');
      var f = h('form', { class: 'tarjeta login', novalidate: true }, h('h1', null, 'Configura el panel'),
        h('p', { class: 'gris' }, 'Crea la cuenta del administrador principal. Si ya usas el panel de proveedores, puedes usar el mismo correo y contraseña.'),
        campo('Nombre', n), h('div', { style: 'height:10px' }), campo('Correo', c), h('div', { style: 'height:10px' }),
        campo('Contraseña (mínimo 10, con letras y números)', p1), h('div', { style: 'height:10px' }), campo('Repite la contraseña', p2), h('div', { style: 'height:12px' }), btn);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (p1.value !== p2.value) { U.toast('Las contraseñas no coinciden.', true); return; }
        U.ocupado(btn, true, 'Creando…');
        U.run('adminPrimer', { nombre: n.value, correo: c.value, clave: p1.value }).then(function (r) { setToken(r.token); yo = r.usuario; despues(); })
          .catch(function (e) { U.ocupado(btn, false); U.toast(e.message, true); });
      });
      mount(main, f);
    }

    function despues() {
      if (yo.debe_cambiar) return cambiarPassword(true);
      if (PARAMS.folio) { var f = PARAMS.folio; PARAMS.folio = ''; return cargar().then(function () { detalle(f); }); }
      cargar().then(tablero);
    }

    function cambiarPassword(forzado) {
      nav('config');
      var a = h('input', { class: 'entrada', type: 'password', autocomplete: 'current-password' });
      var n = h('input', { class: 'entrada', type: 'password', autocomplete: 'new-password' });
      var r = h('input', { class: 'entrada', type: 'password', autocomplete: 'new-password' });
      var btn = h('button', { class: 'btn btn-pri', type: 'submit' }, 'Guardar contraseña');
      var f = h('form', { class: 'tarjeta login', novalidate: true }, h('h1', null, 'Cambia tu contraseña'),
        forzado ? h('p', { class: 'gris' }, 'Por seguridad, define una contraseña personal (mínimo 10 caracteres).') : null,
        campo('Contraseña actual', a), h('div', { style: 'height:10px' }), campo('Nueva contraseña', n), h('div', { style: 'height:10px' }),
        campo('Repite la nueva', r), h('div', { style: 'height:12px' }), btn);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (n.value !== r.value) { U.toast('Las contraseñas no coinciden.', true); return; }
        U.ocupado(btn, true, 'Guardando…');
        run('adminCambiarPassword', a.value, n.value).then(function (u) { yo = u; U.toast('Contraseña actualizada.'); despues(); })
          .catch(function (e) { U.ocupado(btn, false); fallo(e); });
      });
      mount(main, f);
    }

    function cargar() { return run('adminDatos').then(function (d) { datos = d; yo = d.yo; }).catch(fallo); }

    /* ---------------------------------------------------------------- tablero */
    var VISTAS = [
      ['abiertas', 'Abiertas', function (s) { return cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['nuevas', 'Nuevas sin revisar', function (s) { return s.estado === 'recibida'; }],
      ['urgentes', 'Urgentes abiertas', function (s) { return s.prioridad === 'Urgente' && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['devoluciones', 'Devoluciones que no cumplen', devolucionPendiente],
      ['sin_cstext', 'Sin folio CSTEXT', function (s) { return !s.folio_cstext && ['programada', 'en_transito', 'completada'].indexOf(s.estado) >= 0; }],
      ['mias', 'Asignadas a mí', function (s) { return s.responsable === yo.usuario && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['cerradas', 'Cerradas', function (s) { return cfg.abiertos.indexOf(s.estado) < 0; }],
      ['todas', 'Todas', function () { return true; }]
    ];

    function tablero() {
      nav('solicitudes');
      if (!datos) { mount(main, h('p', { class: 'gris' }, 'Cargando…')); return; }
      var tabla = h('div');
      var kpis = h('div', { class: 'kpis' });
      function pintarKpis() {
        mount(kpis, VISTAS.slice(0, -1).map(function (v) {
          var n = datos.solicitudes.filter(v[2]).length;
          return h('button', { type: 'button', class: 'kpi', 'aria-pressed': String(filtros.vista === v[0]),
            onclick: function () { filtros.vista = filtros.vista === v[0] ? 'todas' : v[0]; pintarKpis(); pintar(); } }, h('b', null, String(n)), h('span', null, v[1]));
        }));
      }
      function filtradas() {
        var vista = VISTAS.filter(function (v) { return v[0] === filtros.vista; })[0] || VISTAS[VISTAS.length - 1];
        var q = filtros.q.toLowerCase();
        return datos.solicitudes.filter(function (s) {
          return vista[2](s) && (!filtros.tipo || s.tipo === filtros.tipo) && (!filtros.area || s.area === filtros.area) &&
            (!filtros.prioridad || s.prioridad === filtros.prioridad) && (!filtros.responsable || s.responsable === filtros.responsable) &&
            (!q || [s.folio, s.folio_cstext, s.solicitante, s.cliente, s.referencia, s.origen, s.destino, s.transportista, s.guia].join(' ').toLowerCase().indexOf(q) >= 0);
        });
      }
      function pintar() {
        var items = filtradas();
        if (!items.length) { mount(tabla, h('div', { class: 'tarjeta', style: 'text-align:center' }, h('p', { class: 'gris', style: 'margin:0' }, 'No hay solicitudes con estos filtros.'))); return; }
        mount(tabla, h('p', { class: 'gris chico' }, items.length + (items.length === 1 ? ' solicitud' : ' solicitudes')),
          h('div', { class: 'tabla-caja' }, h('table', null,
            h('thead', null, h('tr', null, ['Folio', 'Estado', 'Tipo', 'Solicita', 'Ruta', 'Programada', 'Responsable', 'Transportista'].map(function (t) { return h('th', null, t); }))),
            h('tbody', null, items.map(function (s) {
              var tr = h('tr', { tabindex: '0' },
                h('td', { style: 'white-space:nowrap' }, h('b', null, s.folio), s.folio_cstext ? h('div', { class: 'sub' }, s.folio_cstext) : null,
                  h('div', { class: 'sub' }, U.dia(s.creada))),
                h('td', null, U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('div', { style: 'margin-top:4px' }, h('span', { class: 'pill urgente' }, 'Urgente')) : null),
                h('td', null, tipoNombre(s.tipo), s.tipo === 'devolucion' ? h('div', { style: 'margin-top:4px' },
                  h('span', { class: 'pill ' + (s.dev_cumple === 'Sí' ? 'e-completada' : 'e-rechazada') }, s.dev_cumple === 'Sí' ? 'Cumple' : 'No cumple')) : null,
                  s.forma_envio ? h('div', { class: 'sub' }, s.forma_envio + (s.paq_total ? ' · ' + s.paq_total + ' paq. · ' + s.paq_peso_kg + ' kg' : '')) : null,
                  s.referencia ? h('div', { class: 'sub' }, 'Folio ' + s.referencia) : null,
                  s.cita === 'Sí' ? h('div', { style: 'margin-top:4px' }, h('span', { class: 'pill e-informacion' }, 'Requiere cita')) : null),
                h('td', null, s.solicitante, h('div', { class: 'sub' }, s.area)),
                h('td', null, s.origen, h('div', { class: 'sub' }, '→ ' + s.destino)),
                h('td', { style: 'white-space:nowrap' }, s.fecha_programada ? U.dia(s.fecha_programada) : h('span', { class: 'gris' }, '—'),
                  s.categorizacion ? h('div', { class: 'sub' }, s.categorizacion) : null),
                h('td', null, s.responsable ? nombreDe(s.responsable) : h('span', { class: 'gris' }, 'Sin asignar')),
                h('td', null, s.transportista || h('span', { class: 'gris' }, '—'), s.guia ? h('div', { class: 'sub' }, s.guia) : null));
              tr.addEventListener('click', function () { detalle(s.folio); });
              tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') detalle(s.folio); });
              return tr;
            })))));
      }
      function filtro(key, el) { el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', function () { filtros[key] = el.value.trim(); pintar(); }); return el; }
      var q = filtro('q', h('input', { class: 'entrada', type: 'search', placeholder: 'Folio, factura, solicitante, ciudad, guía…', value: filtros.q }));
      var acciones = h('div', { class: 'acciones' },
        h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cargar().then(tablero); } }, 'Actualizar'),
        h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { exportar(filtradas()); } }, 'Exportar a Excel (CSV)'));
      mount(main,
        h('div', { class: 'cabecera', style: 'margin-bottom:14px' }, h('h1', { style: 'margin:0' }, 'Solicitudes'), acciones),
        kpis,
        h('div', { class: 'filtros' },
          h('div', { class: 'busqueda' }, campo('Buscar', q)),
          campo('Tipo', filtro('tipo', lista([['', 'Todos']].concat(cfg.tipos.map(function (t) { return [t[0], t[1]]; })), filtros.tipo))),
          campo('Área', filtro('area', lista([['', 'Todas']].concat(cfg.areas.map(function (a) { return [a, a]; })), filtros.area))),
          campo('Prioridad', filtro('prioridad', lista([['', 'Todas'], ['Normal', 'Normal'], ['Urgente', 'Urgente']], filtros.prioridad))),
          campo('Responsable', filtro('responsable', lista([['', 'Todos']].concat(datos.usuarios.map(function (u) { return [u.usuario, u.nombre]; })), filtros.responsable))),
          h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { filtros = { vista: 'todas', q: '', tipo: '', area: '', prioridad: '', responsable: '' }; tablero(); } }, 'Limpiar')),
        tabla);
      pintarKpis();
      pintar();
    }

    function exportar(items) {
      var cols = [['folio', 'Folio'], ['creada', 'Creada'], ['estado', 'Estado'], ['prioridad', 'Prioridad'], ['tipo', 'Tipo'], ['area', 'Área'],
        ['solicitante', 'Solicitante'], ['correo', 'Correo'], ['referencia', 'Folio'], ['cliente', 'Factura'], ['cita', 'Requiere cita'],
        ['origen', 'Origen'], ['destino', 'Destino'], ['forma_envio', 'Forma de envío'], ['paq_total', 'Paquetes'],
        ['paq_peso_kg', 'Peso paquetes (kg)'], ['dev_motivo', 'Motivo devolución'], ['dev_cumple', 'Devolución cumple'],
        ['folio_cstext', 'Folio CSTEXT'], ['categorizacion', 'Categorización'], ['responsable', 'Responsable'], ['transportista', 'Transportista'],
        ['unidad_asignada', 'Unidad'],
        ['guia', 'Guía'], ['fecha_programada', 'Fecha programada']];
      var cel = function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      var filas = [cols.map(function (c) { return c[1]; })].concat(items.map(function (s) {
        return cols.map(function (c) { return c[0] === 'estado' ? cfg.estados[s.estado] : c[0] === 'tipo' ? tipoNombre(s.tipo) : s[c[0]]; });
      }));
      var blob = new Blob(['﻿' + filas.map(function (r) { return r.map(cel).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = h('a', { href: URL.createObjectURL(blob), download: 'Solicitudes_' + cfg.hoy + '.csv' });
      document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
    }

    /* ---------------------------------------------------------------- detalle */
    function detalle(folio) {
      nav('solicitudes');
      mount(main, h('p', { class: 'gris' }, 'Abriendo ' + folio + '…'));
      run('adminDetalle', folio).then(pintarDetalle).catch(function (e) {
        fallo(e);
        if (!e.sesion) mount(main, h('button', { class: 'liga volver', type: 'button', onclick: tablero }, '← Volver'), h('div', { class: 'aviso aviso-mal' }, h('p', null, e.message)));
      });
    }

    function pintarDetalle(s) {
      var volver = h('button', { class: 'liga volver', type: 'button', onclick: function () { cargar().then(tablero); } }, '← Volver a solicitudes');
      var info = function (pares) {
        return h('dl', { class: 'datos' }, pares.filter(function (d) { return d[1]; }).map(function (d) {
          return h('div', null, h('dt', null, d[0]), h('dd', { style: 'white-space:pre-wrap' }, d[1]));
        }));
      };

      var cabecera = h('section', { class: 'tarjeta' },
        h('div', { class: 'cabecera' },
          h('div', null, h('div', { class: 'folio' }, s.folio), h('p', { class: 'gris chico', style: 'margin:6px 0 0' }, tipoNombre(s.tipo) + ' · creada ' + U.fechaHora(s.creada))),
          h('div', { class: 'acciones' }, s.folio_cstext ? h('span', { class: 'pill e-programada' }, s.folio_cstext) : null,
            U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('span', { class: 'pill urgente' }, 'Urgente') : null)),
        U.pasos(cfg, s.estado),
        h('div', { style: 'height:12px' }),
        info([['Solicita', s.solicitante + ' · ' + s.area], ['Correo', s.correo], ['Teléfono', s.telefono],
          ['Forma de envío', s.forma_envio], ['Folio', s.referencia], ['Factura', s.cliente], ['Requiere cita', s.horario]]));

      var ruta = h('section', { class: 'tarjeta' }, h('h2', null, 'Ruta y motivo'),
        info([['Origen', s.origen_nombre + '\n' + s.origen_direccion + '\n' + s.origen_ciudad], ['Contacto en origen', s.origen_contacto],
          ['Destino', s.destino_nombre + '\n' + s.destino_direccion + '\n' + s.destino_ciudad], ['Contacto en destino', s.destino_contacto]]),
        h('div', { style: 'height:12px' }),
        info([['Motivo y detalles', s.motivo]]));
      var devolucion = s.tipo === 'devolucion' ? U.devolucion(cfg, s) : null;
      var paquetes = s.paq_total ? U.paquetes(s) : null;

      var hilo = h('section', { class: 'tarjeta' }, h('h2', null, 'Seguimiento'),
        h('ul', { class: 'hilo' }, s.seguimiento.slice().reverse().map(function (m) {
          return h('li', { class: m.visible ? null : 'interno' },
            h('div', { class: 'quien' }, U.fechaHora(m.fecha) + ' · ' + m.autor + (m.visible ? '' : ' · nota interna'), ' ', m.estado ? U.estado(cfg, m.estado) : null),
            h('div', { class: 'texto' }, m.mensaje));
        })));

      /* formulario de actualización */
      var estado = lista(Object.keys(cfg.estados).map(function (k) { return [k, cfg.estados[k]]; }), s.estado);
      var resp = lista([['', 'Sin asignar']].concat(datos.usuarios.map(function (u) { return [u.usuario, u.nombre]; })), s.responsable);
      var cstext = h('input', { class: 'entrada', value: s.folio_cstext || '', maxlength: 20, placeholder: 'CSTEXT756' });
      var categ = lista([['', 'Sin categorizar']].concat(datos.categorias.map(function (c) { return [c, c]; })), s.categorizacion);
      /* Transportista y unidad sugieren el catálogo pero aceptan escribir otro. */
      var transp = h('input', { class: 'entrada', value: s.transportista || '', maxlength: 160, list: 'cat-transportistas', placeholder: 'Escribe o elige' });
      var unidad = h('input', { class: 'entrada', value: s.unidad_asignada || '', maxlength: 160, list: 'cat-unidades', placeholder: 'Tipo y placas' });
      var catalogos = [h('datalist', { id: 'cat-transportistas' }, datos.transportistas.map(function (t) { return h('option', { value: t }); })),
        h('datalist', { id: 'cat-unidades' }, datos.tipos_unidad.map(function (t) { return h('option', { value: t }); }))];
      var guia = h('input', { class: 'entrada', value: s.guia || '', maxlength: 160 });
      var fprog = h('input', { class: 'entrada', type: 'date', value: s.fecha_programada || '' });
      var notas = h('textarea', { class: 'entrada', rows: 2, maxlength: 2000 }); notas.value = s.notas_internas || '';
      var mensaje = h('textarea', { class: 'entrada', rows: 3, maxlength: 2000, placeholder: 'Ej.: Programada para el jueves con Transportes X.' });
      var visible = h('input', { type: 'checkbox', checked: true });
      var avisar = h('input', { type: 'checkbox', checked: true });
      var guardar = h('button', { class: 'btn btn-pri', type: 'submit' }, 'Guardar cambios');
      var form = h('form', { class: 'tarjeta', novalidate: true }, h('h2', null, 'Actualizar'),
        h('div', { class: 'rejilla' },
          campo('Estado', estado), campo('Responsable', resp),
          campo('Folio CSTEXT', cstext), campo('Categorización', categ),
          campo('Transportista', transp), campo('Unidad asignada', unidad),
          campo('Guía o referencia', guia), campo('Fecha programada', fprog),
          campo('Notas internas (no las ve quien solicita)', notas, 'todo'),
          campo('Mensaje', mensaje, 'todo'), catalogos),
        h('p', { class: 'gris chico' }, 'Solo seguimiento: los importes se registran en «Fletes 2026» con el folio CSTEXT.'),
        h('div', { style: 'margin:10px 0 14px;display:grid;gap:6px' },
          h('label', { class: 'chico' }, visible, ' El mensaje lo ve quien solicita (si no, queda como nota interna)'),
          h('label', { class: 'chico' }, avisar, ' Avisar por correo a ' + s.correo)),
        guardar);
      visible.addEventListener('change', function () { avisar.disabled = !visible.checked; if (!visible.checked) avisar.checked = false; });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        U.ocupado(guardar, true, 'Guardando…');
        run('adminActualizar', s.folio, { estado: estado.value, responsable: resp.value, transportista: transp.value, unidad_asignada: unidad.value,
          guia: guia.value, fecha_programada: fprog.value, folio_cstext: cstext.value, categorizacion: categ.value,
          notas_internas: notas.value, mensaje: mensaje.value,
          visible: visible.checked, notificar: avisar.checked })
          .then(function (r) { U.toast('Cambios guardados.' + (avisar.checked && (r.estado !== s.estado || mensaje.value.trim()) ? ' Se avisó por correo.' : '')); pintarDetalle(r); })
          .catch(function (e) { U.ocupado(guardar, false); fallo(e); });
      });

      var subir = h('input', { type: 'file', multiple: true, class: 'entrada' });
      subir.addEventListener('change', function () {
        var archivos = Array.prototype.slice.call(subir.files);
        subir.disabled = true;
        archivos.reduce(function (p, f) {
          return p.then(function () { return U.leerArchivo(f, cfg.max_mb).then(function (a) { return run('adminSubirArchivo', s.folio, a); }); });
        }, Promise.resolve()).then(function () { U.toast('Archivos agregados.'); detalle(s.folio); })
          .catch(function (e) { fallo(e); detalle(s.folio); });
      });
      var archivos = h('section', { class: 'tarjeta' }, h('h2', null, 'Archivos'),
        s.archivos.length ? h('ul', { class: 'archivos' }, s.archivos.map(function (a) {
          return h('li', null, h('span', null, h('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.nombre),
            a.evidencia ? h('span', { class: 'pill e-informacion', style: 'margin-left:6px' }, 'Evidencia') : null),
            h('span', { class: 'gris chico' }, U.tamano(a.tamano) + ' · ' + a.autor));
        })) : h('p', { class: 'gris' }, 'Sin archivos.'),
        h('div', { style: 'margin-top:10px' }, h('label', { class: 'chico', style: 'font-weight:600' }, 'Agregar (evidencia, POD, cotización…)'), subir));

      var correos = h('section', { class: 'tarjeta' }, h('h2', null, 'Correos enviados'),
        s.correos.length ? h('ul', { class: 'archivos' }, s.correos.slice().reverse().map(function (c) {
          return h('li', null, h('span', null, c.asunto, h('div', { class: 'gris chico' }, 'Para ' + c.para + (c.error ? ' · Error: ' + c.error : ''))),
            h('span', { class: 'gris chico', style: 'white-space:nowrap' }, (c.estado === 'enviado' ? '✓ ' : '✗ ') + U.fechaHora(c.fecha)));
        })) : h('p', { class: 'gris' }, 'Sin correos.'));

      mount(main, volver, cabecera, h('div', { class: 'detalle' }, h('div', null, devolucion, paquetes, ruta, hilo, correos), h('div', null, form, archivos)));
    }

    /* ---------------------------------------------------------------- configuración */
    function configuracion() {
      nav('config');
      mount(main, h('p', { class: 'gris' }, 'Cargando…'));
      run('adminConfig').then(function (c) {
        var esAdmin = yo.rol === 'admin';
        var avisos = h('textarea', { class: 'entrada', rows: 3, disabled: !esAdmin }); avisos.value = c.avisos;
        var guardarAvisos = h('button', { class: 'btn btn-osc btn-chico', type: 'button', hidden: !esAdmin }, 'Guardar');
        guardarAvisos.addEventListener('click', function () {
          U.ocupado(guardarAvisos, true, 'Guardando…');
          run('adminGuardarAvisos', avisos.value).then(function (v) { U.ocupado(guardarAvisos, false); avisos.value = v; U.toast('Correos de aviso guardados.'); })
            .catch(function (e) { U.ocupado(guardarAvisos, false); fallo(e); });
        });
        var partes = [h('h1', null, 'Configuración'),
          h('section', { class: 'tarjeta' }, h('h2', null, 'Avisos de nuevas solicitudes'),
            h('p', { class: 'gris chico' }, 'Correos que reciben cada solicitud nueva y los mensajes de solicitudes sin responsable. Sepáralos con comas.'),
            avisos, h('div', { style: 'margin-top:8px' }, guardarAvisos)),
          h('section', { class: 'tarjeta' }, h('h2', null, 'Enlaces'),
            h('p', null, 'Portal para solicitar (compártelo con las áreas): ', h('br'), h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.url)),
            h('p', null, 'Este panel (base de Logística): ', h('br'), h('a', { href: c.panel, target: '_blank', rel: 'noopener' }, c.panel))),
          h('section', { class: 'tarjeta' }, h('h2', null, 'Mi cuenta'), h('p', null, yo.nombre + ' · ' + yo.correo + ' · ' + (yo.rol === 'admin' ? 'Administrador' : 'Operador')),
            h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cambiarPassword(false); } }, 'Cambiar mi contraseña'))];
        if (esAdmin) partes.push(usuarios(c.usuarios));
        mount(main, partes);
      }).catch(fallo);
    }

    function usuarios(cuentas) {
      var tabla = h('div', { class: 'tabla-caja', style: 'margin-bottom:16px' }, h('table', null,
        h('thead', null, h('tr', null, ['Nombre', 'Correo', 'Rol', 'Estado', 'Último acceso'].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, cuentas.map(function (u) {
          var estado = u.pendiente ? 'Invitado (aún no entra)' : (u.activo ? (u.debe_cambiar ? 'Activo · debe cambiar contraseña' : 'Activo') : 'Inactivo');
          var tr = h('tr', null, h('td', null, h('b', null, u.nombre)), h('td', null, u.correo || '—'),
            h('td', null, u.rol === 'admin' ? 'Administrador' : 'Operador'), h('td', null, estado),
            h('td', null, u.ultimo_acceso ? U.fechaHora(u.ultimo_acceso) : 'Nunca'));
          tr.addEventListener('click', function () { if (u.pendiente) U.toast('Invitación pendiente: entrará con la contraseña que ya usa.'); else editar(u); });
          return tr;
        }))));
      var form = h('form', { novalidate: true });
      function editar(u) {
        var nuevo = !u;
        var nombre = h('input', { class: 'entrada', value: nuevo ? '' : u.nombre });
        var correo = h('input', { class: 'entrada', type: 'email', value: nuevo ? '' : u.correo, disabled: !nuevo });
        var rol = lista([['operador', 'Operador'], ['admin', 'Administrador']], nuevo ? 'operador' : u.rol);
        var activo = h('input', { type: 'checkbox', checked: nuevo || u.activo });
        var pass = h('input', { class: 'entrada', type: 'text', autocomplete: 'off', placeholder: 'Mínimo 10, con letras y números' });
        var reset = h('input', { type: 'checkbox' });
        var btn = h('button', { class: 'btn btn-pri btn-chico', type: 'submit' }, nuevo ? 'Dar de alta' : 'Guardar cambios');
        mount(form, h('h3', null, nuevo ? 'Dar de alta a una persona' : 'Editar a ' + u.nombre),
          h('div', { class: 'rejilla' }, campo('Nombre', nombre), campo('Correo (también recibe avisos de sus solicitudes)', correo), campo('Rol', rol),
            nuevo ? campo('Contraseña temporal', pass) : h('label', { class: 'chico', style: 'align-self:end' }, activo, ' Activo'),
            nuevo ? h('p', { class: 'gris chico todo', style: 'margin:0' }, 'Si esa persona ya tiene cuenta (por ejemplo, en el panel de proveedores), queda invitada y entra con su misma contraseña.')
              : h('label', { class: 'chico todo' }, reset, ' Enviarle un correo para crear una nueva contraseña')),
          h('div', { class: 'acciones', style: 'margin-top:12px' }, btn, h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { editar(null); } }, 'Limpiar')));
        form.onsubmit = function (ev) {
          ev.preventDefault();
          U.ocupado(btn, true, 'Guardando…');
          run('adminGuardarUsuario', { usuario: nuevo ? '' : u.usuario, nombre: nombre.value.trim(), correo: correo.value.trim(), rol: rol.value,
            activo: activo.checked, password: pass.value, restablecer: reset.checked })
            .then(function () { U.toast(nuevo ? 'Listo. Comparte la contraseña temporal por un medio seguro.' : 'Cambios guardados.'); return cargar(); })
            .then(configuracion).catch(function (e) { U.ocupado(btn, false); fallo(e); });
        };
      }
      editar(null);
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Personal del panel'),
        h('p', { class: 'gris chico' }, 'Toca a una persona para editarla.'), tabla, form);
    }

    init();
  })();
