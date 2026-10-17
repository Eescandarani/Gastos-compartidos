// Resumen anual: gastos por mes de cada uno, total en cuotas y cuotas vigentes.

const $ = id => document.getElementById(id);

const estado = {
  gastos: null,
  error: false,
  anio: null,                 // null = todos los meses con gastos
  sel: { g1: null, g2: null }, // columna elegida en cada gráfico
};

const COLOR_A = '#c084fc';
const COLOR_B = 'oklch(0.78 0.12 200)';
const COLOR_CUOTAS = '#818cf8';
const ALTO = 180, ANCHO = 1200;   // viewBox de las líneas

function init() {
  $('a-anio').addEventListener('change', e => {
    estado.anio = e.target.value ? Number(e.target.value) : null;
    estado.sel = { g1: null, g2: null };
    pintar();
  });
  pintar();
  cargar();
}

async function cargar() {
  const quitarAviso = avisoCargaLenta();
  try {
    estado.gastos = await cargarGastos();
    estado.error = false;
  } catch (err) {
    console.error(err);
    estado.error = true;
    estado.gastos = [];
  }
  quitarAviso();
  document.body.classList.remove('cargando');
  pintar();
}

// Meses del eje: los 12 del año elegido, o de la primera a la última cuota
// cargada si no hay año.
function periodos() {
  const todos = estado.gastos || [];
  const anioHoy = new Date().getFullYear();
  if (estado.anio) {
    return MESES_CORTO.map((m, i) => ({ k: estado.anio * 12 + i, label: m, titulo: `${MESES[i]} ${estado.anio}` }));
  }
  const ks = todos.filter(g => g.anio && g.mes >= 1 && g.mes <= 12).map(g => g.anio * 12 + g.mes - 1);
  const k0 = ks.length ? Math.min(...ks) : anioHoy * 12;
  const k1 = ks.length ? Math.max(...ks) : anioHoy * 12 + 11;
  const lista = [];
  for (let k = k0; k <= k1; k++) {
    const y = Math.floor(k / 12), m = k % 12;
    lista.push({ k, label: `${MESES_CORTO[m]} ${String(y).slice(2)}`, titulo: `${MESES[m]} ${y}` });
  }
  return lista;
}

function pintarSelectAnio() {
  const sel = $('a-anio');
  const anios = new Set((estado.gastos || []).map(g => g.anio).filter(Boolean));
  anios.add(new Date().getFullYear());
  sel.innerHTML = `<option value="">${estado.anio ? 'Deseleccionar' : 'Año'}</option>` +
    [...anios].sort((x, y) => x - y).map(a => `<option value="${a}">${a}</option>`).join('');
  sel.value = estado.anio ? String(estado.anio) : '';
  sel.classList.toggle('vacio', !estado.anio);
}

function pintar() {
  pintarSelectAnio();
  if (!estado.gastos) { pintarEsqueleto(); return; }

  const ps = periodos();
  const idx = {};
  ps.forEach((p, i) => { idx[p.k] = i; });
  const sA = ps.map(() => 0), sB = ps.map(() => 0), sC = ps.map(() => 0);
  (estado.gastos || []).forEach(g => {
    const i = idx[g.anio * 12 + g.mes - 1];
    if (i === undefined) return;
    if (igual(g.quien, PERSONA_A)) sA[i] += g.monto; else if (igual(g.quien, PERSONA_B)) sB[i] += g.monto;
    if (g.tot > 1) sC[i] += g.monto;
  });

  grafico('g1', ps, [
    { label: PERSONA_A, color: COLOR_A, data: sA },
    { label: PERSONA_B, color: COLOR_B, data: sB },
  ]);
  grafico('g2', ps, [{ label: 'Cuotas', color: COLOR_CUOTAS, data: sC }]);
  pintarVigentes();
}

const corto = v => v >= 1e6 ? (Math.round(v / 1e5) / 10).toString().replace('.', ',') + ' M'
  : v >= 1e3 ? Math.round(v / 1e3) + ' k' : String(Math.round(v));

