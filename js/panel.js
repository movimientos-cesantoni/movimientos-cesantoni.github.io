/* Panel de Logística (Liga 2): base de solicitudes. Misma interfaz que la versión probada, con acceso de Firebase. */
import * as API from './servidor.js?v=29';
import { libroXlsx, zipArchivos } from './xlsx.js?v=29';
import { analizarPlantilla, crearGenerador, fechaLarga, aBase64, deBase64 } from './plantilla.js?v=29';
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

    /* Menú lateral según el perfil. Cada opción explica en una línea para qué sirve. */
    function nav(activa) {
      var destino = document.getElementById('nav');
      if (!yo || yo.debe_cambiar) { U.menu(destino, []); return; }
      var items = [];
      if (yo.rol !== 'facturacion') items.push({ clave: 'solicitudes', icono: '📋', titulo: 'Solicitudes', ayuda: 'Ver y atender los pedidos', accion: function () { cargar().then(tablero); } });
      if (yo.rol !== 'planeador') items.push({ clave: 'facturacion', icono: '🧾', titulo: 'Facturación', ayuda: 'Plantillas por proveedor', accion: function () { cargar().then(facturacion); } });
      items.push({ clave: 'gastos', icono: '📊', titulo: 'Dashboard', ayuda: 'Gastos por departamento', accion: function () { cargar().then(gastos); } });
      items.push({ clave: 'config', icono: '⚙️', titulo: 'Configuración', ayuda: yo.rol === 'admin' ? 'Personal, alertas y catálogos' : 'Mi cuenta y contraseña', accion: configuracion });
      U.menu(destino, items, activa, [h('div', { class: 'lateral-usuario' }, h('b', null, yo.nombre), h('span', null, rolNombre(yo.rol))),
        h('button', { type: 'button', class: 'btn btn-chico', onclick: salir }, 'Salir')], 'Panel de Logística');
    }
    /* Encabezado de cada pantalla: título y una línea que dice qué hacer aquí. */
    function encabezado(titulo, ayuda, acciones) {
      return h('div', { class: 'cabecera', style: 'margin-bottom:16px' }, h('div', null, h('h1', { style: 'margin:0' }, titulo),
        ayuda ? h('p', { class: 'ayuda-pantalla' }, ayuda) : null), acciones ? h('div', { class: 'acciones' }, acciones) : null);
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
      ['por_autorizar', 'Por autorizar', function (s) { return s.aut_estado === 'Pendiente de autorización' && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['por_enviar', 'Por enviar a autorización', function (s) { return s.aut_estado === 'Pendiente de autorización' && !s.aut_enviada && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['autorizacion', 'Esperando autorización', function (s) { return s.aut_estado === 'Pendiente de autorización' && !!s.aut_enviada && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['fecha_abierta', 'Con fecha abierta', function (s) { return s.fecha_abierta === 'Sí' && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['devoluciones', 'Devoluciones que no cumplen', devolucionPendiente],
      ['sin_cstext', 'Sin folio CSTEXT', function (s) { return !s.folio_cstext && ['programada', 'en_transito', 'completada'].indexOf(s.estado) >= 0; }],
      ['mias', 'Asignadas a mí', function (s) { return s.responsable === yo.usuario && cfg.abiertos.indexOf(s.estado) >= 0; }],
      ['cerradas', 'Cerradas', function (s) { return cfg.abiertos.indexOf(s.estado) < 0; }],
      ['todas', 'Todas', function () { return true; }]
    ];

    var corto = function (t) { t = String(t || ''); return t.length > 42 ? t.slice(0, 40).trim() + '…' : t; };
    function tablero() {
      nav('solicitudes');
      if (!datos) { mount(main, h('p', { class: 'gris' }, 'Cargando…')); return; }
      var tabla = h('div');
      var kpis = h('div', { class: 'kpis' });
      function pintarKpis() {
        /* Solo los 5 contadores principales; las demás vistas están en el filtro «Ver». */
        mount(kpis, VISTAS.filter(function (v) { return ['abiertas', 'nuevas', 'urgentes', 'por_autorizar', 'cerradas'].indexOf(v[0]) >= 0; }).map(function (v) {
          var n = datos.solicitudes.filter(v[2]).length;
          return h('button', { type: 'button', class: 'kpi', 'aria-pressed': String(filtros.vista === v[0]),
            onclick: function () { filtros.vista = filtros.vista === v[0] ? 'todas' : v[0]; vistaSel.value = filtros.vista; pintarKpis(); pintar(); } }, h('b', null, String(n)), h('span', null, v[1]));
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
        /* Una fila limpia: una sola etiqueta de estatus y las alertas como texto corto con punto de color. */
        var marca = function (tono, texto) { return h('span', { class: 'marca marca-' + tono }, texto); };
        mount(tabla, h('div', { class: 'tabla-cabeza' }, h('span', null, h('b', null, String(items.length)), items.length === 1 ? ' solicitud' : ' solicitudes')),
          h('div', { class: 'tabla-caja tabla-sol' }, h('table', null,
            h('thead', null, h('tr', null, ['Folio', 'Estatus', 'Solicitud', 'Solicitante', 'Ruta', 'Fecha', 'Responsable'].map(function (t) { return h('th', null, t); }))),
            h('tbody', null, items.map(function (s) {
              var alertas = [s.prioridad === 'Urgente' ? marca('rojo', 'Urgente') : null,
                s.aut_estado ? marca(s.aut_estado === 'Autorizado' ? 'verde' : s.aut_estado === 'Rechazado' ? 'rojo' : 'ambar',
                  s.aut_estado === 'Pendiente de autorización' ? 'Por autorizar' : 'Costo ' + s.aut_estado.toLowerCase()) : null,
                s.tipo === 'devolucion' && s.dev_cumple !== 'Sí' ? marca('rojo', 'Devolución no cumple') : null,
                s.cita === 'Sí' ? marca('azul', 'Requiere cita') : null].filter(Boolean);
              var fecha = s.fecha_programada ? U.dia(s.fecha_programada) : s.fecha_abierta === 'Sí' ? 'Fecha abierta' : U.dia(s.fecha_requerida);
              var tr = h('tr', { tabindex: '0' },
                h('td', { class: 'col-folio' }, h('b', null, s.folio), h('div', { class: 'sub' }, U.dia(s.creada))),
                h('td', null, U.estado(cfg, s.estado), alertas.length ? h('div', { class: 'marcas' }, alertas) : null),
                h('td', null, h('b', null, s.producto || '—'), h('div', { class: 'sub' }, [s.tipo_nombre, s.forma_envio].filter(Boolean).join(' · '))),
                h('td', null, s.solicitante, h('div', { class: 'sub' }, s.area)),
                h('td', { title: s.origen + ' → ' + s.destino }, corto(s.origen), h('div', { class: 'sub' }, '→ ' + corto(s.destino))),
                h('td', { class: 'col-fecha' }, fecha || '—', h('div', { class: 'sub' }, s.fecha_programada ? 'Fecha de carga' : 'Tentativa')),
                h('td', null, s.responsable ? nombreDe(s.responsable) : h('span', { class: 'gris' }, 'Sin asignar'), s.transportista ? h('div', { class: 'sub' }, s.transportista) : null));
              tr.addEventListener('click', function () { detalle(s.folio); });
              tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') detalle(s.folio); });
              return tr;
            })))));
      }
      function filtro(key, el) { el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', function () { filtros[key] = el.value.trim(); pintar(); }); return el; }
      var vistaSel = lista(VISTAS.map(function (v) { return [v[0], v[1]]; }), filtros.vista);
      vistaSel.addEventListener('change', function () { filtros.vista = vistaSel.value; pintarKpis(); pintar(); });
      var q = filtro('q', h('input', { class: 'entrada', type: 'search', placeholder: 'Folio, factura, solicitante, ciudad, guía…', value: filtros.q }));
      var acciones = h('div', { class: 'acciones' },
        h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cargar().then(tablero); } }, 'Actualizar'),
        h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { exportar(filtradas()); } }, 'Exportar a Excel (CSV)'));
      mount(main,
        encabezado('Solicitudes', 'Aquí llegan los pedidos de las áreas. Da clic en una solicitud para atenderla: cambia su estatus, programa la fecha de carga y captura el monto.', acciones),
        kpis,
        h('section', { class: 'tarjeta' }, h('h2', null, 'Consulta de solicitudes'), h('div', { class: 'filtros', style: 'margin:0' },
          h('div', { class: 'busqueda' }, campo('Buscar', q)),
          campo('Ver', vistaSel),
          campo('Departamento', filtro('area', lista([['', 'Todos']].concat(departamentos().map(function (a) { return [a, a]; })), filtros.area))),
          campo('Responsable', filtro('responsable', lista([['', 'Todos']].concat(datos.usuarios.map(function (u) { return [u.usuario, u.nombre]; })), filtros.responsable))),
          h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { filtros = { vista: 'todas', q: '', tipo: '', area: '', prioridad: '', responsable: '' }; tablero(); } }, 'Limpiar'))),
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

      /* Ficha de la solicitud: folio, estatus, avance y los datos clave en una sola vista. */
      var ficha = function (titulo, valor, nota) { return valor ? h('div', { class: 'ficha-dato' }, h('span', null, titulo), h('b', null, valor), nota ? h('small', null, nota) : null) : null; };
      var cabecera = h('section', { class: 'tarjeta ficha' },
        h('div', { class: 'cabecera' },
          h('div', null, h('p', { class: 'ficha-etq' }, 'Folio'), h('div', { class: 'folio' }, s.folio),
            h('p', { class: 'gris', style: 'margin:6px 0 0' }, (s.producto ? s.producto + ' · ' : '') + s.tipo_nombre + ' · creada ' + U.dia(s.creada))),
          h('div', { class: 'acciones' }, s.folio_cstext && s.folio_cstext !== s.folio ? h('span', { class: 'pill e-programada' }, s.folio_cstext) : null,
            U.estado(cfg, s.estado), s.prioridad === 'Urgente' ? h('span', { class: 'pill urgente' }, 'Urgente') : null)),
        U.pasos(cfg, s.estado),
        h('div', { class: 'ficha-datos' },
          ficha('Solicita', s.solicitante, s.area), ficha('Correo', s.correo), ficha('Tipo de servicio', s.forma_envio, s.prioridad),
          ficha('Ruta', s.origen, '→ ' + s.destino), ficha('Fecha de carga', s.fecha_programada ? U.dia(s.fecha_programada) : 'Por programar', s.transportista || null),
          ficha('Monto', s.monto ? dinero(s.monto) : 'Sin capturar', s.concepto || null)),
        h('dl', { class: 'datos ficha-fechas' }, U.fechas(s).filter(function (d) { return d[1]; }).map(function (d) { return h('div', null, h('dt', null, d[0]), h('dd', null, d[1])); })));

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
      var estados = [['', 'Selecciona…']].concat(cfg.estados_mx.map(function (e) { return [e, e]; }));
      var oEst = lista(estados, s.origen_estado), dEst = lista(estados, s.destino_estado);
      var cliFact = h('input', { class: 'entrada', value: s.cliente_fact || '', maxlength: 160, placeholder: String((s.costo_absorbe === 'Otro' ? s.costo_detalle : s.costo_absorbe) || 'CESANTONI').toUpperCase() });
      var maniobra = lista([['No', 'No'], ['Sí', 'Sí']], s.maniobra || 'No');
      var concepto = lista([['', 'Selecciona…']].concat(datos.conceptos.map(function (c) { return [c, c]; })), s.concepto);
      var cstCampo = h('input', { class: 'entrada', value: s.cst || 'CST', maxlength: 20 });
      var categ = lista([['', 'Sin categorizar']].concat(datos.categorias.map(function (c) { return [c, c]; })), s.categorizacion);
      /* Transportista y unidad sugieren el catálogo pero aceptan escribir otro. */
      var transp = h('input', { class: 'entrada', value: s.transportista || '', maxlength: 160, list: 'cat-transportistas', placeholder: 'Escribe o elige' });
      var unidad = h('input', { class: 'entrada', value: s.unidad_asignada || '', maxlength: 160, list: 'cat-unidades', placeholder: 'Tipo y placas' });
      var listaTransp = (datos.plantilla ? datos.plantilla.transportistas : []).concat(datos.transportistas.filter(function (t) { return !datos.plantilla || datos.plantilla.transportistas.indexOf(t) < 0; }));
      var catalogos = [h('datalist', { id: 'cat-transportistas' }, listaTransp.map(function (t) { return h('option', { value: t }); })),
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
      /* Grupos estandarizados: cada uno con su número, título y una línea de para qué sirve. */
      var grupo = function (n, titulo, ayuda, campos, clase) {
        return h('fieldset', { class: 'grupo-form' }, h('legend', null, h('span', { class: 'grupo-num' }, String(n)), titulo),
          ayuda ? h('p', { class: 'grupo-ayuda' }, ayuda) : null, h('div', { class: clase || 'rejilla-3' }, campos));
      };
      var form = h('form', { class: 'tarjeta form-atender', novalidate: true },
        h('header', { class: 'seccion-cabeza' }, h('h2', null, 'Actualizar solicitud'), h('p', { class: 'gris' }, 'Atiende la solicitud por partes. Al guardar, se registra en el seguimiento.')),
        grupo(1, 'Estatus y asignación', 'En qué va la solicitud y quién la atiende.',
          [campo('Estado', estado), campo('Responsable', resp), campo('Folio CSTEXT', cstext), campo('Categorización', categ)], 'rejilla-4'),
        grupo(2, 'Transporte y programación', 'Quién lleva el material y cuándo se carga.',
          [campo('Transportista', transp), campo('Unidad asignada', unidad), campo('Guía o referencia', guia), campo('Fecha de carga', fprog)], 'rejilla-4'),
        grupo(3, 'Costo', 'Lo que se pagará por el servicio.',
          [campo('Monto ($)', monto), campo('¿Flete, maniobras o paquetería?', concepto), campo('Tipo de movimiento', tipoMov)]),
        grupo(4, 'Fechas de quien solicita', s.fecha_abierta === 'Sí' ? 'La pidió con fecha abierta: asígnala aquí.' : 'Las fechas tentativas que pidió el área.',
          [campo((nuevo ? 'Fecha tentativa de recolección' : 'Fecha requerida'), freq),
            fent ? campo('Fecha tentativa de entrega', fent) : null,
            frec ? campo((nuevo ? 'Recolección posterior' : 'Fecha de recolección') + (s.recoleccion_abierta === 'Sí' ? ' (abierta)' : ''), frec) : null]),
        grupo(5, 'Plantilla de facturación', 'Alimenta el formato de Excel que descarga Facturación.',
          [campo('Estado de origen', oEst), campo('Estado de destino', dEst), campo('Cliente', cliFact), campo('Requiere factura de maniobra', maniobra), campo('CST', cstCampo)]),
        grupo(6, 'Comunicación', null,
          [campo('Notas internas (no las ve quien solicita)', notas), campo('Mensaje para quien solicita', mensaje),
            h('div', { class: 'todo opciones-mensaje' },
              h('label', { class: 'chico' }, visible, ' El mensaje lo ve quien solicita (si no, queda como nota interna)'),
              h('label', { class: 'chico' }, avisar, ' Avisar por correo a ' + s.correo))], 'rejilla'),
        catalogos,
        h('div', { class: 'form-pie' }, h('p', { class: 'gris chico' }, 'El folio de la solicitud es su consecutivo CSTEXT.'), guardar));
      visible.addEventListener('change', function () { avisar.disabled = !visible.checked; if (!visible.checked) avisar.checked = false; });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        U.ocupado(guardar, true, 'Guardando…');
        var cambios = { estado: estado.value, responsable: resp.value, transportista: transp.value, unidad_asignada: unidad.value,
          guia: guia.value, fecha_programada: fprog.value, categorizacion: categ.value, monto: monto.value, tipo: tipoMov.value,
          origen_estado: oEst.value, destino_estado: dEst.value, cliente_fact: cliFact.value, maniobra: maniobra.value, cst: cstCampo.value, concepto: concepto.value,
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

      /* Barra de secciones: salta a cada parte del folio. */
      var secciones = [['s-atender', puedeOperar ? 'Actualizar' : 'Facturación'], ['s-autorizacion', 'Autorización'], ['s-ruta', 'Ruta y detalle'],
        ['s-expediente', 'Expediente'], ['s-seguimiento', 'Seguimiento'], ['s-correos', 'Correos']];
      var barra = h('nav', { class: 'segmentos', 'aria-label': 'Secciones del folio' }, secciones.map(function (x) {
        return h('button', { type: 'button', onclick: function () { var el = document.getElementById(x[0]); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, x[1]);
      }));
      var bloque = function (id, el) { if (el) el.id = id; return el; };
      mount(main, volver, cabecera, barra,
        h('div', { class: 'detalle-segmentos' },
          bloque('s-atender', puedeOperar ? form : facturaInfo(s)),
          h('div', { class: 'detalle-2' }, h('div', null, bloque('s-autorizacion', tarjetaAut), devolucion, paquetes), h('div', null, bloque('s-ruta', ruta))),
          h('div', { class: 'detalle-2' }, h('div', null, bloque('s-expediente', archivos)), h('div', null, bloque('s-seguimiento', hilo))),
          bloque('s-correos', correos)));
    }

    /* Facturación ve los datos de la plantilla, sin poder cambiar la solicitud. */
    function facturaInfo(s) {
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Plantilla de facturación'),
        h('dl', { class: 'datos' }, [['Proveedor', s.transportista], ['Fecha de carga', U.dia(s.fecha_programada)], ['Monto', dinero(s.monto)], ['Concepto', s.concepto],
          ['Consecutivo', s.folio_cstext], ['Cliente', s.cliente_fact], ['Requiere factura de maniobra', s.maniobra || 'No'], ['CST', s.cst || 'CST'],
          ['Facturada', s.facturada ? U.dia(s.facturada) + (s.facturada_por ? ' · ' + s.facturada_por : '') : 'Pendiente']]
          .filter(function (d) { return d[1]; }).map(function (d) { return h('div', null, h('dt', null, d[0]), h('dd', null, d[1])); })));
    }

    /* ---------------------------------------------------------------- facturación */
    function dinero(v) { return v === '' || v === undefined || v === null || isNaN(Number(v)) ? '' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    function diaCorto(ymd) { return /^\d{4}-\d{2}-\d{2}/.test(ymd || '') ? ymd.slice(8, 10) + '-' + MESES[Number(ymd.slice(5, 7)) - 1] + '-' + ymd.slice(2, 4) : ''; }
    /* Origen y destino en la facturación: solo el Estado (en mayúsculas). */
    function soloEstado(s, lado) { return String(s[lado + '_estado'] || '').toUpperCase(); }
    /* Columnas de la plantilla (como la de Fletes): [título, tipo en Excel, ancho, valor]. */
    var COLS_FACT = [
      ['ORIGEN', 'izq', 26, function (s) { return soloEstado(s, 'origen'); }],
      ['DESTINO', 'izq', 26, function (s) { return soloEstado(s, 'destino'); }],
      ['FECHA CARGA', 'fecha', 12, function (s) { return s.fecha_programada || String(s.cerrada || '').slice(0, 10); }],
      ['MONTO', 'moneda', 13, function (s) { return s.monto === '' ? '' : Number(s.monto); }],
      ['CONSECUTIVO', 'texto', 15, function (s) { return s.folio_cstext; }],
      ['CLIENTE', 'texto', 18, function (s) { return s.cliente_fact; }],
      ['REQUIERE FACTURA DE MANIOBRA', 'texto', 20, function (s) { return s.maniobra || 'No'; }],
      ['CST', 'texto', 8, function (s) { return s.cst || 'CST'; }],
      ['SOLICITANTE', 'texto', 22, function (s) { return String(s.area || '').toUpperCase(); }]
    ];
    /* Filtros de facturación: estatus, mes de carga (AAAA-MM) y facturadas o pendientes. */
    /* Facturación: entregas completadas, por mes de carga y proveedor; pestañas pendientes / facturadas / todas. */
    var filtrosFact = { ver: 'pendientes', mes: '', proveedor: '' };
    var seleccionFact = {}, abiertoFact = '';
    var MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    function mesTexto(m) { return /^\d{4}-\d{2}$/.test(m || '') ? MESES_LARGO[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) : 'todos los meses'; }
    function bajarArchivo(blob, nombre) {
      var a = h('a', { href: URL.createObjectURL(blob), download: nombre });
      document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
    }
    /* Plantilla de movimientos: se descarga una vez y se reutiliza mientras no cambie. */
    var cacheGenerador = null;
    function obtenerGenerador() {
      if (!datos.plantilla) return Promise.resolve(null);
      if (!cacheGenerador || cacheGenerador.subida !== datos.plantilla.subida) {
        cacheGenerador = { subida: datos.plantilla.subida, promesa: run('adminPlantilla').then(function (p) { return p ? crearGenerador(deBase64(p.base64)) : null; }) };
        cacheGenerador.promesa.catch(function () { cacheGenerador = null; });
      }
      return cacheGenerador.promesa;
    }
    var LUGAR = 'CALERA DE VICTOR ROSALES, ZACATECAS., A ';
    /* Texto exacto de la lista TIPO DE MOVIMIENTO de la plantilla (sus fórmulas comparan con «MANIOBRAS»). */
    var TIPO_FORMATO = { Flete: 'FLETE', Maniobras: 'MANIOBRAS', 'Paquetería': 'PAQUETERIA' };
    function valoresFormato(s) {
      var M = function (t) { return String(t || '').toUpperCase(); };
      return { fecha: LUGAR + fechaLarga(s.fecha_programada || String(s.creada || '').slice(0, 10)), origen: 'ORIGEN: ' + soloEstado(s, 'origen'), destino: 'DESTINO: ' + soloEstado(s, 'destino'),
        folio: s.folio_cstext || s.folio, subtotal: Number(s.monto) || 0, transportista: s.transportista || '', tipo: TIPO_FORMATO[s.concepto] || M(s.concepto),
        observaciones: 'MOVIMIENTO A ' + M(s.destino) + (s.producto ? ' · ' + M(s.producto) : '') + (s.area ? ' · ' + M(s.area) : '') };
    }
    var limpioArchivo = function (t) { return String(t).replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, '_'); };
    function facturacion() {
      nav('facturacion');
      if (!datos) { mount(main, h('p', { class: 'gris' }, 'Cargando…')); return; }
      var esAdmin = yo.rol === 'admin', edita = yo.rol !== 'facturacion';
      var fecha = function (s) { return s.fecha_programada || String(s.cerrada || '').slice(0, 10); };
      var monto = function (lista) { return lista.reduce(function (t, s) { return t + (Number(s.monto) || 0); }, 0); };
      var proveedorDe = function (s) { return s.transportista || 'Sin proveedor asignado'; };
      /* Lo que le falta a un movimiento para generar su formato. */
      function faltantes(s) {
        var f = [];
        if (s.monto === '') f.push('subtotal');
        if (!s.concepto) f.push('concepto');
        if (!s.origen_estado) f.push('Estado de origen');
        if (!s.destino_estado) f.push('Estado de destino');
        if (!s.transportista) f.push('transportista');
        else if (datos.plantilla && datos.plantilla.transportistas.indexOf(s.transportista) < 0) f.push('transportista igual que en la plantilla');
        return f;
      }
      function base() {
        return datos.solicitudes.filter(function (s) {
          return s.estado === 'completada' && (!filtrosFact.mes || fecha(s).slice(0, 7) === filtrosFact.mes) &&
            (!filtrosFact.proveedor || proveedorDe(s) === filtrosFact.proveedor);
        });
      }
      function filas() { return base().filter(function (s) { return filtrosFact.ver === 'todas' || (filtrosFact.ver === 'facturadas') === !!s.facturada; }); }
      function grupos() {
        var mapa = {};
        filas().forEach(function (s) { var p = proveedorDe(s); (mapa[p] = mapa[p] || []).push(s); });
        return Object.keys(mapa).sort().map(function (p) { return { proveedor: p, items: mapa[p].sort(function (a, b) { return fecha(a).localeCompare(fecha(b)); }) }; });
      }
      var elegidos = function () { return grupos().filter(function (g) { return seleccionFact[g.proveedor]; }); };
      var CARPETA = { Flete: 'Fletes', Maniobras: 'Maniobras', 'Paquetería': 'Paquetería' };
      var sufijo = function () { return (filtrosFact.mes || cfg.hoy); };
      /* Resumen consolidado: una hoja por proveedor (columnas del formato anterior; origen y destino solo con el Estado). */
      var hoja = function (nombre, items) {
        var cols = COLS_FACT.concat([['CONCEPTO', 'texto', 12, function (s) { return s.concepto || 'Sin definir'; }], ['FOLIO', 'texto', 15, function (s) { return s.folio; }],
          ['FACTURADA', 'fecha', 12, function (s) { return s.facturada || ''; }]]);
        return { nombre: nombre, columnas: cols.map(function (c) { return { titulo: c[0], tipo: c[1], ancho: c[2] }; }),
          filas: items.map(function (s) { return cols.map(function (c) { return c[3](s); }); }) };
      };
      function guardarDato(s, cambios, control) {
        if (control) control.disabled = true;
        return run('adminActualizar', s.folio, cambios).then(function (r) {
          Object.keys(cambios).forEach(function (k) { s[k] = r[k] !== undefined ? r[k] : cambios[k]; });
          U.toast('Guardado en ' + (s.folio_cstext || s.folio) + '.');
          pintar();
        }).catch(function (e) { if (control) control.disabled = false; fallo(e); });
      }
      function detalleProveedor(g) {
        var estados = [['', 'Selecciona…']].concat(cfg.estados_mx.map(function (e) { return [e, e]; }));
        var celdaEstado = function (s, lado) {
          if (!edita) return s[lado + '_estado'] || h('span', { class: 'pill e-en_revision' }, 'Falta');
          var sel = lista(estados, s[lado + '_estado']);
          sel.setAttribute('aria-label', (lado === 'origen' ? 'Estado de origen de ' : 'Estado de destino de ') + (s.folio_cstext || s.folio));
          sel.addEventListener('change', function () { var c = {}; c[lado + '_estado'] = sel.value; guardarDato(s, c, sel); });
          return sel;
        };
        var celdaMonto = function (s) {
          if (s.monto !== '' || !edita) return s.monto !== '' ? dinero(s.monto) : h('span', { class: 'pill e-en_revision' }, 'Falta');
          var inp = h('input', { class: 'entrada', inputmode: 'decimal', placeholder: 'Capturar subtotal', 'aria-label': 'Subtotal de ' + (s.folio_cstext || s.folio) });
          inp.addEventListener('change', function () { if (inp.value.trim()) guardarDato(s, { monto: inp.value }, inp); });
          return inp;
        };
        var celdaConcepto = function (s) {
          if (s.concepto || !edita) return s.concepto || h('span', { class: 'pill e-en_revision' }, 'Falta');
          var sel = lista([['', 'Selecciona…']].concat(datos.conceptos.map(function (c) { return [c, c]; })), '');
          sel.setAttribute('aria-label', 'Concepto de ' + (s.folio_cstext || s.folio));
          sel.addEventListener('change', function () { if (sel.value) guardarDato(s, { concepto: sel.value }, sel); });
          return sel;
        };
        return h('tr', { class: 'fact-detail sin-clic' }, h('td', { colspan: '6' },
          h('p', null, 'Movimientos de ' + g.proveedor + '. ' + (edita ? 'Completa aquí lo que falte; se guarda en la solicitud.' : 'Lo que falte lo completa el planeador en la solicitud.')),
          h('div', { class: 'tabla-caja' }, h('table', null,
            h('thead', null, h('tr', null, ['Folio', 'Fecha de carga', 'Estado de origen', 'Estado de destino', 'Concepto', 'Monto', 'Facturación', ''].map(function (t, i) { return h('th', { class: i === 5 ? 'right' : null }, t); }))),
            h('tbody', null, g.items.map(function (s) {
              var abrir = h('button', { class: 'liga', type: 'button', onclick: function () { detalle(s.folio); } }, s.folio_cstext || s.folio);
              var bajar = h('button', { class: 'btn btn-chico', type: 'button', 'aria-label': 'Descargar formato ' + (s.folio_cstext || s.folio) }, '⬇');
              bajar.addEventListener('click', function () { generar('plantilla', [{ proveedor: g.proveedor, items: [s] }], bajar).catch(function (e) { U.toast(e.message, true); }); });
              return h('tr', { class: 'sin-clic' }, h('td', null, abrir), h('td', null, diaCorto(fecha(s))), h('td', null, celdaEstado(s, 'origen')), h('td', null, celdaEstado(s, 'destino')),
                h('td', null, celdaConcepto(s)), h('td', { class: 'right' }, celdaMonto(s)),
                h('td', null, s.facturada ? U.dia(s.facturada) : 'Pendiente'), h('td', null, bajar));
            }))))));
      }
      /* Genera la descarga: «plantilla» (un formato por movimiento, ZIP con Fletes/Maniobras/Paquetería) o «resumen» (Excel consolidado). */
      function generar(tipo, lista, boton) {
        var items = lista.reduce(function (t, g) { return t.concat(g.items); }, []);
        if (tipo === 'resumen') {
          bajarArchivo(libroXlsx(lista.map(function (g) { return hoja(g.proveedor, g.items); })), 'Facturacion_' + sufijo() + '.xlsx');
          return Promise.resolve();
        }
        if (!datos.plantilla) return Promise.reject(new Error('Aún no se ha subido la plantilla de movimientos. Usa «Resumen consolidado» o pide al administrador que la suba en Configuración.'));
        var malos = items.filter(function (s) { return faltantes(s).length; });
        if (malos.length) {
          return Promise.reject(new Error('Falta completar ' + malos.map(function (s) { return (s.folio_cstext || s.folio) + ' (' + faltantes(s).join(', ') + ')'; }).join('; ') +
            '. Revísalo en «Ver detalle».'));
        }
        if (boton) U.ocupado(boton, true, 'Preparando…');
        return obtenerGenerador().then(function (gen) {
          var archivos = items.map(function (s) {
            var folio = s.folio_cstext || s.folio;
            return { ruta: CARPETA[s.concepto] + '/' + limpioArchivo(proveedorDe(s)) + '/' + folio + '.xlsx', solo: folio + '_' + limpioArchivo(proveedorDe(s)) + '.xlsx', bytes: gen(valoresFormato(s)) };
          });
          if (archivos.length === 1) bajarArchivo(new Blob([archivos[0].bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), archivos[0].solo);
          else bajarArchivo(zipArchivos(archivos.map(function (a) { return { nombre: a.ruta, bytes: a.bytes }; })), 'Formatos_' + sufijo() + '.zip');
        }).then(function () { if (boton) U.ocupado(boton, false); }, function (e) { if (boton) U.ocupado(boton, false); throw e; });
      }
      var dialogo = h('dialog', { class: 'fact-dialog', 'aria-label': 'Preparar descarga' });
      function abrirDialogo() {
        var lista = elegidos(), items = lista.reduce(function (t, g) { return t.concat(g.items); }, []);
        var malos = items.filter(function (s) { return faltantes(s).length; }).length;
        var opcion = function (valor, titulo, texto, marcado, deshabilitado) {
          return h('label', { class: 'opcion' + (deshabilitado ? ' deshabilitada' : '') }, h('input', { type: 'radio', name: 'f-formato', value: valor, checked: marcado, disabled: deshabilitado }),
            h('span', null, h('b', null, titulo), h('small', null, texto)));
        };
        var err = h('p', { class: 'chico', role: 'alert', style: 'color:var(--mal)' });
        var btn = h('button', { class: 'btn btn-pri', type: 'button' }, 'Generar descarga');
        btn.addEventListener('click', function () {
          err.textContent = '';
          var tipo = (dialogo.querySelector('input[name="f-formato"]:checked') || {}).value;
          generar(tipo, lista, btn).then(function () { dialogo.close(); }).catch(function (e) { err.textContent = e.message; });
        });
        mount(dialogo, h('h2', null, 'Preparar descarga'),
          h('p', { class: 'gris' }, items.length + (items.length === 1 ? ' movimiento' : ' movimientos') + ' · ' + lista.length + (lista.length === 1 ? ' proveedor' : ' proveedores')),
          opcion('plantilla', 'Plantilla de movimientos', datos.plantilla ? 'Tu formato original, lleno automáticamente. Un Excel por movimiento; varios se reúnen en ZIP con carpetas Fletes, Maniobras y Paquetería.'
            : 'Aún no se ha subido la plantilla en Configuración.', !!datos.plantilla, !datos.plantilla),
          opcion('resumen', 'Resumen consolidado', 'Un Excel con una hoja por proveedor; origen y destino muestran solo el Estado.', !datos.plantilla, false),
          malos ? h('div', { class: 'aviso aviso-alerta' }, h('p', null, malos + (malos === 1 ? ' movimiento no tiene' : ' movimientos no tienen') + ' todos sus datos (subtotal, concepto o Estados). Complétalos en «Ver detalle» antes de generar su plantilla.')) : null,
          h('p', { class: 'chico gris' }, 'Se conservan las hojas, logos, formato y fórmulas de tu plantilla. Descargar no marca los movimientos como facturados.'),
          err,
          h('div', { class: 'acciones' }, h('button', { class: 'btn', type: 'button', onclick: function () { dialogo.close(); } }, 'Cancelar'), btn));
        dialogo.showModal();
      }
      var resumenCaja = h('div'), trabajo = h('section', { class: 'fact-work' });
      function pintar() {
        var b = base(), grp = grupos(), todas = filas();
        Object.keys(seleccionFact).forEach(function (p) { if (!grp.some(function (g) { return g.proveedor === p; })) delete seleccionFact[p]; });
        var sel = elegidos(), selItems = sel.reduce(function (t, g) { return t.concat(g.items); }, []);
        var pend = b.filter(function (s) { return !s.facturada; }), porCompletar = b.filter(function (s) { return faltantes(s).length; }).length;
        var stat = function (t, v, n) { return h('div', { class: 'fact-stat' }, h('span', null, t), h('b', null, v), h('small', null, n)); };
        mount(resumenCaja, h('div', { class: 'fact-overview' },
          stat('Pendientes de facturar', String(pend.length), 'Movimientos de ' + mesTexto(filtrosFact.mes)),
          stat('Monto pendiente capturado', dinero(monto(pend)) || '$0.00', 'MXN · no incluye montos faltantes'),
          stat('Datos por completar', String(porCompletar), porCompletar ? 'Requieren revisión del planeador' : 'Sin faltantes'),
          stat('Facturadas', String(b.length - pend.length), 'Movimientos de ' + mesTexto(filtrosFact.mes))));
        var todos = h('input', { type: 'checkbox', 'aria-label': 'Seleccionar todos los proveedores visibles', checked: grp.length > 0 && grp.every(function (g) { return seleccionFact[g.proveedor]; }) });
        todos.addEventListener('change', function () { seleccionFact = {}; if (todos.checked) grp.forEach(function (g) { seleccionFact[g.proveedor] = true; }); pintar(); });
        var marcar = null;
        if (sel.length && filtrosFact.ver !== 'todas') {
          var aFacturar = filtrosFact.ver === 'pendientes';
          marcar = h('button', { class: 'btn', type: 'button' }, aFacturar ? 'Marcar como facturadas' : 'Quitar marca de facturadas');
          marcar.addEventListener('click', function () {
            U.ocupado(marcar, true, 'Guardando…');
            run('adminMarcarFacturadas', selItems.map(function (s) { return s.folio; }), aFacturar)
              .then(function (d) { datos = d; seleccionFact = {}; U.toast(aFacturar ? 'Marcadas como facturadas.' : 'Marca quitada.'); pintar(); })
              .catch(function (e) { U.ocupado(marcar, false); fallo(e); });
          });
        }
        var bajar = h('button', { class: 'btn btn-pri', type: 'button', disabled: !selItems.length, onclick: abrirDialogo }, 'Descargar selección' + (selItems.length ? ' (' + selItems.length + ')' : '') + ' ↓');
        var tabs = h('div', { class: 'fact-tabs', role: 'tablist', 'aria-label': 'Estado de facturación' }, [['pendientes', 'Pendientes'], ['facturadas', 'Facturadas'], ['todas', 'Todas']].map(function (t) {
          return h('button', { type: 'button', role: 'tab', 'aria-selected': String(filtrosFact.ver === t[0]), onclick: function () { filtrosFact.ver = t[0]; seleccionFact = {}; abiertoFact = ''; pintar(); } }, t[1]);
        }));
        var proveedores = base().map(proveedorDe).concat(filtrosFact.proveedor ? [filtrosFact.proveedor] : []).filter(function (p, i, a) { return a.indexOf(p) === i; }).sort();
        var provSel = lista([['', 'Todos los proveedores']].concat(proveedores.map(function (p) { return [p, p]; })), filtrosFact.proveedor);
        provSel.addEventListener('change', function () { filtrosFact.proveedor = provSel.value; seleccionFact = {}; abiertoFact = ''; pintar(); });
        var mes = h('input', { class: 'entrada', type: 'month', value: filtrosFact.mes });
        mes.addEventListener('change', function () { filtrosFact.mes = mes.value; seleccionFact = {}; abiertoFact = ''; pintar(); });
        mount(trabajo,
          h('div', { class: 'fact-tools' }, tabs, h('span', { class: 'gris chico' }, todas.length + (todas.length === 1 ? ' movimiento' : ' movimientos') + ' · ' + grp.length + (grp.length === 1 ? ' proveedor' : ' proveedores'))),
          h('div', { class: 'fact-filter' }, campo('Mes de carga', mes), campo('Proveedor', provSel)),
          h('div', { class: 'fact-table' }, h('table', null,
            h('thead', null, h('tr', null, h('th', null, todos), h('th', null, 'Proveedor'), h('th', null, 'Movimientos'), h('th', { class: 'right' }, 'Monto capturado'), h('th', null, 'Documentación'), h('th'))),
            h('tbody', null, grp.length ? grp.map(function (g) {
              var falta = g.items.filter(function (s) { return faltantes(s).length; }).length, abierto = abiertoFact === g.proveedor;
              var chk = h('input', { type: 'checkbox', 'aria-label': 'Seleccionar ' + g.proveedor, checked: !!seleccionFact[g.proveedor] });
              chk.addEventListener('change', function () { if (chk.checked) seleccionFact[g.proveedor] = true; else delete seleccionFact[g.proveedor]; pintar(); });
              var conceptos = g.items.map(function (s) { return s.concepto || 'Sin concepto'; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
              return [h('tr', { class: 'sin-clic fact-grupo' }, h('td', null, chk),
                h('td', { class: 'supplier' }, g.proveedor, h('div', { class: 'sub' }, conceptos.join(' · '))),
                h('td', null, String(g.items.length)),
                h('td', { class: 'right' }, h('b', null, dinero(monto(g.items)) || '$0.00')),
                h('td', null, h('span', { class: 'pill ' + (falta ? 'e-en_revision' : 'e-completada') }, falta ? falta + ' por completar' : 'Lista para preparar')),
                h('td', null, h('button', { class: 'fact-link', type: 'button', 'aria-expanded': String(abierto), onclick: function () { abiertoFact = abierto ? '' : g.proveedor; pintar(); } },
                  abierto ? 'Ocultar detalle ↑' : 'Ver detalle →'))),
                abierto ? detalleProveedor(g) : null];
            }) : h('tr', { class: 'sin-clic' }, h('td', { colspan: '6', class: 'fact-empty' }, 'No hay entregas completadas con estos filtros.'))))),
          h('div', { class: 'fact-selectbar' },
            h('span', null, sel.length ? [h('b', null, sel.length + (sel.length === 1 ? ' proveedor seleccionado' : ' proveedores seleccionados')), ' · ' + selItems.length + (selItems.length === 1 ? ' movimiento' : ' movimientos') + ' · ' + (dinero(monto(selItems)) || '$0.00')]
              : 'Selecciona uno o varios proveedores para preparar sus documentos.'),
            h('div', { class: 'acciones' }, marcar, bajar)));
      }
      var sinPlantilla = datos.plantilla ? null : h('div', { class: 'aviso aviso-alerta', role: 'alert', style: 'margin:0' }, h('p', null, h('b', null, 'Falta subir tu plantilla de movimientos. '),
        'Mientras no se suba, solo se puede descargar el resumen consolidado. ' +
        (esAdmin ? 'Súbela en Configuración › Plantilla de movimientos.' : 'Pide al administrador que la suba en Configuración.')),
        esAdmin ? h('button', { class: 'btn btn-pri btn-chico', type: 'button', onclick: function () { configuracion(); } }, 'Ir a subir la plantilla') : null);
      mount(main, h('div', { class: 'fact-layout' },
        h('div', { class: 'gastos-head', style: 'margin:0' }, h('div', null, h('h1', null, 'Facturación'), h('p', null, 'Revisa los movimientos completados y prepara la documentación por proveedor.')),
          h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cargar().then(facturacion); } }, 'Actualizar')),
        sinPlantilla, resumenCaja, trabajo,
        h('p', { class: 'fact-note' }, 'La plantilla se llena con fecha de carga, Estados de origen y destino, folio, transportista, concepto, subtotal y observaciones. Los totales de arriba corresponden al mes y proveedor elegidos; la pestaña filtra la tabla. Descargar no marca los movimientos como facturados.'),
        dialogo));
      pintar();
    }

    /* ---------------------------------------------------------------- dashboard de gastos */
    /* Colores por concepto (validados para daltonismo); siempre van con su nombre y monto escritos. */
    var COLOR_CONCEPTO = { Flete: '#D77129', Maniobras: '#3A6EA5', 'Paquetería': '#7A9A3A' };
    var filtrosGastos = { periodo: 'todo', area: '', concepto: '' };
    function gastos() {
      nav('gastos');
      if (!datos) { mount(main, h('p', { class: 'gris' }, 'Cargando…')); return; }
      var fecha = function (s) { return s.fecha_programada || String(s.creada || '').slice(0, 10); };
      var vivas = datos.solicitudes.filter(function (s) { return ['cancelada', 'rechazada'].indexOf(s.estado) < 0 && fecha(s); });
      var mesesData = vivas.map(function (s) { return fecha(s).slice(0, 7); }).filter(function (m, i, a) { return a.indexOf(m) === i; }).sort();
      var anio = String(cfg.hoy || '').slice(0, 4);
      var mesCorto = function (m) { return MESES[Number(m.slice(5, 7)) - 1].replace(/^./, function (x) { return x.toUpperCase(); }) + (m.slice(0, 4) !== anio ? ' ' + m.slice(2, 4) : ''); };
      var cuerpo = h('div');
      function enPeriodo(m) {
        return filtrosGastos.periodo === 'todo' || (filtrosGastos.periodo === 'anio' ? m.slice(0, 4) === anio : m === filtrosGastos.periodo);
      }
      function periodoTexto() {
        if (filtrosGastos.periodo === 'anio') return 'Año ' + anio;
        if (filtrosGastos.periodo !== 'todo') return mesTexto(filtrosGastos.periodo);
        return mesesData.length ? 'Todo: ' + mesTexto(mesesData[0]) + (mesesData.length > 1 ? ' – ' + mesTexto(mesesData[mesesData.length - 1]) : '') : 'Todo';
      }
      function calcular() {
        var base = vivas.filter(function (s) {
          return enPeriodo(fecha(s).slice(0, 7)) && (!filtrosGastos.concepto || s.concepto === filtrosGastos.concepto);
        });
        var sel = base.filter(function (s) { return !filtrosGastos.area || (s.area || 'Sin departamento') === filtrosGastos.area; });
        var conMonto = sel.filter(function (s) { return s.monto !== ''; });
        var suma = function (lista) { return lista.reduce(function (t, s) { return t + (Number(s.monto) || 0); }, 0); };
        var mapa = {};
        /* Departamentos: sobre el periodo y concepto (sin el filtro de departamento), para poder elegir otro. */
        base.filter(function (s) { return s.monto !== ''; }).forEach(function (s) {
          var k = s.area || 'Sin departamento', m = Number(s.monto) || 0;
          var d = mapa[k] = mapa[k] || { area: k, total: 0, n: 0, Flete: 0, Maniobras: 0, 'Paquetería': 0 };
          d.total += m; d.n += 1; if (d[s.concepto] !== undefined) d[s.concepto] += m;
        });
        var areas = Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) { return b.total - a.total || a.area.localeCompare(b.area); });
        var meses = mesesData.filter(enPeriodo).slice(-12).map(function (m) {
          return { mes: m, total: suma(conMonto.filter(function (s) { return fecha(s).slice(0, 7) === m; })) };
        });
        var mix = datos.conceptos.map(function (c) { return { concepto: c, total: suma(conMonto.filter(function (s) { return s.concepto === c; })) }; });
        var sinConcepto = suma(conMonto.filter(function (s) { return datos.conceptos.indexOf(s.concepto) < 0; }));
        return { total: suma(conMonto), n: conMonto.length, sinMonto: sel.length - conMonto.length, areas: areas, meses: meses, mix: mix, sinConcepto: sinConcepto,
          detalle: areas.filter(function (d) { return !filtrosGastos.area || d.area === filtrosGastos.area; }) };
      }
      var pct = function (x, t) { return t ? (x / t * 100).toFixed(1) + '%' : '0%'; };
      function pintar() {
        var r = calcular();
        var top = r.detalle[0];
        var kpi = function (titulo, valor, nota) { return h('div', { class: 'gastos-kpi' }, h('span', { class: 'k-label' }, titulo), h('strong', null, valor), nota ? h('small', null, nota) : null); };
        var maxMes = Math.max.apply(null, [1].concat(r.meses.map(function (m) { return m.total; })));
        var maxArea = r.areas.length ? r.areas[0].total : 0;
        var totalAreas = r.areas.reduce(function (t, d) { return t + d.total; }, 0);
        var conMix = r.mix.filter(function (m) { return m.total > 0; });
        var vacio = !r.n;
        mount(cuerpo,
          h('p', { class: 'filter-summary' }, [periodoTexto(), filtrosGastos.area || 'Todos los departamentos', filtrosGastos.concepto || 'Todos los conceptos', 'MXN'].join(' · ')),
          h('div', { class: 'gastos-kpis' },
            kpi('Gasto total', dinero(r.total) || '$0.00', 'Montos del periodo seleccionado'),
            kpi('Servicios con monto', String(r.n), r.sinMonto ? r.sinMonto + ' sin monto todavía' : 'Incluidos en los filtros'),
            kpi('Promedio por servicio', r.n ? dinero(r.total / r.n) : '—', 'Gasto total ÷ servicios con monto'),
            kpi('Departamento con más gasto', top ? top.area : '—', top ? dinero(top.total) + ' · ' + pct(top.total, totalAreas) + ' del total' : null)),
          vacio ? h('div', { class: 'gastos-card', style: 'text-align:center;margin-bottom:24px' }, h('p', { class: 'gris', style: 'margin:0' }, 'Todavía no hay montos capturados con estos filtros.')) : [
            h('div', { class: 'gastos-grid' },
              h('section', { class: 'gastos-card' }, h('h2', null, 'Evolución del gasto'), h('p', { class: 'chart-note' }, 'Total mensual en MXN · barras desde cero'),
                h('div', { class: 'month-chart', role: 'list', 'aria-label': 'Gasto por mes' }, r.meses.map(function (m) {
                  var texto = mesTexto(m.mes) + ': ' + (dinero(m.total) || '$0.00');
                  return h('div', { class: 'month-col', role: 'listitem', tabindex: '0', title: texto, 'aria-label': texto },
                    h('span', { class: 'month-value' }, dinero(m.total).replace(/\.00$/, '') || '$0'),
                    h('span', { class: 'month-bar', style: 'height:' + Math.max(1, Math.round(m.total / maxMes * 190)) + 'px' }),
                    h('span', { class: 'month-label' }, mesCorto(m.mes)));
                }))),
              h('section', { class: 'gastos-card' }, h('h2', null, 'Gasto por departamento'), h('p', { class: 'chart-note' }, 'Participación del total · da clic en un departamento para filtrar'),
                h('div', null, r.areas.map(function (d) {
                  var activo = filtrosGastos.area === d.area;
                  return h('button', { type: 'button', class: 'dept-row', 'aria-pressed': String(activo),
                    onclick: function () { filtrosGastos.area = activo ? '' : d.area; areaSel.value = filtrosGastos.area; pintar(); } },
                    h('span', { class: 'dept-line' }, h('b', null, d.area), h('span', null, dinero(d.total))),
                    h('span', { class: 'dept-track' }, h('span', { class: 'dept-fill', style: 'width:' + Math.max(1, maxArea ? d.total / maxArea * 100 : 0).toFixed(1) + '%;background:' + (filtrosGastos.area && !activo ? '#C9D1D8' : '#D77129') })),
                    h('span', { class: 'dept-percent' }, pct(d.total, totalAreas) + ' del gasto · ' + d.n + (d.n === 1 ? ' servicio' : ' servicios')));
                })))),
            h('div', { class: 'gastos-bottom' },
              h('section', { class: 'gastos-card' }, h('h2', null, 'Distribución por concepto'), h('p', { class: 'chart-note' }, 'Participación del gasto seleccionado'),
                h('div', { class: 'mix-bar', 'aria-hidden': 'true', style: 'gap:2px' }, conMix.map(function (m) {
                  return h('span', { style: 'flex:' + m.total + ';background:' + COLOR_CONCEPTO[m.concepto] });
                })),
                h('div', { class: 'mix-list' }, r.mix.map(function (m) {
                  return h('div', { class: 'mix-line' }, h('span', { class: 'mix-dot', style: 'background:' + COLOR_CONCEPTO[m.concepto] }),
                    h('span', null, m.concepto, h('small', null, pct(m.total, r.total) + ' del total')), h('b', null, dinero(m.total) || '$0.00'));
                }), r.sinConcepto ? h('div', { class: 'mix-line' }, h('span'), h('span', null, 'Sin concepto', h('small', null, 'El planeador aún no indica si es flete, maniobras o paquetería')),
                  h('b', null, dinero(r.sinConcepto))) : null)),
              h('section', { class: 'gastos-card' }, h('h2', null, 'Detalle por departamento'), h('p', { class: 'chart-note' }, 'Desglose de los montos · MXN'),
                h('div', { class: 'tabla-caja' }, h('table', { class: 'gastos-table' },
                  h('thead', null, h('tr', null, ['Departamento', 'Servicios'].concat(datos.conceptos, ['Total']).map(function (t, i) { return h('th', { class: i ? 'numero' : null }, t === 'Flete' ? 'Fletes' : t); }))),
                  h('tbody', null, r.detalle.map(function (d) {
                    return h('tr', { class: 'sin-clic' }, h('td', null, d.area), h('td', { class: 'numero' }, String(d.n)),
                      datos.conceptos.map(function (c) { return h('td', { class: 'numero' }, d[c] ? dinero(d[c]) : '—'); }),
                      h('td', { class: 'numero' }, h('b', null, dinero(d.total))));
                  })),
                  h('tfoot', null, h('tr', { class: 'sin-clic' }, h('td', null, 'Total'),
                    h('td', { class: 'numero' }, String(r.detalle.reduce(function (t, d) { return t + d.n; }, 0))),
                    datos.conceptos.map(function (c) { var x = r.detalle.reduce(function (t, d) { return t + d[c]; }, 0); return h('td', { class: 'numero' }, x ? dinero(x) : '—'); }),
                    h('td', { class: 'numero' }, dinero(r.detalle.reduce(function (t, d) { return t + d.total; }, 0)) || '$0.00')))))))],
          h('p', { class: 'gastos-foot' }, 'Suma de los montos que captura el planeador (fecha de carga o, si no tiene, la de la solicitud). No incluye solicitudes canceladas ni rechazadas.'));
      }
      var periodoSel = lista([['todo', 'Todo el historial'], ['anio', 'Año ' + anio]].concat(mesesData.slice().reverse().map(function (m) {
        return [m, mesTexto(m).replace(/^./, function (x) { return x.toUpperCase(); })];
      })), filtrosGastos.periodo);
      var areaSel = lista([['', 'Todos los departamentos']].concat(departamentos().map(function (a) { return [a, a]; })), filtrosGastos.area);
      var conceptoSel = lista([['', 'Todos los conceptos']].concat(datos.conceptos.map(function (c) { return [c, c]; })), filtrosGastos.concepto);
      periodoSel.id = 'g-periodo'; areaSel.id = 'g-area'; conceptoSel.id = 'g-concepto';
      [[periodoSel, 'periodo'], [areaSel, 'area'], [conceptoSel, 'concepto']].forEach(function (x) { x[0].addEventListener('change', function () { filtrosGastos[x[1]] = x[0].value; pintar(); }); });
      var restablecer = h('button', { class: 'btn', type: 'button', onclick: function () {
        filtrosGastos = { periodo: 'todo', area: '', concepto: '' }; periodoSel.value = 'todo'; areaSel.value = ''; conceptoSel.value = ''; pintar();
      } }, 'Restablecer');
      mount(main,
        h('div', { class: 'gastos-head' }, h('div', null, h('h1', null, 'Dashboard'), h('p', null, 'Control de gastos por departamento y concepto.')),
          h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cargar().then(gastos); } }, 'Actualizar')),
        h('div', { class: 'gastos-filtros' }, campo('Periodo', periodoSel), campo('Departamento', areaSel), campo('Concepto', conceptoSel), restablecer),
        cuerpo);
      pintar();
    }

    /* ---------------------------------------------------------------- configuración */
    function configuracion() {
      nav('config');
      mount(main, h('p', { class: 'gris' }, 'Cargando…'));
      run('adminConfig').then(function (c) {
        var esAdmin = yo.rol === 'admin';
        var partes = [encabezado('Configuración', esAdmin ? 'Da de alta al personal, elige quién recibe cada alerta y edita las listas del formulario.' : 'Tu cuenta y tu contraseña.'),
          h('section', { class: 'tarjeta' }, h('h2', null, 'Mi cuenta'), h('p', null, yo.nombre + ' · ' + yo.correo + ' · ' + rolNombre(yo.rol)),
            h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { cambiarPassword(false); } }, 'Cambiar mi contraseña')),
          h('section', { class: 'tarjeta' }, h('h2', null, 'Enlaces'),
            h('p', null, 'Portal para solicitar (compártelo con las áreas): ', h('br'), h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.url)),
            h('p', null, 'Este panel (base de Logística): ', h('br'), h('a', { href: c.panel, target: '_blank', rel: 'noopener' }, c.panel)))];
        if (esAdmin) partes.push(plantillaMovimientos(c), alertas(c), consecutivo(c), catalogos(c), lugares(c), usuarios(c.usuarios, c.roles));
        mount(main, partes);
      }).catch(fallo);
    }

    /* Plantilla de movimientos: el administrador sube el Excel una vez; Facturación genera con él un formato por movimiento. */
    function plantillaMovimientos(c) {
      var estado = h('div', { class: 'aviso ' + (c.plantilla ? 'aviso-ok' : 'aviso-alerta') }, h('p', null, c.plantilla
        ? ['✓ Plantilla cargada: ', h('b', null, c.plantilla.nombre), ' · ' + c.plantilla.n + ' transportistas en su tabla · subida el ' + U.dia(c.plantilla.subida) + ' por ' + c.plantilla.por + '.']
        : 'Aún no hay plantilla. Sube el archivo PLANTILLA_MOVIMIENTOS_EXT.xlsx para que Facturación descargue un formato por movimiento.'));
      var input = h('input', { type: 'file', accept: '.xlsx', class: 'archivo-oculto' });
      var boton = h('label', { class: 'btn btn-pri btn-chico btn-adjuntar' }, c.plantilla ? '📎 Cambiar plantilla' : '📎 Subir plantilla', input);
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) return;
        input.disabled = true;
        f.arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf);
          return analizarPlantilla(bytes).then(function (info) {
            return run('adminSubirPlantilla', { nombre: f.name, base64: aBase64(bytes), hoja: info.hoja, transportistas: info.transportistas });
          });
        }).then(function (r) { U.toast('Plantilla cargada con ' + r.transportistas.length + ' transportistas.'); cacheGenerador = null; return cargar(); })
          .then(configuracion).catch(function (e) { input.disabled = false; input.value = ''; fallo(e); });
      });
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Plantilla de movimientos (Excel)'),
        h('p', { class: 'gris chico' }, 'Con ella, cada entrega se descarga en su propio formato (folio, origen, destino, transportista, flete, maniobras o paquetería y subtotal); el IVA, las retenciones y el total los calcula el mismo Excel con la tabla de transportistas. La lista de transportistas del planeador se toma de esa tabla.'),
        estado, boton);
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

    /* Lugares frecuentes del formulario (origen y destino): un clic llena ciudad, Estado, dirección y contacto. */
    function lugares(c) {
      var filas = (c.catalogos.lugares || []).map(function (l) { return Object.assign({}, l); });
      var estados = [['', 'Estado…']].concat(cfg.estados_mx.map(function (e) { return [e, e]; }));
      var cuerpo = h('tbody');
      function pintar() {
        mount(cuerpo, filas.map(function (l, i) {
          var celda = function (k, ph, ancho) {
            var el = h('input', { class: 'entrada', value: l[k] || '', placeholder: ph, 'aria-label': ph + ' del lugar ' + (i + 1), style: ancho ? 'min-width:' + ancho + 'px' : null });
            el.addEventListener('input', function () { l[k] = el.value; });
            return h('td', null, el);
          };
          var est = lista(estados, l.estado); est.setAttribute('aria-label', 'Estado del lugar ' + (i + 1));
          est.addEventListener('change', function () { l.estado = est.value; });
          return h('tr', { class: 'sin-clic' }, celda('nombre', 'Nombre', 150), celda('ciudad', 'Ciudad'), h('td', null, est), celda('direccion', 'Dirección', 220),
            celda('link', 'Link de Maps'), celda('contacto', 'Contacto'), celda('telefono', 'Teléfono'),
            h('td', null, h('button', { class: 'liga chico', type: 'button', onclick: function () { filas.splice(i, 1); pintar(); } }, 'Quitar')));
        }));
      }
      pintar();
      var guardar = h('button', { class: 'btn btn-osc btn-chico', type: 'button' }, 'Guardar lugares');
      guardar.addEventListener('click', function () {
        U.ocupado(guardar, true, 'Guardando…');
        run('adminGuardarLugares', filas).then(function (r) {
          U.ocupado(guardar, false); filas = r.map(function (l) { return Object.assign({}, l); }); pintar(); U.toast('Lugares guardados. El formulario ya los muestra.');
        }).catch(function (e) { U.ocupado(guardar, false); fallo(e); });
      });
      return h('section', { class: 'tarjeta' }, h('h2', null, 'Lugares frecuentes'),
        h('p', { class: 'gris chico' }, 'Aparecen como botones en «¿De dónde sale?» y «¿A dónde va?»: al elegir uno se llenan ciudad, Estado, dirección, link y contacto. Por ejemplo, CEDIS Planta y CEDIS Cuautitlán.'),
        h('div', { class: 'tabla-caja lugares-edit' }, h('table', null,
          h('thead', null, h('tr', null, ['Nombre', 'Ciudad', 'Estado', 'Dirección', 'Link', 'Contacto', 'Teléfono', ''].map(function (t) { return h('th', null, t); }))), cuerpo)),
        h('div', { class: 'acciones', style: 'margin-top:12px' },
          h('button', { class: 'btn btn-chico', type: 'button', onclick: function () { filas.push({ nombre: '', ciudad: '', estado: '', direccion: '', link: '', contacto: '', telefono: '' }); pintar(); } }, '+ Agregar lugar'),
          guardar));
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
