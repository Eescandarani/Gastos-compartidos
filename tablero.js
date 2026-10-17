// Gastos del mes: totales, saldos, categorías y la lista con edición.

const $ = id => document.getElementById(id);

const hoy = new Date();
const estado = {
  gastos: null,       // null mientras carga
  error: false,
  mes: hoy.getMonth() + 1,
  anio: hoy.getFullYear(),
  cat: null,          // categoría elegida en la torta
  menuKey: null,      // gasto con el menú ⋮ abierto
};

const HUES = [300, 260, 200, 160, 120, 70, 30, 350];
const SIN_SALDO = 'servicios';   // los Servicios no entran en los saldos

function init() {
  document.querySelectorAll('.nombre-a').forEach(el => { el.textContent = PERSONA_A; });
  document.querySelectorAll('.nombre-b').forEach(el => { el.textContent = PERSONA_B; });

  const selMes = $('t-mes');
  MESES.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1; opt.textContent = m;
    selMes.appendChild(opt);
  });
  selMes.value = estado.mes;
  opcionesAnios($('t-anio'), estado.anio);

  selMes.addEventListener('change', e => { estado.mes = Number(e.target.value); estado.cat = null; pintar(); });
  $('t-anio').addEventListener('change', e => { estado.anio = Number(e.target.value); estado.cat = null; pintar(); });

  document.querySelectorAll('.pago-card').forEach(btn =>
    btn.addEventListener('click', () => abrirPersona(btn.dataset.persona)));
  $('t-saldos').addEventListener('click', abrirSaldos);

  // Cerrar el menú ⋮ al tocar fuera
  document.addEventListener('pointerdown', e => {
    if (estado.menuKey && !e.target.closest('[data-menu-root]')) {
      estado.menuKey = null;
      pintarLista();
    }
  }, true);

  pintar();
  cargar();
}

async function cargar() {
  // Solo la primera lectura muestra la carga; al recargar tras editar, la
  // pantalla queda como está hasta que llegan los datos nuevos.
  const quitarAviso = estado.gastos ? () => {} : avisoCargaLenta();
  try {
    estado.gastos = await cargarGastos();
    estado.error = false;
  } catch (err) {
    console.error(err);
    estado.error = true;
    if (!estado.gastos) estado.gastos = [];
  }
  quitarAviso();
  document.body.classList.remove('cargando');
  pintar();
}

/* ============ Datos del mes ============ */

const sumar = l => l.reduce((acc, g) => acc + g.monto, 0);

// Lo cargado más reciente primero: las altas se agregan al final de la hoja.
function delMes() {
  return (estado.gastos || [])
    .filter(g => g.mes === estado.mes && g.anio === estado.anio)
    .sort((x, y) => y.fila - x.fila);
}

function filtrados() {
  const todos = delMes();
  return estado.cat ? todos.filter(g => g.categoria === estado.cat) : todos;
}

function deQuien(lista, p) {
  const nombre = p === 'A' ? PERSONA_A : PERSONA_B;
  return lista.filter(g => igual(g.quien, nombre));
}

function categorias(todos) {
  const total = sumar(todos);
  const mapa = {};
  todos.forEach(g => { mapa[g.categoria] = (mapa[g.categoria] || 0) + g.monto; });
  return Object.entries(mapa).sort((x, y) => y[1] - x[1]).map(([nombre, monto], i) => {
    const hue = HUES[i % HUES.length];
    return {
      nombre, monto, frac: total ? monto / total : 0,
      pct: total ? Math.round(monto / total * 100) + '%' : '0%',
      color: `oklch(0.72 0.14 ${hue})`,
      colorTenue: `oklch(0.72 0.14 ${hue} / 0.18)`,
    };
  });
}

// Pagó − le corresponde, sobre todo el mes (sin el filtro de categoría).
function saldos(todos) {
  let pA = 0, pB = 0, cA = 0, cB = 0;
  todos.filter(g => !igual(g.categoria, SIN_SALDO)).forEach(g => {
    if (igual(g.quien, PERSONA_A)) pA += g.monto; else if (igual(g.quien, PERSONA_B)) pB += g.monto;
    if (igual(g.corresponde, PERSONA_A)) cA += g.monto;
    else if (igual(g.corresponde, PERSONA_B)) cB += g.monto;
    else { cA += g.monto / 2; cB += g.monto / 2; }
  });
  const saldoA = pA - cA;
  const deuda = Math.abs(saldoA);
  const aMano = Math.round(deuda * 100) === 0;
  const quienDebe = aMano ? 'Están a mano'
    : saldoA > 0 ? `${PERSONA_B} le debe a ${PERSONA_A}` : `${PERSONA_A} le debe a ${PERSONA_B}`;
  return {
    pA, pB, cA, cB, deuda, quienDebe,
    resumen: aMano ? 'Están a mano' : `${quienDebe} ${plata(deuda)}`,
  };
}