// Escalón "redondo" (1, 2, 2,5, 5, 10 × 10^n) para unas 3 líneas de grilla.
function escalon(max) {
  if (!max) return 1;
  const raw = max / 3, pow = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

function grafico(id, ps, series) {
  const N = ps.length;
  const max = Math.max(0, ...series.flatMap(s => s.data));
  const paso = escalon(max);
  const tope = paso * Math.max(1, Math.ceil(max / paso));
  const yPct = v => (1 - v / tope) * 100;
  const x = i => (i + 0.5) * ANCHO / N;
  const salto = N <= 12 ? 1 : Math.ceil(N / 12);
  const sel = estado.sel[id];
  const haySel = sel !== null && sel < N;

  $(id + '-leyenda').innerHTML = series.map(s =>
    `<span class="leyenda"><span class="linea" style="background:${s.color}"></span>${escapeHtml(s.label)}</span>`).join('');

  let grilla = '';
  for (let v = tope; v >= 0; v -= paso) {
    grilla += `<div class="grilla" style="top:${yPct(v)}%"></div>
      <span class="eje" style="top:${yPct(v)}%">${v ? corto(v) : '0'}</span>`;
  }

  const lineas = series.map(s => {
    const d = s.data.map((v, i) => (i ? 'L' : 'M') + x(i) + ' ' + (ALTO - (v / tope) * ALTO).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${ANCHO} ${ALTO}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${s.color}"
      stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }).join('');

  let seleccion = '';
  if (haySel) {
    const left = (sel + 0.5) / N * 100;
    const shift = sel < N / 2 ? 'translateX(8px)' : 'translateX(calc(-100% - 8px))';
    const total = series.reduce((acc, s) => acc + s.data[sel], 0);
    seleccion = `
      <div class="guia" style="left:${left}%"></div>
      ${series.map(s => `<span class="punto" style="left:${left}%; top:${yPct(s.data[sel])}%; background:${s.color}"></span>`).join('')}
      <div class="tip" style="left:${left}%; transform:${shift}">
        <span class="titulo">${ps[sel].titulo}</span>
        ${series.map(s => `<span class="fila"><span class="color" style="background:${s.color}"></span>
          <span class="nombre">${escapeHtml(s.label)}</span><span class="valor">${plata(s.data[sel])}</span></span>`).join('')}
        ${series.length > 1 ? `<span class="fila total"><span class="nombre">Total</span><span class="valor">${plata(total)}</span></span>` : ''}
      </div>`;
  }

  $(id).innerHTML = `
    <div class="grafico">
      ${grilla}
      <div class="area">
        ${lineas}
        <div class="columnas">${ps.map((p, i) =>
          `<button type="button" data-i="${i}" aria-label="${p.titulo}"></button>`).join('')}</div>
        ${seleccion}
      </div>
    </div>
    <div class="meses">${ps.map((p, i) =>
      `<span class="${sel === i ? 'sel' : ''}">${i % salto === 0 || sel === i ? p.label : ''}</span>`).join('')}</div>`;

  $(id).querySelectorAll('.columnas button').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      estado.sel[id] = estado.sel[id] === i ? null : i;
      pintar();
    }));
}

// Sin datos todavía: bloques grises en lugar de ejes en 0 y líneas planas
function pintarEsqueleto() {
  ['g1', 'g2'].forEach(id => {
    $(id + '-leyenda').innerHTML = '';
    $(id).innerHTML = '<span class="esq esq-grafico"></span>';
  });
  $('a-vig-count').textContent = '0 compras';
  $('a-vigentes').innerHTML = filasEsqueleto(3);
}

// Compras en cuotas que todavía tienen alguna desde el mes actual en adelante.
function pintarVigentes() {
  const cont = $('a-vigentes');
  if (estado.error) {
    cont.innerHTML = '<div class="lista-vacia">No se pudieron leer los gastos. Revisá la conexión y recargá.</div>';
    $('a-vig-count').textContent = 'No se pudo cargar';
    return;
  }

  const hoy = new Date();
  const ahora = hoy.getFullYear() * 12 + hoy.getMonth() + 1;
  const grupos = {};
  estado.gastos.filter(g => g.tot > 1).forEach(g => {
    const k = g.ts + '|' + g.base + '|' + g.quien + '|' + g.tot;
    (grupos[k] = grupos[k] || []).push(g);
  });

  const vigentes = Object.values(grupos).map(l => {
    l.sort((x, y) => x.nro - y.nro);
    const actual = l.find(g => g.anio * 12 + g.mes >= ahora);
    if (!actual) return null;
    const faltan = actual.tot - actual.nro;
    const corr = igual(actual.corresponde, PERSONA_A) ? PERSONA_A
      : igual(actual.corresponde, PERSONA_B) ? PERSONA_B : 'Los 2';
    return {
      faltan,
      html: `
        <div class="cuota-row">
          <div class="izq">
            <span class="gasto-desc">${escapeHtml(actual.base)}</span>
            <span class="gasto-meta">Cuota ${actual.nro} de ${actual.tot} · Corresponde a ${escapeHtml(corr)}</span>
            <div class="progreso"><div style="width:${Math.round(actual.nro / actual.tot * 100)}%"></div></div>
          </div>
          <div class="der">
            <span class="gasto-monto">${plata(actual.monto)}</span>
            <span class="faltan">${faltan === 0 ? 'Última cuota' : faltan === 1 ? 'Falta 1' : `Faltan ${faltan}`}</span>
          </div>
        </div>`,
    };
  }).filter(Boolean).sort((x, y) => y.faltan - x.faltan);

  $('a-vig-count').textContent = vigentes.length === 1 ? '1 compra' : `${vigentes.length} compras`;
  cont.innerHTML = vigentes.length
    ? vigentes.map(v => v.html).join('')
    : '<div class="lista-vacia">No hay cuotas vigentes.</div>';
}

init();
