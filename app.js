(() => {
  const CLAVE = "manantial.lista.v1";
  const TODAS = "Todas";
  const NUEVA = "__nueva__";

  let estado = cargar();
  let categoriaActiva = TODAS;
  let editando = false;
  let busqueda = "";
  let ordenCol = null;  // "mayorista" | "minorista" | null (orden original)
  let ordenDir = "desc";

  const $ = (id) => document.getElementById(id);
  const cuerpo = $("cuerpo");
  const dlg = $("dlg");

  // ---------- Modo administrador ----------
  // Candado simple: sin la contraseña no aparecen los controles de edición.
  const HASH_ADMIN = "9293ed9bfdb6d2756aa293f85c2f590b1bd756a4be6d4b0f12640503c4bad0df";
  const CLAVE_ADMIN = "manantial.admin";
  const svg = (trazos) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazos}</svg>`;
  const OJO = svg(`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>`);
  const OJO_TACHADO = svg(`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>`);
  async function hashear(texto) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("manantial:" + texto));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function esAdmin() {
    try { return localStorage.getItem(CLAVE_ADMIN) === HASH_ADMIN; } catch (e) { return false; }
  }
  function aplicarAdmin() {
    document.body.classList.toggle("admin", esAdmin());
    if (!esAdmin() && editando) $("btnEditar").click(); // sale del modo edición
  }
  function pedirClave() {
    dlg.onclick = null; dlg.onclose = dlg.oncancel = null;
    dlg.innerHTML = `<h2>Editar</h2>
      <label>Contraseña</label>
      <div class="campo-clave">
        <input id="clave" type="text" name="codigo-editor" class="oculto" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        <button type="button" id="ojo" class="ojo" aria-label="Mostrar contraseña" title="Mostrar contraseña">${OJO}</button>
      </div>
      <div class="pie"><button class="btn" id="clNo">Cancelar</button><button class="btn primario" id="clSi">Entrar</button></div>`;
    dlg.showModal();
    $("clave").focus();
    // verifica mientras se escribe: si es correcta, cierra el cartel sola
    $("clave").oninput = async () => {
      try { if ((await hashear($("clave").value)) === HASH_ADMIN) entrar(); } catch (e) { /* se verifica con Entrar */ }
    };
    const entrar = async () => {
      try {
        if ((await hashear($("clave").value)) !== HASH_ADMIN) { $("clave").value = ""; return aviso("Contraseña incorrecta."); }
        localStorage.setItem(CLAVE_ADMIN, HASH_ADMIN);
      } catch (e) { return aviso("No se pudo verificar la contraseña en este navegador."); }
      dlg.close(); aplicarAdmin(); aviso("Modo administrador activado.");
    };
    $("ojo").onclick = () => {
      const oculta = $("clave").classList.toggle("oculto");
      $("ojo").innerHTML = oculta ? OJO : OJO_TACHADO;
      $("ojo").title = $("ojo").ariaLabel = oculta ? "Mostrar contraseña" : "Ocultar contraseña";
      $("clave").focus();
    };
    $("clNo").onclick = () => dlg.close();
    $("clSi").onclick = entrar;
    $("clave").onkeydown = (e) => { if (e.key === "Enter") entrar(); };
  }
  function salirAdmin() {
    try { localStorage.removeItem(CLAVE_ADMIN); } catch (e) { /* nada */ }
    aplicarAdmin(); aviso("Saliste del modo administrador.");
  }

  // ---------- Datos ----------
  function semilla() {
    return {
      categorias: [...window.CATEGORIAS_INICIALES],
      productos: window.PRODUCTOS_INICIALES.map(([categoria, nombre, mayorista, minorista, nota, sub = ""]) => ({
        id: uid(), categoria, nombre, sub, mayorista, minorista, nota, unidad: window.unidadPorDefecto(categoria, nombre),
      })),
      actualizado: null,
    };
  }
  // Datos guardados antes de existir la unidad: se completan con el valor por defecto.
  function completarUnidades(e) {
    e.productos.forEach((p) => {
      if (p.unidad !== "kg" && p.unidad !== "uni") p.unidad = window.unidadPorDefecto(p.categoria, p.nombre);
      if (typeof p.sub !== "string") {
        // datos anteriores a la sub descripción: la nota de la Bocha Fox pasa a ser sub descripción
        const esBochaFox = p.nombre === "Bocha Fox" && /^Pelayo c\/\s?pistacho$/i.test(p.nota || "");
        p.sub = esBochaFox ? "Pelayo c/ pistacho" : "";
        if (esBochaFox) p.nota = "";
      }
    });
    return e;
  }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function cargar() {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (raw) return completarUnidades(JSON.parse(raw));
    } catch (e) { /* sin almacenamiento: se usa el catálogo inicial */ }
    return semilla();
  }
  function guardar() {
    estado.actualizado = new Date().toISOString();
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); }
    catch (e) { aviso("⚠️ No se pudo guardar en este navegador. Descargá una copia de seguridad."); }
    pintarFecha();
  }

  // ---------- Utilidades ----------
  function formatearPrecio(valor, unidad) {
    const v = String(valor ?? "").trim();
    if (!v) return "";
    if (/^\d+([.,]\d+)?$/.test(v)) {
      // precio simple: lleva la unidad de venta (kg o uni)
      return "$ " + Number(v.replace(",", ".")).toLocaleString("es-AR") + (unidad ? " " + unidad : "");
    }
    // textos tipo "1200 x 100": formatear el primer número
    return v.replace(/^(\d+)/, (n) => "$ " + Number(n).toLocaleString("es-AR"));
  }
  function aviso(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => (t.hidden = true), 3000);
  }
  function sinAcentos(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  // ---------- Pintar ----------
  function pintarFecha() {
    $("actualizado").textContent = estado.actualizado
      ? "Actualizado: " + new Date(estado.actualizado).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      : "";
  }
  function pintarTabs() {
    const conteo = (c) => estado.productos.filter((p) => p.categoria === c).length;
    const items = [TODAS, ...estado.categorias];
    $("tabs").innerHTML = items.map((c) => {
      const n = c === TODAS ? estado.productos.length : conteo(c);
      return `<button class="tab ${c === categoriaActiva ? "activa" : ""}" data-cat="${esc(c)}">${esc(c)}<span class="n">${n}</span></button>`;
    }).join("") + (editando ? `<button class="tab nueva" data-nueva="1">➕ Nueva categoría</button>` : "");
  }
  function nuevaCategoria(idProducto) {
    dlg.onclick = null;
    dlg.innerHTML = `<h2>Nueva categoría</h2>
      <label>Nombre</label>
      <input id="catNombre" placeholder="Ej: Bebidas" autocomplete="off">
      <div class="pie"><button class="btn" id="ncNo">Cancelar</button><button class="btn primario" id="ncSi">Crear</button></div>`;
    dlg.showModal();
    $("catNombre").focus();
    const crear = () => {
      const nombre = $("catNombre").value.trim();
      if (!nombre) return aviso("Escribí un nombre.");
      if (estado.categorias.some((c) => sinAcentos(c) === sinAcentos(nombre))) return aviso("Esa categoría ya existe.");
      estado.categorias.push(nombre);
      categoriaActiva = nombre;
      const p = idProducto && estado.productos.find((x) => x.id === idProducto);
      if (p) p.categoria = nombre;
      guardar(); pintar(); dlg.close();
      aviso(p ? `Categoría "${nombre}" creada y producto movido.` : `Categoría "${nombre}" creada. Usá ➕ Agregar producto.`);
    };
    // si cancela (botón o Esc), el desplegable vuelve a su valor
    dlg.onclose = dlg.oncancel = () => pintarTabla();
    $("ncNo").onclick = () => { dlg.close(); pintarTabla(); };
    $("ncSi").onclick = crear;
    $("catNombre").onkeydown = (e) => { if (e.key === "Enter") crear(); };
  }
  function filtrados() {
    const q = sinAcentos(busqueda.trim());
    return estado.productos.filter((p) =>
      (q || categoriaActiva === TODAS || p.categoria === categoriaActiva) &&
      (!q || sinAcentos(p.nombre + " " + p.sub + " " + p.nota).includes(q))
    );
  }
  function valorNumerico(v) {
    const m = String(v ?? "").trim().match(/^\d+([.,]\d+)?/);
    return m ? Number(m[0].replace(",", ".")) : null;
  }
  function ordenar(lista) {
    if (!ordenCol) return lista;
    const signo = ordenDir === "desc" ? -1 : 1;
    if (ordenCol === "nombre") {
      // alfabético, sin distinguir mayúsculas ni acentos
      return [...lista].sort((a, b) => signo * a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true }));
    }
    // los productos sin precio quedan siempre al final
    return [...lista].sort((a, b) => {
      const x = valorNumerico(a[ordenCol]), y = valorNumerico(b[ordenCol]);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * signo;
    });
  }
  function pintarOrden() {
    document.querySelectorAll(".orden").forEach((b) => {
      const activo = b.dataset.orden === ordenCol;
      b.classList.toggle("activo", activo);
      b.querySelector(".flecha").textContent = !activo ? "⇅" : ordenDir === "desc" ? "▼" : "▲";
      if (b.dataset.orden === "nombre") {
        b.querySelector(".flecha").textContent = !activo ? "⇅" : ordenDir === "asc" ? "▲" : "▼";
        b.title = !activo ? "Ordenar de la A a la Z" : ordenDir === "asc" ? "De la A a la Z (tocá para invertir)" : "De la Z a la A (tocá para quitar el orden)";
        return;
      }
      b.title = !activo ? "Ordenar de mayor a menor" : ordenDir === "desc" ? "Ordenado de mayor a menor (tocá para invertir)" : "Ordenado de menor a mayor (tocá para quitar el orden)";
    });
  }
  function filaVista(p) {
    const celda = (v, cls) => {
      const f = formatearPrecio(v, p.unidad);
      return `<td class="precio ${cls}${f ? "" : " sin"}${f.length > 15 ? " largo" : ""}">${f || "—"}</td>`;
    };
    return `<tr data-id="${p.id}">
      <td class="nombre">${esc(p.nombre)}${p.sub ? `<small class="sub">${esc(p.sub)}</small>` : ""}</td>
      ${celda(p.mayorista, "mayo")}${celda(p.minorista, "mino")}
      <td class="nota">${esc(p.nota)}</td>
    </tr>`;
  }
  function filaEdicion(p) {
    const opcionesCat = estado.categorias.map((c) => `<option ${c === p.categoria ? "selected" : ""}>${esc(c)}</option>`).join("")
      + `<option value="${NUEVA}">➕ Nueva categoría…</option>`;
    return `<tr data-id="${p.id}">
      <td class="nombre">
        <input data-campo="nombre" value="${esc(p.nombre)}" placeholder="Producto">
        <input class="sub-input" data-campo="sub" value="${esc(p.sub)}" placeholder="Sub descripción (opcional)">
      </td>
      <td class="precio mayo"><input data-campo="mayorista" value="${esc(p.mayorista)}" inputmode="text" placeholder="Mayorista"></td>
      <td class="precio mino"><input data-campo="minorista" value="${esc(p.minorista)}" inputmode="text" placeholder="Minorista"></td>
      <td class="nota"><input data-campo="nota" value="${esc(p.nota)}" placeholder="Comentario" aria-label="Comentario"></td>
      <td class="acc edit-only">
        <select data-campo="categoria" title="Categoría" style="width:100%;margin-bottom:4px">${opcionesCat}</select>
        <select data-campo="unidad" title="Se vende por kg o por unidad" style="width:100%;margin-bottom:4px">
          <option value="kg" ${p.unidad === "kg" ? "selected" : ""}>por kg</option>
          <option value="uni" ${p.unidad === "uni" ? "selected" : ""}>por unidad</option>
        </select>
        <button class="btn-fila borrar" data-borrar="${p.id}" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  }
  function pintarTabla() {
    const lista = ordenar(filtrados());
    pintarOrden();
    // la columna Comentario solo se muestra si hay alguno a la vista (o si se está editando)
    $("tabla").classList.toggle("sin-notas", !editando && !lista.some((p) => p.nota));
    $("vacio").hidden = lista.length > 0;
    let html = "";
    if (categoriaActiva === TODAS && !busqueda) {
      const por = {};
      lista.forEach((p) => (por[p.categoria] ??= []).push(p));
      estado.categorias.forEach((c) => {
        if (!por[c]) return;
        html += `<tr class="cat-fila"><td colspan="5">${esc(c)}</td></tr>`;
        html += por[c].map(editando ? filaEdicion : filaVista).join("");
      });
    } else {
      html = lista.map(editando ? filaEdicion : filaVista).join("");
    }
    cuerpo.innerHTML = html;
  }
  function pintar() { pintarTabs(); pintarTabla(); pintarFecha(); }

  // ---------- Eventos principales ----------
  $("buscar").addEventListener("input", (e) => { busqueda = e.target.value; pintarTabla(); });
  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab"); if (!b) return;
    if (b.dataset.nueva) return nuevaCategoria();
    categoriaActiva = b.dataset.cat; pintar();
  });
  // Orden por precio: mayor→menor, menor→mayor, y vuelve al orden original
  document.querySelector("thead").addEventListener("click", (e) => {
    const b = e.target.closest(".orden"); if (!b) return;
    const col = b.dataset.orden;
    // Producto: A→Z, Z→A, sin orden. Precios: mayor→menor, menor→mayor, sin orden.
    const primero = col === "nombre" ? "asc" : "desc", segundo = col === "nombre" ? "desc" : "asc";
    if (ordenCol !== col) { ordenCol = col; ordenDir = primero; }
    else if (ordenDir === primero) ordenDir = segundo;
    else ordenCol = null;
    pintarTabla();
  });
  $("btnAdmin").addEventListener("click", pedirClave);
  $("btnSalir").addEventListener("click", salirAdmin);
  $("btnImprimir").addEventListener("click", () => window.print());
  $("btnEditar").addEventListener("click", () => {
    if (!esAdmin() && !editando) return;
    editando = !editando;
    document.body.classList.toggle("editando", editando);
    $("btnEditar").textContent = editando ? "✅ Listo" : "✏️ Editar";
    $("aviso").hidden = !editando;
    pintar();
  });

  // Edición en línea: se guarda al escribir
  cuerpo.addEventListener("input", (e) => {
    const campo = e.target.dataset.campo; if (!campo) return;
    if (e.target.value === NUEVA) return;
    const p = estado.productos.find((x) => x.id === e.target.closest("tr").dataset.id);
    if (!p) return;
    p[campo] = e.target.value;
    guardar();
  });
  cuerpo.addEventListener("change", (e) => {
    if (e.target.dataset.campo !== "categoria") return;
    if (e.target.value === NUEVA) return nuevaCategoria(e.target.closest("tr").dataset.id);
    pintar();
  });
  cuerpo.addEventListener("click", (e) => {
    const b = e.target.closest("[data-borrar]"); if (!b) return;
    const p = estado.productos.find((x) => x.id === b.dataset.borrar);
    if (p && confirm(`¿Eliminar "${p.nombre || "este producto"}"?`)) {
      estado.productos = estado.productos.filter((x) => x.id !== p.id);
      guardar(); pintar();
    }
  });

  $("btnAgregar").addEventListener("click", () => {
    const cat = categoriaActiva !== TODAS ? categoriaActiva : estado.categorias[0];
    if (!cat) return aviso("Primero creá una categoría.");
    const nuevo = { id: uid(), categoria: cat, nombre: "", sub: "", mayorista: "", minorista: "", nota: "", unidad: window.unidadPorDefecto(cat, "") };
    // insertar al final de su categoría
    let idx = -1;
    estado.productos.forEach((p, i) => { if (p.categoria === cat) idx = i; });
    estado.productos.splice(idx + 1, 0, nuevo);
    busqueda = ""; $("buscar").value = "";
    guardar(); pintar();
    const input = cuerpo.querySelector(`tr[data-id="${nuevo.id}"] input`);
    if (input) { input.scrollIntoView({ block: "center" }); input.focus(); }
  });

  // ---------- Menú ----------
  $("btnMenu").addEventListener("click", (e) => { e.stopPropagation(); $("menu").hidden = !$("menu").hidden; });
  document.addEventListener("click", () => ($("menu").hidden = true));
  $("menu").addEventListener("click", (e) => {
    const a = e.target.dataset.accion; if (!a) return;
    $("menu").hidden = true;
    if (!esAdmin()) return;
    ({ salir: salirAdmin, porcentaje, categorias: dialogoCategorias, imprimir: () => window.print(), csv: descargarCSV,
       respaldo: descargarRespaldo, restaurar: () => $("archivoRespaldo").click(), reiniciar })[a]();
  });

  // ---------- Ajuste por porcentaje ----------
  function porcentaje() {
    dlg.innerHTML = `<h2>Ajustar precios por %</h2>
      <label>Porcentaje (usá negativo para bajar, ej: -5)</label>
      <input id="pct" type="number" step="0.1" placeholder="Ej: 10">
      <label>Aplicar a</label>
      <select id="pctCat"><option value="${TODAS}">Todas las categorías</option>${estado.categorias.map((c) => `<option ${c === categoriaActiva ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <label>Columna</label>
      <select id="pctCol"><option value="ambas">Mayorista y Minorista</option><option value="mayorista">Solo Mayorista</option><option value="minorista">Solo Minorista</option></select>
      <label>Redondear a</label>
      <select id="pctRed"><option value="10">Múltiplo de $10</option><option value="50">Múltiplo de $50</option><option value="1">Sin redondear</option></select>
      <p style="font-size:.85rem;color:#6b7280">Solo cambia precios que sean un número. Los textos como "1200 x 100" se ajustan en su primer número.</p>
      <div class="pie"><button class="btn" id="pctNo">Cancelar</button><button class="btn primario" id="pctSi">Aplicar</button></div>`;
    dlg.showModal();
    $("pctNo").onclick = () => dlg.close();
    $("pctSi").onclick = () => {
      const pct = parseFloat($("pct").value);
      if (!isFinite(pct) || pct === 0) return aviso("Escribí un porcentaje.");
      const cat = $("pctCat").value, col = $("pctCol").value, red = Number($("pctRed").value);
      const ajustar = (v) => String(v ?? "").replace(/^\d+([.,]\d+)?/, (n) => {
        const nuevo = Number(n.replace(",", ".")) * (1 + pct / 100);
        return String(Math.round(nuevo / red) * red);
      });
      let cambios = 0;
      estado.productos.forEach((p) => {
        if (cat !== TODAS && p.categoria !== cat) return;
        ["mayorista", "minorista"].forEach((k) => {
          if (col !== "ambas" && col !== k) return;
          const n = ajustar(p[k]); if (n !== p[k]) { p[k] = n; cambios++; }
        });
      });
      guardar(); pintar(); dlg.close(); aviso(`${cambios} precios actualizados.`);
    };
  }

  // ---------- Categorías ----------
  function dialogoCategorias() {
    const copia = estado.categorias.map((c) => ({ original: c, nombre: c }));
    const dibujar = () => {
      dlg.innerHTML = `<h2>Categorías</h2>
        <div id="lista">${copia.map((c, i) => `<div class="cat-item"><input data-i="${i}" value="${esc(c.nombre)}">
          <button class="btn-fila" data-sube="${i}" title="Subir">⬆️</button>
          <button class="btn-fila borrar" data-borra="${i}" title="Eliminar">🗑️</button></div>`).join("")}</div>
        <button class="btn" id="catNueva">➕ Nueva categoría</button>
        <div class="pie"><button class="btn" id="catNo">Cancelar</button><button class="btn primario" id="catSi">Guardar</button></div>`;
      $("catNo").onclick = () => dlg.close();
      $("catNueva").onclick = () => { copia.push({ original: null, nombre: "" }); dibujar(); dlg.querySelector(".cat-item:last-child input").focus(); };
      $("catSi").onclick = guardarCategorias;
    };
    dlg.addEventListener("input", (e) => { if (e.target.dataset.i) copia[e.target.dataset.i].nombre = e.target.value; });
    dlg.onclick = (e) => {
      const s = e.target.closest("[data-sube]"), b = e.target.closest("[data-borra]");
      if (s) { const i = +s.dataset.sube; if (i > 0) { [copia[i - 1], copia[i]] = [copia[i], copia[i - 1]]; dibujar(); } }
      if (b) {
        const c = copia[+b.dataset.borra];
        const n = estado.productos.filter((p) => p.categoria === c.original).length;
        if (n && !confirm(`"${c.nombre}" tiene ${n} productos. Si la eliminás, también se eliminan. ¿Seguro?`)) return;
        copia.splice(+b.dataset.borra, 1); dibujar();
      }
    };
    function guardarCategorias() {
      const nombres = copia.map((c) => c.nombre.trim());
      if (nombres.some((n) => !n)) return aviso("Hay categorías sin nombre.");
      if (new Set(nombres.map(sinAcentos)).size !== nombres.length) return aviso("Hay categorías repetidas.");
      const vivas = new Set(copia.map((c) => c.original).filter(Boolean));
      estado.productos = estado.productos.filter((p) => vivas.has(p.categoria));
      copia.forEach((c) => {
        if (c.original && c.original !== c.nombre.trim()) {
          estado.productos.forEach((p) => { if (p.categoria === c.original) p.categoria = c.nombre.trim(); });
          if (categoriaActiva === c.original) categoriaActiva = c.nombre.trim();
        }
      });
      estado.categorias = nombres;
      if (categoriaActiva !== TODAS && !nombres.includes(categoriaActiva)) categoriaActiva = TODAS;
      guardar(); pintar(); dlg.close(); aviso("Categorías guardadas.");
    }
    dibujar(); dlg.showModal();
  }

  // ---------- Exportar / respaldo ----------
  function descargar(nombre, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement("a"); a.href = url; a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function fechaArchivo() { return new Date().toISOString().slice(0, 10); }
  function descargarCSV() {
    const celda = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const filas = [["Categoría", "Producto", "Sub descripción", "Mayorista", "Minorista", "Unidad", "Comentario"]];
    estado.productos.forEach((p) => filas.push([p.categoria, p.nombre, p.sub, p.mayorista, p.minorista, p.unidad, p.nota]));
    descargar(`lista-precios-${fechaArchivo()}.csv`, "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  }
  function descargarRespaldo() {
    descargar(`respaldo-lista-${fechaArchivo()}.json`, JSON.stringify(estado, null, 2), "application/json");
    aviso("Copia de seguridad descargada.");
  }
  $("archivoRespaldo").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const datos = JSON.parse(await f.text());
      if (!Array.isArray(datos.categorias) || !Array.isArray(datos.productos)) throw new Error();
      if (!confirm("Esto reemplaza la lista actual por la de la copia. ¿Continuar?")) return;
      estado = completarUnidades(datos); categoriaActiva = TODAS; guardar(); pintar(); aviso("Copia restaurada.");
    } catch { aviso("El archivo no es una copia de seguridad válida."); }
  });
  function reiniciar() {
    if (!confirm("Esto borra TODOS los cambios y vuelve al catálogo original del cuaderno. ¿Seguro?")) return;
    estado = semilla(); categoriaActiva = TODAS; guardar(); pintar(); aviso("Catálogo original restaurado.");
  }

  aplicarAdmin();
  pintar();
})();