const etiquetaMes = () => `${MESES[estado.mes - 1]} ${estado.anio}`;
const cantidad = n => n === 1 ? '1 gasto' : `${n} gastos`;

/* ============ Pintado ============ */

function pintar() {
  if (!estado.gastos) { pintarEsqueleto(); return; }
  const todos = delMes();
  const lista = filtrados();

  $('t-total').textContent = plata(sumar(lista));
  $('t-pago-a').textContent = plata(sumar(deQuien(lista, 'A')));
  $('t-pago-b').textContent = plata(sumar(deQuien(lista, 'B')));
  $('t-saldos-resumen').textContent = saldos(todos).resumen;

  pintarTorta(todos);
  pintarLista();
}

// Textos de relleno con el ancho aproximado del dato: el CSS los vuelve bloques grises
function pintarEsqueleto() {
  $('t-total').textContent = '$0.000.000';
  $('t-pago-a').textContent = '$000.000';
  $('t-pago-b').textContent = '$000.000';
  $('t-saldos-resumen').textContent = `${PERSONA_B} le debe a ${PERSONA_A} $00.000`;
  $('t-estado').textContent = '00 gastos';
  $('t-categorias').innerHTML = [55, 70, 45, 60].map(w => `
    <div class="categoria" style="cursor:default">
      <span class="esq" style="height:12px; width:${w}%"></span>
      <span class="esq" style="height:12px; width:72px; margin-left:auto"></span>
    </div>`).join('');
  $('t-lista').innerHTML = filasEsqueleto(6);
}

function pintarTorta(todos) {
  const cats = categorias(todos);
  let acc = 0;
  const stops = cats.map(c => {
    const desde = acc * 360; acc += c.frac;
    const color = estado.cat && estado.cat !== c.nombre ? c.colorTenue : c.color;
    return `${color} ${desde}deg ${acc * 360}deg`;
  });
  $('t-torta').style.background = stops.length ? `conic-gradient(${stops.join(', ')})` : '';

  $('t-categorias').innerHTML = cats.map(c => {
    const clase = estado.cat === c.nombre ? ' activa' : estado.cat ? ' atenuada' : '';
    return `
      <button type="button" class="categoria${clase}" data-cat="${escapeHtml(c.nombre)}">
        <span class="punto" style="background:${c.color}"></span>
        <span class="nombre">${escapeHtml(c.nombre)}</span>
        <span class="pct">${c.pct}</span>
        <span class="valor">${plata(c.monto)}</span>
      </button>`;
  }).join('');
  $('t-categorias').querySelectorAll('.categoria').forEach(btn =>
    btn.addEventListener('click', () => {
      estado.cat = estado.cat === btn.dataset.cat ? null : btn.dataset.cat;
      estado.menuKey = null;
      pintar();
    }));

  $('t-filtro-cat').innerHTML = estado.cat
    ? `<button type="button" class="chip-cat"><span>${escapeHtml(estado.cat)}</span><span>✕</span></button>`
    : '';
  const chip = $('t-filtro-cat').querySelector('.chip-cat');
  if (chip) chip.addEventListener('click', () => { estado.cat = null; pintar(); });
}

function metaDe(g, conQuien) {
  return [conQuien ? 'Pagó ' + g.quien : null, g.tot > 1 ? `Cuota ${g.nro}/${g.tot}` : null]
    .filter(Boolean).join(' · ');
}

