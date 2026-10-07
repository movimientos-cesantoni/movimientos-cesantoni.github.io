/* Panel de Logística (Liga 2): base de solicitudes. Misma interfaz que la versión probada, con acceso de Firebase. */
import * as API from './servidor.js?v=13';
import { libroXlsx } from './xlsx.js?v=12';
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
    /* Perfiles: admin (todo), planeador (opera solicitudes) y facturación (plantillas de entregas concluidas). */
    var ROL_NOMBRE = { admin: 'Administrador', planeador: 'Planeador', facturacion: 'Facturación' };
    function rolNombre(r) { return ROL_NOMBRE[r] || r; }
    function inicioRol() { return yo && yo.rol === 'facturacion' ? facturacion() : tablero(); }
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
      var items = [];
      if (yo && !yo.debe_cambiar) {
        if (yo.rol !== 'facturacion') items.push(['solicitudes', 'Solicitudes']);
        if (yo.rol !== 'planeador') items.push(['facturacion', 'Facturación']);
        items.push(['config', 'Configuración']);
      }
      mount(document.getElementById('nav'), items.map(function (i) {
        return h('button', { type: 'button', 'aria-current': activa === i[0] ? 'page' : null, onclick: function () {
          if (i[0] === 'config') configuracion(); else if (i[0] === 'facturacion') cargar().then(facturacion); else cargar().then(tablero);
        } }, i[1]);
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
      cargar().then(inicioRol);
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
      ['por_enviar', 'Por enviar a autorización', function (s) { return s.aut_estado === 'Pendiente de autorización' && !s.aut_enviada && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['autorizacion', 'Esperando autorización', function (s) { return s.aut_estado === 'Pendiente de autorización' && !!s.aut_enviada && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['fecha_abierta', 'Con fecha abierta', function (s) { return s.fecha_abierta === 'Sí' && cfg.abiertos.indexOf(s.estado) >= 0; }],
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
            (!q || [s.folio, s.folio_cstext, s.solicitante, s.area, s.producto, s.articulos, s.cliente, s.referencia, s.origen, s.destino, s.transportista, s.guia].join(' ').toLowerCase().indexOf(q) >= 0);
        });
      }
      function pintar() {
        var items = filtradas();
        if (!items.length) { mount(tabla, h('div', { class: 'tarjeta', style: 'text-align:center' }, h('p', { class: 'gris', style: 'margin:0' }, 'No hay solicitudes con estos filtros.'))); return; }
        mount(tabla, h('p', { class: 'gris chico' }, items.length + (items.length === 1 ? ' solicitud' : ' solicitudes')),
          h('div', { class: 'tabla-caja' }, h('table', null,
            h('thead', null, h('tr', null, ['Folio', 'Estado', 'Producto y movimiento', 'Solicita', 'Ruta', 'Fechas', 'Responsable', 'Transportista'].map(function (t) { return h('th', null, t); }))),
            h('tbody', null, items.map(function (s) {
              var tr = h('tr', { tabindex: '0' },
                h('td', { style: 'white-space:nowrap' }, h('b', null, s.folio), s.folio_cstext && s.folio_cstext !== s.folio ? h('div', { class: 'sub' }, s.folio_cstext) : null,
                  h('div', { class: 'sub' }, U.dia(s.creada))),
                h('td', null, U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('div', { style: 'margin-top:4px' }, h('span', { class: 'pill urgente' }, 'Urgente')) : null,
                  s.aut_estado ? h('div', { style: 'margin-top:4px' }, h('span', { class: 'pill ' + (s.aut_estado === 'Autorizado' ? 'e-completada' : s.aut_estado === 'Rechazado' ? 'e-rechazada' : 'e-en_revision') },
                    s.aut_estado === 'Pendiente de autorización' ? 'Pendiente de autorización' : 'Gerente: ' + s.aut_estado)) : null),
                h('td', null, h('b', null, s.producto || '—'), h('div', { class: 'sub' }, s.tipo_nombre), s.tipo === 'devolucion' ? h('div', { style: 'margin-top:4px' },
                  h('span', { class: 'pill ' + (s.dev_cumple === 'Sí' ? 'e-completada' : 'e-rechazada') }, s.dev_cumple === 'Sí' ? 'Cumple' : 'No cumple')) : null,
                  s.forma_envio ? h('div', { class: 'sub' }, s.forma_envio + (s.paq_total ? ' · ' + s.paq_total + ' paq. · ' + s.paq_peso_kg + ' kg' : '')) : null,
                  s.referencia ? h('div', { class: 'sub' }, 'Folio ' + s.referencia) : null,
                  s.cita === 'Sí' ? h('div', { style: 'margin-top:4px' }, h('span', { class: 'pill e-informacion' }, 'Requiere cita')) : null),
                h('td', null, s.solicitante, h('div', { class: 'sub' }, s.area)),
                h('td', null, s.origen, h('div', { class: 'sub' }, '→ ' + s.destino)),
                h('td', { style: 'white-space:nowrap' },
                  s.fecha_abierta === 'Sí' ? h('span', { class: 'pill e-informacion' }, 'Fecha abierta') : (U.dia(s.fecha_requerida) || h('span', { class: 'gris' }, '—')),
                  s.recoleccion === 'Sí' ? h('div', { class: 'sub' }, 'Recolección: ' + (s.recoleccion_abierta === 'Sí' ? 'abierta' : U.dia(s.fecha_recoleccion))) : null,
                  s.fecha_programada ? h('div', { class: 'sub' }, 'Programada: ' + U.dia(s.fecha_programada)) : null,
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
          campo('Departamento', filtro('area', lista([['', 'Todos']].concat(departamentos().map(function (a) { return [a, a]; })), filtros.area))),
          campo('Tipo de solicitud', filtro('prioridad', lista([['', 'Todas'], ['Programado', 'Programado'], ['Urgente', 'Urgente']], filtros.prioridad))),
          campo('Responsable', filtro('responsable', lista([['', 'Todos']].concat(datos.usuarios.map(function (u) { return [u.usuario, u.nombre]; })), filtros.responsable))),
          h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { filtros = { vista: 'todas', q: '', tipo: '', area: '', prioridad: '', responsable: '' }; tablero(); } }, 'Limpiar')),
        tabla);
      pintarKpis();
      pintar();
    }

    /* Departamentos del catálogo más los que se hayan escrito a mano. */
    function departamentos() {
      var vistos = cfg.areas.slice();
      datos.solicitudes.forEach(function (s) { if (s.area && vistos.indexOf(s.area) < 0) vistos.push(s.area); });
      return vistos;
    }

    function exportar(items) {
      var cols = [['folio', 'Folio'], ['creada', 'Creada'], ['estado', 'Estado'], ['prioridad', 'Tipo de solicitud'], ['producto', 'Producto'], ['tipo', 'Movimiento'],
        ['articulos', 'Artículos'], ['area', 'Departamento solicitante'], ['costo', 'Quién absorbe el costo'],
        ['fecha_requerida', 'Fecha requerida'], ['fecha_abierta', 'Fecha abierta'], ['recoleccion', 'Requiere recolección'], ['fecha_recoleccion', 'Fecha de recolección'],
        ['fuera_tiempo', 'Menos de 48 horas'], ['aut_estado', 'Autorización gerente'], ['aut_gerente', 'Gerente que autoriza'],
        ['solicitante', 'Solicitante'], ['correo', 'Correo'], ['referencia', 'Folio'], ['cliente', 'Factura'], ['cita', 'Requiere cita'],
        ['origen', 'Origen'], ['destino', 'Destino'], ['forma_envio', 'Forma de envío'], ['paq_total', 'Paquetes'],
        ['paq_peso_kg', 'Peso paquetes (kg)'], ['dev_motivo', 'Motivo devolución'], ['dev_cumple', 'Devolución cumple'],
        ['folio_cstext', 'Folio CSTEXT'], ['categorizacion', 'Categorización'], ['responsable', 'Responsable'], ['transportista', 'Transportista'],
        ['unidad_asignada', 'Unidad'],
        ['guia', 'Guía'], ['fecha_programada', 'Fecha programada']];
      var cel = function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      var filas = [cols.map(function (c) { return c[1]; })].concat(items.map(function (s) {
        return cols.map(function (c) { return c[0] === 'estado' ? cfg.estados[s.estado] : c[0] === 'tipo' ? s.tipo_nombre : c[0] === 'creada' ? String(s.creada).slice(0, 10) : s[c[0]]; });
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
      var puedeOperar = yo.rol !== 'facturacion', esAdmin = yo.rol === 'admin';
      var volver = h('button', { class: 'liga volver', type: 'button', onclick: function () { cargar().then(inicioRol); } }, puedeOperar ? '← Volver a solicitudes' : '← Volver a facturación');
      var info = function (pares) {
        return h('dl', { class: 'datos' }, pares.filter(function (d) { return d[1]; }).map(function (d) {
          return h('div', null, h('dt', null, d[0]), h('dd', { style: 'white-space:pre-wrap' }, d[1]));
        }));
      };

      var cabecera = h('section', { class: 'tarjeta' },
        h('div', { class: 'cabecera' },
          h('div', null, h('div', { class: 'folio' }, s.folio), h('p', { class: 'gris chico', style: 'margin:6px 0 0' }, (s.producto ? s.producto + ' · ' : '') + s.tipo_nombre + ' · creada ' + U.dia(s.creada))),
          h('div', { class: 'acciones' }, s.folio_cstext && s.folio_cstext !== s.folio ? h('span', { class: 'pill e-programada' }, s.folio_cstext) : null,
            U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('span', { class: 'pill urgente' }, 'Urgente') : null)),
        U.pasos(cfg, s.estado),
        h('div', { style: 'height:12px' }),
        info([['Solicita', s.solicitante + ' · ' + s.area], ['Correo', s.correo], ['Producto', s.producto], ['Movimiento', s.tipo_nombre],
          ['Tipo de solicitud', s.prioridad], ['Tipo de servicio', s.forma_envio]].concat(U.fechas(s))));

      var ruta = h('section', { class: 'tarjeta' }, h('h2', null, 'Ruta y detalle'), info(U.detalle(s)));

      var devolucion = s.tipo === 'devolucion' ? U.devolucion(cfg, s) : null;
      var paquetes = s.paq_total && !(s.articulos || []).some(function (a) { return a.largo || a.peso; }) ? U.paquetes(s) : null;

      var hilo = h('section', { class: 'tarjeta' }, h('h2', null, 'Seguimiento'),
        h('ul', { class: 'hilo' }, s.seguimiento.slice().reverse().map(function (m) {
          return h('li', { class: m.visible ? null : 'interno' },
            h('div', { class: 'quien' }, U.fechaHora(m.fecha) + ' · ' + m.autor + (m.visible ? '' : ' · nota interna'), ' ', m.estado ? U.estado(cfg, m.estado) : null),
            h('div', { class: 'texto' }, m.mensaje));
        })));

      /* formulario de actualización */
      var estado = lista(Object.keys(cfg.estados).map(function (k) { return [k, cfg.estados[k]]; }), s.estado);
      var resp = lista([['', 'Sin asignar']].concat(datos.usuarios.map(function (u) { return [u.usuario, u.nombre]; })), s.responsable);
      /* El folio CSTEXT se asigna solo al programar; solo el administrador lo corrige. */
      var cstext = h('input', { class: 'entrada', value: s.folio_cstext || '', maxlength: 20, disabled: !esAdmin, placeholder: 'Es el folio de la solicitud' });
      var monto = h('input', { class: 'entrada', inputmode: 'decimal', value: s.monto ? Number(s.monto).toFixed(2) : '', placeholder: '0.00' });
      var tipoMov = lista(datos.tipos.map(function (t) { return [t[0], t[1]]; }), s.tipo);
      var oFact = h('input', { class: 'entrada', value: s.origen_fact || '', maxlength: 160, placeholder: s.origen_direccion || 'Ej. CALERA' });
      var dFact = h('input', { class: 'entrada', value: s.destino_fact || '', maxlength: 160, placeholder: s.destino_direccion || 'Ej. Gómez Palacio, Dgo.' });
      var cliFact = h('input', { class: 'entrada', value: s.cliente_fact || '', maxlength: 160, placeholder: String((s.costo_absorbe === 'Otro' ? s.costo_detalle : s.costo_absorbe) || 'CESANTONI').toUpperCase() });
      var maniobra = lista([['No', 'No'], ['Sí', 'Sí']], s.maniobra || 'No');
      var cstCampo = h('input', { class: 'entrada', value: s.cst || 'CST', maxlength: 20 });
      var categ = lista([['', 'Sin categorizar']].concat(datos.categorias.map(function (c) { return [c, c]; })), s.categorizacion);
      /* Transportista y unidad sugieren el catálogo pero aceptan escribir otro. */
      var transp = h('input', { class: 'entrada', value: s.transportista || '', maxlength: 160, list: 'cat-transportistas', placeholder: 'Escribe o elige' });
      var unidad = h('input', { class: 'entrada', value: s.unidad_asignada || '', maxlength: 160, list: 'cat-unidades', placeholder: 'Tipo y placas' });
      var catalogos = [h('datalist', { id: 'cat-transportistas' }, datos.transportistas.map(function (t) { return h('option', { value: t }); })),
        h('datalist', { id: 'cat-unidades' }, datos.tipos_unidad.map(function (t) { return h('option', { value: t }); }))];
      var guia = h('input', { class: 'entrada', value: s.guia || '', maxlength: 160 });
      var fprog = h('input', { class: 'entrada', type: 'date', value: s.fecha_programada || '' });
      /* Fechas de quien solicita: Logística puede asignarlas después (por ejemplo, si quedó «Fecha abierta»). */
      var nuevo = s.fecha_entrega !== undefined;
      var freq = h('input', { class: 'entrada', type: 'date', value: s.fecha_requerida || '' });
      var fent = nuevo ? h('input', { class: 'entrada', type: 'date', value: s.fecha_entrega || '' }) : null;
      var frec = s.recoleccion === 'Sí' ? h('input', { class: 'entrada', type: 'date', value: s.fecha_recoleccion || '' }) : null;
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
          campo('Guía o referencia', guia), campo('Fecha de carga', fprog),
          campo('Monto ($)', monto), campo('Tipo de movimiento', tipoMov),
          campo((nuevo ? 'Fecha tentativa de recolección' : 'Fecha requerida') + (s.fecha_abierta === 'Sí' ? ' (abierta: asígnala aquí)' : ''), freq),
          fent ? campo('Fecha tentativa de entrega' + (s.fecha_abierta === 'Sí' ? ' (abierta: asígnala aquí)' : ''), fent) : null,
          frec ? campo((nuevo ? 'Recolección posterior' : 'Fecha de recolección') + (s.recoleccion_abierta === 'Sí' ? ' (abierta: asígnala aquí)' : ''), frec) : null,
          h('h3', { class: 'todo', style: 'margin:6px 0 0' }, 'Plantilla de facturación'),
          campo('Origen', oFact), campo('Destino', dFact), campo('Cliente', cliFact), campo('Requiere factura de maniobra', maniobra), campo('CST', cstCampo),
          campo('Notas internas (no las ve quien solicita)', notas, 'todo'),
          campo('Mensaje', mensaje, 'todo'), catalogos),
        h('p', { class: 'gris chico' }, 'El monto, la fecha de carga y los datos de la plantilla alimentan la vista de Facturación. El folio de la solicitud es su consecutivo CSTEXT.'),
        h('div', { style: 'margin:10px 0 14px;display:grid;gap:6px' },
          h('label', { class: 'chico' }, visible, ' El mensaje lo ve quien solicita (si no, queda como nota interna)'),
          h('label', { class: 'chico' }, avisar, ' Avisar por correo a ' + s.correo)),
        guardar);
      visible.addEventListener('change', function () { avisar.disabled = !visible.checked; if (!visible.checked) avisar.checked = false; });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        U.ocupado(guardar, true, 'Guardando…');
        var cambios = { estado: estado.value, responsable: resp.value, transportista: transp.value, unidad_asignada: unidad.value,
          guia: guia.value, fecha_programada: fprog.value, categorizacion: categ.value, monto: monto.value, tipo: tipoMov.value,
          origen_fact: oFact.value, destino_fact: dFact.value, cliente_fact: cliFact.value, maniobra: maniobra.value, cst: cstCampo.value,
          fecha_requerida: freq.value !== (s.fecha_requerida || '') ? freq.value : undefined,
          fecha_entrega: fent && fent.value !== (s.fecha_entrega || '') ? fent.value : undefined,
          fecha_recoleccion: frec && frec.value !== (s.fecha_recoleccion || '') ? frec.value : undefined };
        if (esAdmin) cambios.folio_cstext = cstext.value;
        run('adminActualizar', s.folio, Object.assign(cambios, {
          notas_internas: notas.value, mensaje: mensaje.value,
          visible: visible.checked, notificar: avisar.checked }))
          .then(function (r) { U.toast('Cambios guardados.' + (avisar.checked && (r.estado !== s.estado || mensaje.value.trim()) ? ' Se avisó por correo.' : '')); pintarDetalle(r); })
          .catch(function (e) { U.ocupado(guardar, false); fallo(e); });
      });

      /* Expediente del folio: cada bloque permite agregar su documento (cotización, autorización, salida…). */
      var archivos = U.expediente(s, !puedeOperar ? null : function (clase, lista) {
        lista.reduce(function (p, f) {
          return p.then(function () { return U.leerArchivo(f, cfg.max_mb).then(function (a) { a.clase = clase; return run('adminSubirArchivo', s.folio, a); }); });
        }, Promise.resolve()).then(function () { U.toast('Archivos agregados al folio.'); detalle(s.folio); })
          .catch(function (e) { fallo(e); detalle(s.folio); });
      });

      /* Autorización de costo: envío por correo con «Autorizar costo» / «Rechazar», o registro manual. */
      var autCorreo = h('input', { class: 'entrada', type: 'email', value: s.aut_correo || '', maxlength: 160, placeholder: 'gerente@cesantoni.com.mx' });
      var autCosto = h('input', { class: 'entrada', value: s.costo_cotizado || '', maxlength: 160, placeholder: 'Ej.: $8,500 + IVA (cotización Paqueteexpress)' });
      var nCot = s.archivos.filter(function (a) { return a.clase === 'cotizacion'; }).length;
      var enviarAut = h('button', { class: 'btn btn-pri btn-chico', type: 'button' }, s.aut_enviada ? 'Reenviar a autorización' : 'Enviar a autorización por correo');
      enviarAut.addEventListener('click', function () {
        U.ocupado(enviarAut, true, 'Enviando…');
        run('adminEnviarAutorizacion', s.folio, { correo: autCorreo.value, costo: autCosto.value }).then(function (r) {
          U.toast(r.envio && r.envio.estado === 'enviado' ? 'Solicitud de autorización enviada a ' + r.aut_correo + '.' : 'Se registró, pero el correo no salió: ' + ((r.envio && r.envio.error) || 'revisa «Correos enviados».'), !(r.envio && r.envio.estado === 'enviado'));
          pintarDetalle(r);
        }).catch(function (e) { U.ocupado(enviarAut, false); fallo(e); });
      });
      var autEst = lista(datos.aut_estados.map(function (x) { return [x, x]; }), s.aut_estado);
      var autQuien = h('input', { class: 'entrada', value: s.aut_gerente || '', maxlength: 120, placeholder: 'Nombre o correo' });
      var autFecha = h('input', { class: 'entrada', type: 'date', value: s.aut_fecha || '' });
      var autCom = h('textarea', { class: 'entrada', rows: 2, maxlength: 1000, placeholder: 'Ej.: Autorizó por teléfono; correo adjunto en Autorización.' }); autCom.value = s.aut_comentario || '';
      var guardarAut = h('button', { class: 'btn btn-chico', type: 'button' }, 'Guardar autorización');
      guardarAut.addEventListener('click', function () {
        U.ocupado(guardarAut, true, 'Guardando…');
        run('adminActualizar', s.folio, { aut_estado: autEst.value, aut_gerente: autQuien.value, aut_fecha: autFecha.value, aut_comentario: autCom.value })
          .then(function (r) { U.toast('Autorización guardada.'); pintarDetalle(r); }).catch(function (e) { U.ocupado(guardarAut, false); fallo(e); });
      });
      var pendiente = !s.aut_estado || s.aut_estado === 'Pendiente de autorización';
      var tarjetaAut = h('section', { class: 'tarjeta' }, h('h2', null, 'Autorización de costo'),
        U.autorizacion(s) || h('p', { class: 'gris chico' }, 'Esta solicitud no pidió autorización. Si hace falta, envíala desde aquí.'),
        pendiente && puedeOperar ? h('div', { class: 'rejilla', style: 'margin-top:10px' },
          campo('Correo de quien autoriza', autCorreo, 'todo'), campo('Costo / cotización (va en el correo)', autCosto, 'todo'),
          h('p', { class: 'gris chico todo', style: 'margin:0' }, nCot ? 'Se incluirá ' + (nCot === 1 ? 'la cotización adjunta' : 'las ' + nCot + ' cotizaciones adjuntas') + ' del expediente.'
            : 'Aún no hay cotización en el expediente: puedes agregarla abajo antes de enviar.'),
          h('div', { class: 'todo' }, enviarAut)) : null,
        s.aut_estado && puedeOperar ? h('details', { class: 'aut-manual' }, h('summary', null, 'Registrar a mano (por ejemplo, si autorizó por teléfono)'),
          h('div', { class: 'rejilla', style: 'margin-top:10px' }, campo('Estatus', autEst), campo('Autorizó', autQuien),
            campo('Fecha', autFecha), campo('Comentario', autCom, 'todo'), h('div', { class: 'todo' }, guardarAut))) : null,
        s.aut_estado ? h('p', { class: 'gris chico', style: 'margin:10px 0 0' }, 'Mientras no esté «Autorizado», la solicitud no puede pasar a Programada, En tránsito ni Completada.') : null);

      var correos = h('section', { class: 'tarjeta' }, h('h2', null, 'Correos enviados'),
        s.correos.length ? h('ul', { class: 'archivos' }, s.correos.slice().reverse().map(function (c) {
          return h('li', null, h('span', null, c.asunto, h('div', { class: 'gris chico' }, 'Para ' + c.para + (c.error ? ' · Error: ' + c.error : ''))),
            h('span', { class: 'gris chico', style: 'white-space:nowrap' }, (c.estado === 'enviado' ? '✓ ' : '✗ ') + U.fechaHora(c.fecha)));
        })) : h('p', { class: 'gris' }, 'Sin correos.'));

      mount(main, volver, cabecera, h('div', { class: 'detalle' }, h('div', null, devolucion, paquetes, ruta, archivos, hilo, correos), h('div', null, tarjetaAut, puedeOperar ? form : facturaInfo(s))));
    }

    /* Facturación ve los datos de la plantilla, sin poder cambiar la solicitud. */
    function facturaInfo(s) {
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Plantilla de facturación'),
        h('dl', { class: 'datos' }, [['Proveedor', s.transportista], ['Fecha de carga', U.dia(s.fecha_programada)], ['Monto', dinero(s.monto)],
          ['Consecutivo', s.folio_cstext], ['Cliente', s.cliente_fact], ['Requiere factura de maniobra', s.maniobra || 'No'], ['CST', s.cst || 'CST'],
          ['Facturada', s.facturada ? U.dia(s.facturada) + (s.facturada_por ? ' · ' + s.facturada_por : '') : 'Pendiente']]
          .filter(function (d) { return d[1]; }).map(function (d) { return h('div', null, h('dt', null, d[0]), h('dd', null, d[1])); })));
    }

    /* ---------------------------------------------------------------- facturación */
    function dinero(v) { return v === '' || v === undefined || v === null || isNaN(Number(v)) ? '' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    function diaCorto(ymd) { return /^\d{4}-\d{2}-\d{2}/.test(ymd || '') ? ymd.slice(8, 10) + '-' + MESES[Number(ymd.slice(5, 7)) - 1] + '-' + ymd.slice(2, 4) : ''; }
    /* Columnas de la plantilla (como la de Fletes): [título, tipo en Excel, ancho, valor]. */
    var COLS_FACT = [
      ['ORIGEN', 'izq', 26, function (s) { return s.origen_fact; }],
      ['DESTINO', 'izq', 26, function (s) { return s.destino_fact; }],
      ['FECHA CARGA', 'fecha', 12, function (s) { return s.fecha_programada || String(s.cerrada || '').slice(0, 10); }],
      ['MONTO', 'moneda', 13, function (s) { return s.monto === '' ? '' : Number(s.monto); }],
      ['CONSECUTIVO', 'texto', 15, function (s) { return s.folio_cstext; }],
      ['CLIENTE', 'texto', 18, function (s) { return s.cliente_fact; }],
      ['REQUIERE FACTURA DE MANIOBRA', 'texto', 20, function (s) { return s.maniobra || 'No'; }],
      ['CST', 'texto', 8, function (s) { return s.cst || 'CST'; }],
      ['SOLICITANTE', 'texto', 22, function (s) { return String(s.area || '').toUpperCase(); }]
    ];
    /* Filtros de facturación: estatus, mes de carga (AAAA-MM) y facturadas o pendientes. */
    var ESTATUS_FACT = [['completada', 'Completadas'], ['en_transito', 'En tránsito'], ['programada', 'Programadas'], ['activas', 'Todas']];
    var filtrosFact = { estatus: 'completada', mes: '', ver: 'pendientes' };
    var MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    function mesTexto(m) { return /^\d{4}-\d{2}$/.test(m || '') ? MESES_LARGO[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) : 'todos los meses'; }
    function bajarArchivo(blob, nombre) {
      var a = h('a', { href: URL.createObjectURL(blob), download: nombre });
      document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
    }
    var limpioArchivo = function (t) { return String(t).replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, '_'); };
    function facturacion() {
      nav('facturacion');
      if (!datos) { mount(main, h('p', { class: 'gris' }, 'Cargando…')); return; }
      var cont = h('div');
      var esAdmin = yo.rol === 'admin';
      var fecha = function (s) { return s.fecha_programada || String(s.cerrada || '').slice(0, 10); };
      var columnas = function (extra) {
        return COLS_FACT.concat(extra ? [['ESTATUS', 'texto', 14, function (s) { return cfg.estados[s.estado] || s.estado; }],
          ['FOLIO', 'texto', 15, function (s) { return s.folio; }], ['FACTURADA', 'fecha', 12, function (s) { return s.facturada || ''; }]] : []);
      };
      var hoja = function (nombre, items, extra) {
        var cols = columnas(extra);
        return { nombre: nombre, columnas: cols.map(function (c) { return { titulo: c[0], tipo: c[1], ancho: c[2] }; }),
          filas: items.map(function (s) { return cols.map(function (c) { return c[3](s); }); }) };
      };
      function grupos() {
        var mapa = {};
        datos.solicitudes.filter(function (s) {
          var f = fecha(s);
          var estatus = filtrosFact.estatus === 'activas' ? ['programada', 'en_transito', 'completada'].indexOf(s.estado) >= 0 : s.estado === filtrosFact.estatus;
          return estatus && (!filtrosFact.mes || f.slice(0, 7) === filtrosFact.mes) &&
            (filtrosFact.ver === 'todas' || (filtrosFact.ver === 'facturadas') === !!s.facturada);
        }).forEach(function (s) { var p = s.transportista || 'Sin proveedor asignado'; (mapa[p] = mapa[p] || []).push(s); });
        return Object.keys(mapa).sort().map(function (p) { return { proveedor: p, items: mapa[p].sort(function (a, b) { return fecha(a).localeCompare(fecha(b)); }) }; });
      }
      function descargar(g) {
        bajarArchivo(libroXlsx([hoja(g.proveedor, g.items, false)]), 'Plantilla_' + limpioArchivo(g.proveedor) + '_' + (filtrosFact.mes || cfg.hoy) + '.xlsx');
      }
      /* Administrador: un solo Excel del mes, con una hoja por proveedor y un resumen al inicio. */
      function descargarMes() {
        var lista = grupos();
        if (!lista.length) { U.toast('No hay entregas con estos filtros.', true); return; }
        var resumen = { nombre: 'Resumen', columnas: [{ titulo: 'PROVEEDOR', tipo: 'izq', ancho: 30 }, { titulo: 'ENTREGAS', tipo: 'texto', ancho: 12 },
          { titulo: 'MONTO TOTAL', tipo: 'moneda', ancho: 16 }, { titulo: 'SIN MONTO', tipo: 'texto', ancho: 12 }],
          filas: lista.map(function (g) {
            return [g.proveedor, String(g.items.length), g.items.reduce(function (t, s) { return t + (Number(s.monto) || 0); }, 0),
              String(g.items.filter(function (s) { return s.monto === ''; }).length)];
          }) };
        bajarArchivo(libroXlsx([resumen].concat(lista.map(function (g) { return hoja(g.proveedor, g.items, true); }))),
          'Facturacion_' + (filtrosFact.mes || 'todos') + '_' + limpioArchivo(ESTATUS_FACT.filter(function (e) { return e[0] === filtrosFact.estatus; })[0][1].split(' ')[0]) + '.xlsx');
      }
      function pintar() {
        var lista = grupos();
        var resumen = lista.reduce(function (t, g) { return { n: t.n + g.items.length, monto: t.monto + g.items.reduce(function (x, s) { return x + (Number(s.monto) || 0); }, 0) }; }, { n: 0, monto: 0 });
        mount(cabeceraMes, h('p', { class: 'gris chico', style: 'margin:0' }, h('b', null, mesTexto(filtrosFact.mes)), ' · ' + resumen.n + (resumen.n === 1 ? ' entrega' : ' entregas') +
          ' de ' + lista.length + (lista.length === 1 ? ' proveedor' : ' proveedores') + ' · total ' + (dinero(resumen.monto) || '$0.00')));
        if (!lista.length) { mount(cont, h('div', { class: 'tarjeta', style: 'text-align:center' }, h('p', { class: 'gris', style: 'margin:0' }, 'No hay entregas con estos filtros.'))); return; }
        mount(cont, lista.map(function (g) {
          var total = g.items.reduce(function (t, s) { return t + (Number(s.monto) || 0); }, 0);
          var faltan = g.items.filter(function (s) { return s.monto === '' || !s.folio_cstext; }).length;
          var pendientes = g.items.filter(function (s) { return !s.facturada; });
          var bajar = h('button', { class: 'btn btn-pri btn-chico', type: 'button', onclick: function () { descargar(g); } }, '⬇ Descargar plantilla (Excel)');
          /* Solo las entregas concluidas se marcan como facturadas. */
          var marcar = filtrosFact.estatus !== 'completada' ? null : h('button', { class: 'btn btn-chico', type: 'button' }, pendientes.length ? 'Marcar como facturadas' : 'Quitar marca de facturadas');
          if (marcar) marcar.addEventListener('click', function () {
            U.ocupado(marcar, true, 'Guardando…');
            run('adminMarcarFacturadas', (pendientes.length ? pendientes : g.items).map(function (s) { return s.folio; }), pendientes.length > 0)
              .then(function (d) { datos = d; U.toast(pendientes.length ? 'Marcadas como facturadas.' : 'Marca quitada.'); pintar(); })
              .catch(function (e) { U.ocupado(marcar, false); fallo(e); });
          });
          return h('section', { class: 'tarjeta fact-grupo' },
            h('div', { class: 'cabecera' }, h('div', null, h('h2', { style: 'margin:0' }, g.proveedor),
              h('p', { class: 'gris chico', style: 'margin:4px 0 0' }, g.items.length + (g.items.length === 1 ? ' entrega' : ' entregas') + ' · total ' + (dinero(total) || '$0.00'))),
              h('div', { class: 'acciones' }, bajar, marcar)),
            faltan ? h('div', { class: 'aviso aviso-alerta', style: 'margin:12px 0 0' }, h('p', null, faltan + (faltan === 1 ? ' entrega no tiene' : ' entregas no tienen') + ' monto o consecutivo. Pide al planeador que los capture antes de facturar.')) : null,
            h('div', { class: 'tabla-caja', style: 'margin-top:12px' }, h('table', { class: 'tabla-fact' },
              h('thead', null, h('tr', null, COLS_FACT.map(function (c) { return h('th', null, c[0]); }).concat([h('th', null, 'ESTATUS'), h('th', null, 'FACTURADA')]))),
              h('tbody', null, g.items.map(function (s) {
                var tr = h('tr', { tabindex: '0' }, COLS_FACT.map(function (c) {
                  var v = c[3](s);
                  return h('td', { class: c[1] === 'moneda' ? 'celda-monto' : c[1] === 'izq' ? '' : 'centro' }, c[1] === 'moneda' ? dinero(v) : c[1] === 'fecha' ? diaCorto(v) : v);
                }).concat([h('td', { class: 'centro' }, U.estado(cfg, s.estado)),
                  h('td', { class: 'centro', style: 'white-space:nowrap' }, s.facturada ? U.dia(s.facturada) : h('span', { class: 'gris' }, 'Pendiente'),
                  s.folio !== s.folio_cstext ? h('div', { class: 'sub' }, s.folio) : null)]));
                tr.addEventListener('click', function () { detalle(s.folio); });
                return tr;
              })))));
        }));
      }
      var estatus = lista(ESTATUS_FACT, filtrosFact.estatus);
      var mes = h('input', { class: 'entrada', type: 'month', value: filtrosFact.mes, 'aria-label': 'Mes de carga' });
      var ver = lista([['pendientes', 'Pendientes de facturar'], ['facturadas', 'Ya facturadas'], ['todas', 'Todas']], filtrosFact.ver);
      [[estatus, 'estatus'], [mes, 'mes'], [ver, 'ver']].forEach(function (x) { x[0].addEventListener('change', function () { filtrosFact[x[1]] = x[0].value; pintar(); }); });
      var cabeceraMes = h('div', { style: 'margin:-4px 0 14px' });
      mount(main,
        h('div', { class: 'cabecera', style: 'margin-bottom:14px' }, h('div', null, h('h1', { style: 'margin:0' }, 'Facturación'),
          h('p', { class: 'gris chico', style: 'margin:4px 0 0' }, 'Entregas por estatus y mes de carga, separadas por proveedor. Cada proveedor descarga su propia plantilla.')),
          h('div', { class: 'acciones' },
            esAdmin ? h('button', { class: 'btn btn-osc btn-chico', type: 'button', onclick: descargarMes }, '⬇ Excel del mes (una hoja por proveedor)') : null,
            h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cargar().then(facturacion); } }, 'Actualizar'))),
        h('div', { class: 'filtros filtros-fact' }, campo('Estatus', estatus), campo('Mes de carga', mes), campo('Ver', ver)),
        cabeceraMes,
        cont);
      pintar();
    }

    /* ---------------------------------------------------------------- configuración */
    function configuracion() {
      nav('config');
      mount(main, h('p', { class: 'gris' }, 'Cargando…'));
      run('adminConfig').then(function (c) {
        var esAdmin = yo.rol === 'admin';
        var partes = [h('h1', null, 'Configuración'),
          h('section', { class: 'tarjeta' }, h('h2', null, 'Mi cuenta'), h('p', null, yo.nombre + ' · ' + yo.correo + ' · ' + rolNombre(yo.rol)),
            h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cambiarPassword(false); } }, 'Cambiar mi contraseña')),
          h('section', { class: 'tarjeta' }, h('h2', null, 'Enlaces'),
            h('p', null, 'Portal para solicitar (compártelo con las áreas): ', h('br'), h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.url)),
            h('p', null, 'Este panel (base de Logística): ', h('br'), h('a', { href: c.panel, target: '_blank', rel: 'noopener' }, c.panel)))];
        if (esAdmin) partes.push(alertas(c), consecutivo(c), catalogos(c), usuarios(c.usuarios, c.roles));
        mount(main, partes);
      }).catch(fallo);
    }

    /* Alertas por correo: cada persona elige qué avisos recibe. */
    function alertas(c) {
      var filas = c.personas.map(function (p) { return { nombre: p.nombre || '', correo: p.correo, alertas: (p.alertas || []).slice() }; });
      var caja = h('div');
      function pintar() {
        mount(caja, filas.length ? h('div', { class: 'tabla-caja' }, h('table', { class: 'tabla-alertas' },
          h('thead', null, h('tr', null, [h('th', null, 'Nombre'), h('th', null, 'Correo')].concat(c.alertas.map(function (a) { return h('th', { class: 'centro' }, a[1]); }), [h('th', null, '')]))),
          h('tbody', null, filas.map(function (f, i) {
            var nombre = h('input', { class: 'entrada', value: f.nombre, placeholder: 'Nombre', 'aria-label': 'Nombre para alertas' });
            var correo = h('input', { class: 'entrada', type: 'email', value: f.correo, placeholder: 'correo@cesantoni.com.mx', 'aria-label': 'Correo para alertas' });
            nombre.addEventListener('input', function () { f.nombre = nombre.value; });
            correo.addEventListener('input', function () { f.correo = correo.value; });
            return h('tr', { class: 'sin-clic' }, h('td', null, nombre), h('td', null, correo), c.alertas.map(function (a) {
              var ck = h('input', { type: 'checkbox', checked: f.alertas.indexOf(a[0]) >= 0, 'aria-label': a[1] + ' · ' + (f.correo || 'persona ' + (i + 1)) });
              ck.addEventListener('change', function () { f.alertas = f.alertas.filter(function (x) { return x !== a[0]; }).concat(ck.checked ? [a[0]] : []); });
              return h('td', { class: 'centro' }, ck);
            }), h('td', null, h('button', { class: 'liga chico', type: 'button', onclick: function () { filas.splice(i, 1); pintar(); } }, 'Quitar')));
          })))) : h('p', { class: 'gris' }, 'Aún no hay personas. Agrega a quien debe recibir avisos.'));
      }
      var agregar = h('button', { class: 'btn btn-chico', type: 'button', onclick: function () {
        filas.push({ nombre: '', correo: '', alertas: c.alertas.map(function (a) { return a[0]; }) }); pintar();
        var ins = caja.querySelectorAll('input[type=email]'); if (ins.length) ins[ins.length - 1].focus();
      } }, '+ Agregar persona');
      var guardar = h('button', { class: 'btn btn-osc btn-chico', type: 'button' }, 'Guardar alertas');
      guardar.addEventListener('click', function () {
        U.ocupado(guardar, true, 'Guardando…');
        run('adminGuardarAlertas', filas).then(function (p) {
          U.ocupado(guardar, false); filas = p.map(function (x) { return { nombre: x.nombre, correo: x.correo, alertas: x.alertas.slice() }; }); pintar(); U.toast('Alertas guardadas.');
        }).catch(function (e) { U.ocupado(guardar, false); fallo(e); });
      });
      pintar();
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Alertas por correo'),
        h('p', { class: 'gris chico' }, 'Marca qué avisos automáticos recibe cada persona: solicitudes nuevas, modificaciones, mensajes, respuestas de autorización y entregas concluidas (para Facturación). Además, el responsable asignado recibe los avisos de sus solicitudes.'),
        caja, h('div', { class: 'acciones', style: 'margin-top:10px' }, agregar, guardar));
    }

    /* Consecutivo del folio CSTEXT: desde qué número sigue. */
    function consecutivo(c) {
      var n = h('input', { class: 'entrada', inputmode: 'numeric', value: c.cstext_siguiente || '', placeholder: 'Ej. 760', style: 'max-width:180px' });
      var vista = h('p', { class: 'gris chico' });
      var pintar = function () { var v = String(n.value).replace(/\D/g, ''); vista.textContent = v ? 'El siguiente folio será CSTEXT' + v.padStart(5, '0') + '.' : 'Escribe el número en el que te quedaste.'; };
      n.addEventListener('input', pintar); pintar();
      var guardar = h('button', { class: 'btn btn-osc btn-chico', type: 'button' }, 'Guardar consecutivo');
      guardar.addEventListener('click', function () {
        U.ocupado(guardar, true, 'Guardando…');
        run('adminGuardarCstext', n.value).then(function () { U.ocupado(guardar, false); U.toast('Consecutivo guardado.'); })
          .catch(function (e) { U.ocupado(guardar, false); fallo(e); });
      });
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Folio de solicitudes (CSTEXT)'),
        h('p', { class: 'gris chico' }, 'Cada solicitud nueva recibe su folio CSTEXT al enviarse (es el mismo consecutivo de la plantilla de facturación). ' + (c.cstext_ultimo ? 'Último asignado: ' + c.cstext_ultimo + '.' : 'Aún no se ha asignado ninguno.')),
        campo('Siguiente número', n), vista, guardar);
    }

    /* Catálogos: áreas, «¿Qué envías?» y tipos de movimiento. */
    function catalogos(c) {
      var areas = h('textarea', { class: 'entrada', rows: 8 }); areas.value = c.catalogos.areas.join('\n');
      var productos = h('textarea', { class: 'entrada', rows: 8 }); productos.value = c.catalogos.productos.join('\n');
      var tipos = c.catalogos.tipos.map(function (t) { return { clave: t.clave, nombre: t.nombre, descripcion: t.descripcion }; });
      var caja = h('div', { class: 'tipos-edit' });
      function pintar() {
        mount(caja, tipos.map(function (t, i) {
          var nombre = h('input', { class: 'entrada', value: t.nombre, placeholder: 'Nombre del movimiento', 'aria-label': 'Nombre del movimiento' });
          var desc = h('input', { class: 'entrada', value: t.descripcion, placeholder: 'Descripción (opcional)', 'aria-label': 'Descripción' });
          nombre.addEventListener('input', function () { t.nombre = nombre.value; });
          desc.addEventListener('input', function () { t.descripcion = desc.value; });
          var fijo = c.tipos_fijos.indexOf(t.clave) >= 0;
          return h('div', { class: 'tipo-fila' }, nombre, desc, fijo ? h('span', { class: 'gris chico', title: 'Lo usa el formulario' }, 'Fijo')
            : h('button', { class: 'liga chico', type: 'button', onclick: function () { tipos.splice(i, 1); pintar(); } }, 'Quitar'));
        }));
      }
      pintar();
      var guardar = h('button', { class: 'btn btn-osc btn-chico', type: 'button' }, 'Guardar catálogos');
      guardar.addEventListener('click', function () {
        U.ocupado(guardar, true, 'Guardando…');
        var linea = function (t) { return t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
        run('adminGuardarCatalogos', { areas: linea(areas), productos: linea(productos), tipos: tipos }).then(function (r) {
          U.ocupado(guardar, false); tipos = r.tipos; pintar(); U.toast('Catálogos guardados. El formulario ya los muestra.');
          return U.run('configPortal').then(function (x) { cfg = x; });
        }).catch(function (e) { U.ocupado(guardar, false); fallo(e); });
      });
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Catálogos'),
        h('p', { class: 'gris chico' }, 'Lo que ven las áreas en el formulario. Uno por renglón. «Otro» siempre aparece al final de «¿Qué envías?».'),
        h('div', { class: 'rejilla' }, campo('Departamento / Área', areas), campo('¿Qué envías?', productos),
          h('div', { class: 'todo' }, h('label', { class: 'etiqueta-panel' }, 'Tipos de movimiento (los usa el planeador para clasificar)'), caja,
            h('button', { class: 'btn btn-chico', type: 'button', style: 'margin-top:8px', onclick: function () { tipos.push({ clave: '', nombre: '', descripcion: '' }); pintar(); } }, '+ Agregar tipo de movimiento'))),
        h('div', { style: 'margin-top:12px' }, guardar));
    }

    function usuarios(cuentas, roles) {
      var tabla = h('div', { class: 'tabla-caja', style: 'margin-bottom:16px' }, h('table', null,
        h('thead', null, h('tr', null, ['Nombre', 'Correo', 'Rol', 'Estado', 'Último acceso'].map(function (t) { return h('th', null, t); }))),
        h('tbody', null, cuentas.map(function (u) {
          var estado = u.pendiente ? 'Invitado (aún no entra)' : (u.activo ? (u.debe_cambiar ? 'Activo · debe cambiar contraseña' : 'Activo') : 'Inactivo');
          var tr = h('tr', null, h('td', null, h('b', null, u.nombre)), h('td', null, u.correo || '—'),
            h('td', null, rolNombre(u.rol)), h('td', null, estado),
            h('td', null, u.ultimo_acceso ? U.fechaHora(u.ultimo_acceso) : 'Nunca'));
          tr.addEventListener('click', function () { if (u.pendiente) U.toast('Invitación pendiente: entrará con la contraseña que ya usa.'); else editar(u); });
          return tr;
        }))));
      var form = h('form', { novalidate: true });
      function editar(u) {
        var nuevo = !u;
        var nombre = h('input', { class: 'entrada', value: nuevo ? '' : u.nombre });
        var correo = h('input', { class: 'entrada', type: 'email', value: nuevo ? '' : u.correo, disabled: !nuevo });
        var rol = lista(roles.map(function (r) { return [r[0], r[1]]; }), nuevo ? 'planeador' : u.rol);
        var ayudaRol = h('p', { class: 'gris chico todo', style: 'margin:0' });
        var explicar = function () { var r = roles.filter(function (x) { return x[0] === rol.value; })[0]; ayudaRol.textContent = r ? r[1] + ': ' + r[2] : ''; };
        rol.addEventListener('change', explicar); explicar();
        var activo = h('input', { type: 'checkbox', checked: nuevo || u.activo });
        var pass = h('input', { class: 'entrada', type: 'text', autocomplete: 'off', placeholder: 'Mínimo 10, con letras y números' });
        var reset = h('input', { type: 'checkbox' });
        var btn = h('button', { class: 'btn btn-pri btn-chico', type: 'submit' }, nuevo ? 'Dar de alta' : 'Guardar cambios');
        mount(form, h('h3', null, nuevo ? 'Dar de alta a una persona' : 'Editar a ' + u.nombre),
          h('div', { class: 'rejilla' }, campo('Nombre', nombre), campo('Correo (también recibe avisos de sus solicitudes)', correo), campo('Perfil', rol), ayudaRol,
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
