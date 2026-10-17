// Lo que comparten el formulario, Gastos del mes y el Resumen anual.

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw0eXUxtk04lXH2F5JUzLCiMRVes_ZPefD9OdsYoHEmKDv7lIH3zC_BEbq9zsKxieE/exec';

const PERSONA_A = 'Eze';
const PERSONA_B = 'Iru';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun',
                     'Jul','Ago','Sep','Oct','Nov','Dic'];

const CATEGORIAS = ['Supermercado','Comida','Hogar','Servicios','Salidas','Gustos','Traslado/auto','Otro'];

// Todos los pedidos van por POST con text/plain: es petición simple (sin
// preflight) y el web app devuelve CORS, así que se puede leer la respuesta.
async function llamarScript(payload) {
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// Lee la hoja completa y arma los gastos con lo que necesitan los tableros.
async function cargarGastos() {
  const data = await llamarScript({ accion: 'listar' });
  if (!data.ok) throw new Error(data.error || 'No se pudo leer la hoja');
  return data.gastos.map(armarGasto).filter(g => g.monto > 0 && g.descripcion);
}

// Las cuotas se guardan como "Caldera 2/6": de ahí salen la base, el número
// y el total, que se usan para agrupar la serie.
function armarGasto(f) {
  const descripcion = String(f.descripcion ?? '').trim();
  const suf = descripcion.match(/\s*(\d+)\s*\/\s*(\d+)\s*$/);
  const esCuotas = /^s/i.test(String(f.esCuotas ?? '')) && !!suf;
  const nro = esCuotas ? Number(suf[1]) : 1;
  const tot = esCuotas ? Number(suf[2]) : 1;
  return {
    fila: f.fila,
    ts: String(f.ts ?? ''),
    descripcion,
    base: esCuotas ? descripcion.slice(0, suf.index).trim() : descripcion,
    quien: String(f.quien ?? '').trim(),
    corresponde: String(f.corresponde ?? '').trim() || 'Los 2',
    categoria: String(f.categoria ?? '').trim() || 'Otro',
    medio: String(f.medio ?? '').trim(),
    monto: Number(f.montoCuota) || Number(f.monto) || 0,
    mes: Number(f.mes) || 0,
    anio: Number(f.anio) || 0,
    nro, tot,
    key: 'f' + f.fila,
  };
}

const igual = (a, b) => String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim();

function plata(v) {
  const c = Math.round(Math.abs(v) * 100), ent = Math.floor(c / 100), dec = c % 100;
  return (v < 0 ? '-$' : '$') + String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, '.') +
    (dec ? ',' + String(dec).padStart(2, '0') : '');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Años para los selects: desde el anterior hasta 2030, como el formulario.
function opcionesAnios(select, elegido) {
  const actual = new Date().getFullYear();
  for (let y = actual - 1; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === elegido) opt.selected = true;
    select.appendChild(opt);
  }
}

// Si la lectura de la hoja pasa de 5 segundos, se tapa el skeleton con una
// pantalla que avisa que se están cargando. Devuelve la función que la saca.
function avisoCargaLenta() {
  let pantalla = null;
  const timer = setTimeout(() => {
    pantalla = document.createElement('div');
    pantalla.className = 'pantalla-carga';
    pantalla.setAttribute('role', 'status');
    pantalla.innerHTML = '<div class="spinner"></div><span>Cargando los gastos…</span>';
    document.body.appendChild(pantalla);
  }, 5000);
  return () => {
    clearTimeout(timer);
    if (pantalla) pantalla.remove();
  };
}

// Filas grises para las listas mientras cargan
function filasEsqueleto(n) {
  return Array.from({ length: n }, (_, i) => `
    <div class="esq-fila">
      <div class="izq">
        <span class="esq" style="height:14px; width:${[62, 45, 70, 52, 38, 58][i % 6]}%"></span>
        <span class="esq" style="height:10px; width:30%"></span>
      </div>
      <span class="esq" style="height:14px; width:72px"></span>
    </div>`).join('');
}

let toastTimer;
function showToast(msg, type = '', loading = false) {
  const el = document.getElementById('toast');
  el.innerHTML = (loading ? '<div class="spinner"></div>' : '') + '<span></span>';
  el.lastElementChild.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  if (!loading) toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// Barra de navegación: abajo en el celular, menú lateral desde 768px.
// Cada página pone <nav id="navbar" data-actual="..."> y acá se completa.
const SECCIONES = [
  { id: 'mes', href: 'tablero.html', texto: 'Gastos del mes',
    icono: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>' },
  { id: 'nuevo', href: 'index.html', texto: 'Nuevo gasto',
    icono: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/>' },
  { id: 'anual', href: 'anual.html', texto: 'Resumen anual',
    icono: '<path d="M3.5 19.5h17"/><path d="M5 15l4.5-5 4 3.5L19 7"/>' },
];

function montarNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;
  const actual = nav.dataset.actual;
  nav.setAttribute('aria-label', 'Secciones');
  nav.innerHTML =
    '<div class="nav-marca"><div class="header-icon">🏠</div><span>Gastos compartidos</span></div>' +
    SECCIONES.map(s => `
      <a href="${s.href}" data-id="${s.id}" class="nav-item${s.id === actual ? ' activo' : ''}"
         ${s.id === actual ? 'aria-current="page"' : ''}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s.icono}</svg>
        <span>${s.texto}</span>
      </a>`).join('');
}

montarNavbar();