function filaGasto(g, conMenu) {
  const abierto = conMenu && estado.menuKey === g.key;
  return `
    <div class="gasto-row${conMenu ? '' : ' simple'}">
      <div class="gasto-main">
        <div class="gasto-desc">${escapeHtml(g.base)}</div>
        <div class="gasto-meta">${escapeHtml(metaDe(g, conMenu))}</div>
      </div>
      <span class="gasto-monto">${plata(g.monto)}</span>
      ${conMenu ? `
        <button type="button" class="gasto-menu-btn" data-menu-root data-key="${g.key}" aria-label="Opciones">⋮</button>
        ${abierto ? `
          <div class="gasto-menu" data-menu-root>
            <button type="button" data-editar="${g.key}">Editar</button>
            <button type="button" data-eliminar="${g.key}">Eliminar</button>
          </div>` : ''}` : ''}
    </div>`;
}

function pintarLista() {
  const lista = filtrados();
  $('t-estado').textContent = estado.error ? 'No se pudo cargar' : cantidad(lista.length);

  const cont = $('t-lista');
  if (estado.error && !estado.gastos.length) {
    cont.innerHTML = '<div class="lista-vacia">No se pudieron leer los gastos. Revisá la conexión y recargá.</div>';
    return;
  }
  cont.innerHTML = lista.length
    ? lista.map(g => filaGasto(g, true)).join('')
    : '<div class="lista-vacia">No hay gastos en este mes.</div>';

  cont.querySelectorAll('.gasto-menu-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      estado.menuKey = estado.menuKey === btn.dataset.key ? null : btn.dataset.key;
      pintarLista();
    }));
  cont.querySelectorAll('[data-editar]').forEach(btn =>
    btn.addEventListener('click', () => pedirEditar(buscar(btn.dataset.editar))));
  cont.querySelectorAll('[data-eliminar]').forEach(btn =>
    btn.addEventListener('click', () => pedirEliminar(buscar(btn.dataset.eliminar))));
}

const buscar = key => estado.gastos.find(g => g.key === key);

/* ============ Hojas ============ */

// Una hoja por vez (más la de confirmar, que va encima). Se cierra tocando
// el fondo o el ✕.
function abrirHoja(html, { clase = '', encima = false } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'hoja-fondo' + (encima ? ' encima' : '');
  fondo.innerHTML = `<div class="hoja ${clase}">${html}</div>`;
  fondo.addEventListener('click', e => { if (e.target === fondo) cerrarHoja(fondo); });
  fondo.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => cerrarHoja(fondo)));
  $('hojas').appendChild(fondo);
  return fondo;
}

function cerrarHoja(fondo) { fondo.remove(); }

function encabezado(titulo, sub, extra = '') {
  return `
    <div class="hoja-header">
      <div class="hoja-titulo">
        <div class="titulo">${escapeHtml(titulo)}</div>
        ${sub ? `<div class="sub">${escapeHtml(sub)}${extra}</div>` : ''}
      </div>
      <button type="button" class="cerrar-btn" data-cerrar aria-label="Cerrar">✕</button>
    </div>`;
}

function abrirPersona(p) {
  if (!estado.gastos) return;
  estado.menuKey = null; pintarLista();
  const lista = deQuien(filtrados(), p);
  const nombre = p === 'A' ? PERSONA_A : PERSONA_B;
  abrirHoja(
    encabezado(`Gastos de ${nombre}`, `${etiquetaMes()} · ${plata(sumar(lista))}`) +
    `<div class="hoja-cuerpo">${lista.length
      ? lista.map(g => filaGasto(g, false)).join('')
      : '<div class="lista-vacia">Sin gastos este mes.</div>'}</div>`);
}

function abrirSaldos() {
  if (!estado.gastos) return;
  estado.menuKey = null; pintarLista();
  const s = saldos(delMes());
  const celda = v => `<div class="celda">${plata(v)}</div>`;
  const fondo = abrirHoja(
    encabezado('Saldos', `${etiquetaMes()} · Sin Servicios`, `
      <span class="info">
        <button type="button" class="info-btn" aria-label="Por qué sin Servicios" aria-describedby="info-servicios">i</button>
        <span class="info-tip" role="tooltip" id="info-servicios">Para calcular los saldos se descontaron los gastos de la categoría “Servicios”.</span>
      </span>`) + `
    <div class="saldo-principal">
      <span class="quien">${escapeHtml(s.quienDebe)}</span>
      <span class="monto">${plata(s.deuda)}</span>
    </div>
    <div class="saldo-tabla">
      <span></span><span class="rotulo">Pagó</span><span></span><span class="rotulo">Le corresponde</span>
      <span class="persona">${escapeHtml(PERSONA_A)}</span>${celda(s.pA)}<span class="menos">−</span>${celda(s.cA)}
      <span class="persona">${escapeHtml(PERSONA_B)}</span>${celda(s.pB)}<span class="menos">−</span>${celda(s.cB)}
    </div>`, { clase: 'ancha' });

  // En desktop se abre con hover; en el celular, con un tap (y otro tap la cierra)
  const info = fondo.querySelector('.info');
  info.querySelector('.info-btn').addEventListener('click', e => {
    e.stopPropagation();
    info.classList.toggle('abierta');
  });
  fondo.addEventListener('click', e => { if (!info.contains(e.target)) info.classList.remove('abierta'); });
}

