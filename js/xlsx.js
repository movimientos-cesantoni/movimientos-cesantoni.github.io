/* Genera un libro de Excel (.xlsx) sin librerías: XML de SpreadsheetML dentro de un ZIP sin compresión.
   hoja: { nombre, columnas: [{ titulo, ancho, tipo: 'texto' | 'izq' | 'moneda' | 'fecha' }], filas: [[valores…]] }
   Las fechas se pasan como 'AAAA-MM-DD' y los montos como número. */

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columna(i) { let s = ''; i += 1; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
function serial(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null;
}
/* Estilos: 1 encabezado negro, 2 texto centrado, 3 texto a la izquierda, 4 moneda, 5 fecha. */
const ESTILO = { texto: 2, izq: 3, moneda: 4, fecha: 5 };
const ESTILOS = XML + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd\\-mmm\\-yy"/></numFmts>' +
  '<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0D1114"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function celda(ref, valor, tipo) {
  const s = ESTILO[tipo] || 2;
  if (tipo === 'moneda' && valor !== '' && valor !== null && !isNaN(Number(valor))) return '<c r="' + ref + '" s="' + s + '"><v>' + Number(valor) + '</v></c>';
  if (tipo === 'fecha' && serial(valor) !== null) return '<c r="' + ref + '" s="' + s + '"><v>' + serial(valor) + '</v></c>';
  return '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(valor) + '</t></is></c>';
}
function hojaXml(h) {
  const cols = '<cols>' + h.columnas.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.ancho || 16) + '" customWidth="1"/>').join('') + '</cols>';
  const cab = '<row r="1" ht="30" customHeight="1">' + h.columnas.map((c, i) => '<c r="' + columna(i) + '1" s="1" t="inlineStr"><is><t>' + esc(c.titulo) + '</t></is></c>').join('') + '</row>';
  const filas = h.filas.map((f, n) => '<row r="' + (n + 2) + '">' + f.map((v, i) => celda(columna(i) + (n + 2), v, h.columnas[i].tipo)).join('') + '</row>').join('');
  return XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    cols + '<sheetData>' + cab + filas + '</sheetData></worksheet>';
}
const nombreHoja = (n, i) => (String(n || 'Hoja ' + (i + 1)).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hoja ' + (i + 1));

/* ---- ZIP sin compresión (método «store») */
const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/* archivos: [{ nombre: 'carpeta/archivo.ext', contenido: texto } o { nombre, bytes: Uint8Array }] → bytes del ZIP. */
export function zipBytes(archivos) {
  const enc = new TextEncoder(), partes = [], central = [];
  let offset = 0;
  archivos.forEach((a) => {
    const nombre = enc.encode(a.nombre), datos = a.bytes || enc.encode(a.contenido), crc = crc32(datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true); local.setUint16(26, nombre.length, true); local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true);
    c.setUint16(28, nombre.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nombre);
    offset += 30 + nombre.length + datos.length;
  });
  const tam = central.reduce((t, x) => t + x.length, 0), fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tam, true); fin.setUint32(16, offset, true);
  const todo = partes.concat(central, [new Uint8Array(fin.buffer)]), out = new Uint8Array(todo.reduce((t, x) => t + x.length, 0));
  let i = 0;
  todo.forEach((x) => { out.set(x, i); i += x.length; });
  return out;
}
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/* ZIP con varias plantillas, cada una en su carpeta (por ejemplo, «Fletes/» y «Maniobras/»). */
export function zipArchivos(archivos) { return new Blob([zipBytes(archivos)], { type: 'application/zip' }); }

export function libroXlsx(hojas) { return new Blob([libroBytes(hojas)], { type: TIPO_XLSX }); }
export function libroBytes(hojas) {
  const nombres = [];
  hojas.forEach((h, i) => { let n = nombreHoja(h.nombre, i), k = 2; while (nombres.includes(n)) n = n.slice(0, 28) + ' ' + k++; nombres.push(n); });
  const archivos = [
    { nombre: '[Content_Types].xml', contenido: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      hojas.map((h, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
    { nombre: '_rels/.rels', contenido: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nombre: 'xl/workbook.xml', contenido: XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      nombres.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      hojas.map((h, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nombre: 'xl/styles.xml', contenido: ESTILOS }
  ].concat(hojas.map((h, i) => ({ nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenido: hojaXml(h) })));
  return zipBytes(archivos);
}
