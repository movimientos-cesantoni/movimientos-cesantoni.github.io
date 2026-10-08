/* Formato de movimiento (PLANTILLA_MOVIMIENTOS_EXT.xlsx): toma el archivo que subió el administrador, llena las celdas de cada
   movimiento y devuelve un .xlsx nuevo. Conserva estilos, fórmulas (IVA, retenciones, total) y la tabla de transportistas;
   Excel recalcula las fórmulas al abrirlo. Se trabaja sobre el XML del libro, sin librerías. */
import { zipBytes } from './xlsx.js?v=29';

/* Celdas del formato. Si el administrador sube otra versión, se valida que los títulos sigan en su lugar. */
export const CELDAS = { fecha: 'A6', origen: 'A7', destino: 'I7', folio: 'C9', subtotal: 'L9', transportista: 'C11', tipo: 'C13', observaciones: 'A21' };
const TITULOS = { A9: 'FOLIO DE MOVIMIENTO', A11: 'TRANSPORTISTA', A13: 'TIPO DE MOVIMIENTO', J9: 'SUBTOTAL' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const dec = new TextDecoder(), enc = new TextEncoder();
const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const desc = (v) => String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function inflar(datos) {
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}
/* Lee un ZIP (sin cifrar) y devuelve { nombre: bytes } con todo descomprimido. */
async function leerZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const out = {};
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo de Excel está dañado.');
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), coment = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = bytes.subarray(inicio, inicio + tam);
    if (metodo === 0) out[nombre] = datos.slice();
    else if (metodo === 8) out[nombre] = await inflar(datos);
    else throw new Error('El Excel usa una compresión no soportada.');
    p += 46 + largoNombre + extra + coment;
  }
  return out;
}

function textosCompartidos(xml) {
  return (xml.match(/<si>[\s\S]*?<\/si>/g) || []).map((si) => desc((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
}
function celdasDe(xml, compartidos) {
  const celdas = {};
  (xml.match(/<c r="[A-Z]+\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach((c) => {
    const ref = c.match(/r="([A-Z]+\d+)"/)[1], t = (c.match(/ t="(\w+)"/) || [])[1], v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    const inline = (c.match(/<is>[\s\S]*?<\/is>/) || [])[0];
    celdas[ref] = t === 's' ? compartidos[Number(v)] : inline ? desc(inline.replace(/<[^>]+>/g, '')) : v === undefined ? '' : desc(v);
  });
  return celdas;
}
function rutaHoja(archivos, nombreHoja) {
  const libro = dec.decode(archivos['xl/workbook.xml']), rels = dec.decode(archivos['xl/_rels/workbook.xml.rels']);
  const hojas = [...libro.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)];
  const h = hojas.find((x) => desc(x[1]) === nombreHoja) || hojas[0];
  if (!h) throw new Error('El Excel no tiene hojas.');
  const rel = [...rels.matchAll(/<Relationship [^>]*>/g)].map((m) => m[0]).find((r) => r.includes('Id="' + h[2] + '"'));
  const destino = (rel.match(/Target="([^"]+)"/) || [])[1];
  return { nombre: desc(h[1]), ruta: destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino.replace(/^\.\//, '') };
}

/* Revisa el archivo y saca la lista de transportistas (columna «RAZON SOCIAL TRANSPORTISTA»). */
export async function analizarPlantilla(bytes) {
  const archivos = await leerZip(bytes);
  if (!archivos['xl/workbook.xml']) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const compartidos = archivos['xl/sharedStrings.xml'] ? textosCompartidos(dec.decode(archivos['xl/sharedStrings.xml'])) : [];
  const hoja = rutaHoja(archivos, 'Plantilla');
  const celdas = celdasDe(dec.decode(archivos[hoja.ruta]), compartidos);
  const faltan = Object.keys(TITULOS).filter((r) => String(celdas[r] || '').trim().toUpperCase() !== TITULOS[r]);
  if (faltan.length) throw new Error('No es la plantilla de movimientos: no encontré ' + faltan.map((r) => '«' + TITULOS[r] + '» en ' + r).join(', ') + '.');
  let transportistas = [];
  Object.keys(archivos).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).forEach((n) => {
    const c = celdasDe(dec.decode(archivos[n]), compartidos);
    const titulo = Object.keys(c).find((r) => String(c[r]).trim().toUpperCase() === 'RAZON SOCIAL TRANSPORTISTA');
    if (!titulo) return;
    const col = titulo.replace(/\d+/g, ''), fila = Number(titulo.replace(/\D/g, ''));
    for (let f = fila + 1; f < fila + 500; f++) { const v = String(c[col + f] || '').trim(); if (!v) break; transportistas.push(v.replace(/\s+/g, ' ')); }
  });
  transportistas = [...new Set(transportistas)];
  return { hoja: hoja.nombre, transportistas };
}

function ponerCelda(xml, ref, valor) {
  const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)');
  const m = xml.match(re);
  if (!m) throw new Error('La plantilla no tiene la celda ' + ref + '.');
  const estilo = (m[1].match(/ s="\d+"/) || [''])[0];
  const nueva = typeof valor === 'number'
    ? '<c r="' + ref + '"' + estilo + '><v>' + valor + '</v></c>'
    : '<c r="' + ref + '"' + estilo + ' t="inlineStr"><is><t xml:space="preserve">' + esc(valor) + '</t></is></c>';
  return xml.replace(re, nueva);
}
export function fechaLarga(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] + ' de ' + m[1] : '';
}

/* Prepara la plantilla una vez (la descomprime) y devuelve una función que genera el .xlsx de cada movimiento. */
export async function crearGenerador(bytes) {
  const base = await leerZip(bytes);
  const hoja = rutaHoja(base, 'Plantilla').ruta;
  /* Sin la cadena de cálculo: Excel la rehace y recalcula IVA, retenciones y total al abrir. */
  const quitar = ['xl/calcChain.xml'];
  const tipos = dec.decode(base['[Content_Types].xml']).replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
  const rels = dec.decode(base['xl/_rels/workbook.xml.rels']).replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, '');
  let libro = dec.decode(base['xl/workbook.xml']);
  libro = /<calcPr[^>]*fullCalcOnLoad/.test(libro) ? libro : libro.replace(/<calcPr/, '<calcPr fullCalcOnLoad="1"');
  if (!/<calcPr/.test(libro)) libro = libro.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  const hojaBase = dec.decode(base[hoja]).replace(/(<c [^>]*>)(<f>[\s\S]*?<\/f>|<f [^>]*\/>|<f [^>]*>[\s\S]*?<\/f>)<v>[\s\S]*?<\/v>/g, '$1$2');
  /* valores: { fecha, origen, destino, folio, subtotal (número), transportista, tipo, observaciones } */
  return function generar(valores) {
    let xml = hojaBase;
    Object.keys(CELDAS).forEach((k) => { if (valores[k] !== undefined) xml = ponerCelda(xml, CELDAS[k], valores[k]); });
    const archivos = Object.keys(base).filter((n) => !quitar.includes(n)).map((n) => ({
      nombre: n,
      bytes: n === hoja ? enc.encode(xml) : n === '[Content_Types].xml' ? enc.encode(tipos) : n === 'xl/_rels/workbook.xml.rels' ? enc.encode(rels)
        : n === 'xl/workbook.xml' ? enc.encode(libro) : base[n]
    }));
    return zipBytes(archivos);
  };
}

export function aBase64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
export function deBase64(b64) { const s = atob(b64), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