/* ============ Editar / eliminar ============ */

// Cuotas de la misma compra desde g en adelante: mismo alta (marca temporal),
// mismo total de cuotas y en el mes que les toca.
function serieDe(g, siguientes) {
  if (!siguientes || g.tot <= 1) return [g];
  const base = g.anio * 12 + g.mes;
  return estado.gastos.filter(x =>
    x.ts === g.ts && x.base === g.base && x.tot === g.tot && x.nro >= g.nro &&
    (x.anio * 12 + x.mes) - base === x.nro - g.nro);
}

function confirmar({ titulo, texto, botones }) {
  const fondo = abrirHoja(`
    <div class="hoja-texto">
      <div class="titulo">${escapeHtml(titulo)}</div>
      <div class="texto">${escapeHtml(texto)}</div>
    </div>
    <div class="hoja-botones">
      ${botones.map((b, i) => `<button type="button" class="hoja-btn ${b.clase}" data-boton="${i}">${escapeHtml(b.texto)}</button>`).join('')}
      <button type="button" class="hoja-btn secundario" data-cerrar>Cancelar</button>
    </div>`, { clase: 'formulario', encima: true });
  fondo.querySelectorAll('[data-boton]').forEach(btn =>
    btn.addEventListener('click', () => { cerrarHoja(fondo); botones[Number(btn.dataset.boton)].accion(); }));
}

function textoSiguientes(verbo, g) {
  const restantes = g.tot - g.nro;
  return `${verbo} esta y las siguientes` + (restantes > 0 ? ` (${restantes + 1})` : '');
}

function pedirEliminar(g) {
  estado.menuKey = null; pintarLista();
  if (g.tot > 1) {
    confirmar({
      titulo: 'Elegí qué cuotas querés eliminar',
      texto: `${g.base} es la cuota ${g.nro} de ${g.tot}.`,
      botones: [
        { texto: 'Eliminar solo esta cuota', clase: 'peligro', accion: () => aplicar('eliminar', g, false) },
        { texto: textoSiguientes('Eliminar', g), clase: 'peligro', accion: () => aplicar('eliminar', g, true) },
      ],
    });
    return;
  }
  confirmar({
    titulo: '¿Eliminar este gasto?',
    texto: `${g.descripcion} · ${plata(g.monto)}. Esta acción no se puede deshacer.`,
    botones: [{ texto: 'Eliminar', clase: 'peligro', accion: () => aplicar('eliminar', g, false) }],
  });
}

function pedirEditar(g) {
  estado.menuKey = null; pintarLista();
  if (g.tot > 1) {
    confirmar({
      titulo: 'Elegí qué cuotas querés editar',
      texto: `${g.base} es la cuota ${g.nro} de ${g.tot}.`,
      botones: [
        { texto: 'Editar solo esta cuota', clase: 'primario', accion: () => abrirEdicion(g, false) },
        { texto: textoSiguientes('Editar', g), clase: 'secundario', accion: () => abrirEdicion(g, true) },
      ],
    });
    return;
  }
  abrirEdicion(g, false);
}

function segmento(nombre, opciones, actual) {
  return `<div class="segment" data-seg="${nombre}">${opciones.map(([valor, texto]) =>
    `<button type="button" class="segment-btn${igual(valor, actual) ? ' active' : ''}" data-value="${escapeHtml(valor)}">${escapeHtml(texto)}</button>`
  ).join('')}</div>`;
}

function abrirEdicion(g, siguientes) {
  const datos = { medio: g.medio, quien: g.quien };
  const sub = g.tot > 1 ? `Cuota ${g.nro}/${g.tot}` + (siguientes && g.nro < g.tot ? ' y siguientes' : '') : '';
  const monto = String(Math.round(g.monto * 100) / 100).replace('.', ',');
  const cats = CATEGORIAS.includes(g.categoria) ? CATEGORIAS : [...CATEGORIAS, g.categoria];

  const fondo = abrirHoja(
    encabezado('Editar gasto', sub) + `
    <div class="card">
      <label class="card-row">
        <span class="row-label suave">Descripción</span>
        <input type="text" id="e-descripcion" value="${escapeHtml(g.base)}" autocomplete="off" />
      </label>
      <label class="card-row">
        <span class="row-label suave">${g.tot > 1 ? 'Monto cuota' : 'Monto'}</span>
        <input type="text" id="e-monto" inputmode="decimal" value="${escapeHtml(monto)}" autocomplete="off" style="font-variant-numeric: tabular-nums;" />
      </label>
      <label class="card-row campo-select">
        <span class="row-label suave">Categoría</span>
        <span class="valor"><span id="e-categoria-label">${escapeHtml(g.categoria)}</span><span class="chevron">›</span></span>
        <select id="e-categoria">${cats.map(c =>
          `<option${c === g.categoria ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
      </label>
      <div class="card-row">
        ${segmento('medio', [['Tarjeta de crédito', 'Tarjeta'], ['Contado', 'Contado']], g.medio)}
      </div>
      <div class="card-row">
        <span class="row-label">Quién pagó</span>
        ${segmento('quien', [[PERSONA_A, PERSONA_A], [PERSONA_B, PERSONA_B]], g.quien)}
      </div>
    </div>
    <button type="button" class="hoja-btn primario" id="e-guardar" style="margin-top: 4px;">Guardar cambios</button>`,
    { clase: 'formulario' });

  const cat = fondo.querySelector('#e-categoria');
  cat.addEventListener('change', () => { fondo.querySelector('#e-categoria-label').textContent = cat.value; });

  fondo.querySelectorAll('[data-seg]').forEach(seg =>
    seg.querySelectorAll('.segment-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        datos[seg.dataset.seg] = btn.dataset.value;
        seg.querySelectorAll('.segment-btn').forEach(b => b.classList.toggle('active', b === btn));
      })));

  fondo.querySelector('#e-guardar').addEventListener('click', () => {
    const descripcion = fondo.querySelector('#e-descripcion').value.trim();
    const montoCuota = parseFloat(fondo.querySelector('#e-monto').value.replace(/\./g, '').replace(',', '.'));
    if (!descripcion || !(montoCuota > 0)) return showToast('⚠️ Completá descripción y monto', 'error');
    aplicar('editar', g, siguientes, {
      descripcion, categoria: cat.value, medioPago: datos.medio, quienPago: datos.quien, montoCuota,
    }, fondo);
  });
}

function mensajeDeError(res) {
  if (res && res.error === 'no_encontrado') return '⚠️ La hoja cambió, recargá e intentá de nuevo';
  return 'No se pudo guardar el cambio';
}

// Manda el cambio con cada fila y lo que tiene que encontrar ahí (marca
// temporal + descripción): si la hoja se movió, el script no toca nada.
// Con la escritura confirmada se vuelve a leer, así las filas quedan al día.
async function aplicar(accion, g, siguientes, cambios, hojaEdicion) {
  const afectados = serieDe(g, siguientes);
  const n = afectados.length;
  const btn = hojaEdicion && hojaEdicion.querySelector('#e-guardar');
  if (btn) btn.disabled = true;
  showToast(accion === 'eliminar' ? 'Eliminando…' : 'Guardando…', '', true);

  try {
    const res = await llamarScript({
      accion,
      filas: afectados.map(x => ({ fila: x.fila, ts: x.ts, descripcion: x.descripcion })),
      cambios: cambios || null,
    });
    if (!res.ok) { showToast(mensajeDeError(res), 'error'); return; }

    if (hojaEdicion) cerrarHoja(hojaEdicion);
    showToast(accion === 'eliminar'
      ? (n > 1 ? `✓ Se eliminaron ${n} cuotas` : '✓ Gasto eliminado')
      : (n > 1 ? `✓ Se actualizaron ${n} cuotas` : '✓ Gasto actualizado'), 'success');
    await cargar();
  } catch (err) {
    console.error(err);
    showToast('No se pudo guardar el cambio', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

init();
