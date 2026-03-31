/**
 * Panel sırası (sürükle-bırak), genişlik (ara tutamak), daralt — localStorage
 */

const STORAGE_KEY = "jpg-workspace";
const PANEL_IDS = /** @type {const} */ (["input", "vars", "out"]);

/** @typedef {{ order: string[], flex: number[], collapsed: Record<string, boolean> }} LayoutState */

function defaultState() {
  return {
    order: [...PANEL_IDS],
    /** girdi · tespit · çıktı — çıktı daha geniş (uzun header/token satırları) */
    flex: [0.8, 0.9, 1.3],
    collapsed: {},
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const o = JSON.parse(raw);
    if (!Array.isArray(o.order) || !Array.isArray(o.flex)) return defaultState();
    const order = o.order.filter((/** @type {string} */ id) => PANEL_IDS.includes(id));
    if (order.length !== 3) return defaultState();
    const flex = o.flex.map(Number).map((n) =>
      Number.isFinite(n) && n > 0 ? Math.min(3, Math.max(0.25, n)) : 1
    );
    while (flex.length < 3) flex.push(1);
    return {
      order,
      flex: flex.slice(0, 3),
      collapsed: typeof o.collapsed === "object" && o.collapsed ? o.collapsed : {},
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** @param {HTMLElement} container */
function getColumns(container) {
  return /** @type {HTMLElement[]} */ ([...container.querySelectorAll(".workspace-col")]);
}

/** @param {HTMLElement} container */
function getResizers(container) {
  return /** @type {HTMLElement[]} */ ([...container.querySelectorAll(".panel-resizer")]);
}

/**
 * @param {HTMLElement} container
 * @param {string[]} order
 */
function rebuildDomOrder(container, order) {
  const cols = Object.fromEntries(
    getColumns(container)
      .map((c) => [c.dataset.panelId || "", c])
      .filter((x) => x[0])
  );
  const resizers = getResizers(container);
  if (resizers.length < 2) return;
  const r0 = resizers[0];
  const r1 = resizers[1];
  container.replaceChildren();
  order.forEach((id, i) => {
    const col = cols[id];
    if (col) container.appendChild(col);
    if (i < order.length - 1) {
      container.appendChild(i === 0 ? r0 : r1);
    }
  });
}

/**
 * @param {number[]} arr
 */
function normalizeFlex(arr) {
  const a = arr.slice(0, 3).map((x) => Math.max(0.25, x));
  const sum = a.reduce((s, x) => s + x, 0);
  const t = 3 / sum;
  return a.map((x) => Math.round(x * t * 1000) / 1000);
}

/**
 * @param {HTMLElement} container
 * @param {LayoutState} state
 */
function applyFlexFromOrder(container, state) {
  const nf = normalizeFlex(state.flex);
  state.flex = nf;
  state.order.forEach((id, i) => {
    const col = container.querySelector(`[data-panel-id="${id}"]`);
    const v = nf[i] ?? 1;
    if (col) col.style.setProperty("flex", `${v} 1 0%`);
  });
}

/**
 * @param {HTMLElement} container
 * @param {LayoutState} state
 */
function applyCollapsed(container, state) {
  getColumns(container).forEach((col) => {
    const id = col.dataset.panelId;
    if (!id) return;
    const on = !!state.collapsed[id];
    col.classList.toggle("is-collapsed", on);
    const btn = col.querySelector(".workspace-col__collapse");
    if (btn) {
      btn.setAttribute("aria-expanded", on ? "false" : "true");
      btn.title = on ? "Genişlet" : "Daralt";
    }
  });
}

/**
 * @param {HTMLElement} container
 * @param {LayoutState} state
 */
function applyAll(container, state) {
  rebuildDomOrder(container, state.order);
  applyFlexFromOrder(container, state);
  applyCollapsed(container, state);
}

/**
 * @param {HTMLElement} container
 */
export function initWorkspaceLayout() {
  const container = document.getElementById("workspace-panels");
  if (!container) return;

  let state = loadState();
  applyAll(container, state);

  getResizers(container).forEach((r, i) => {
    r.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const el = r;
      el.classList.add("is-active");
      const startX = e.clientX;
      const leftIdx = i;
      const rightIdx = i + 1;
      const startFlex = [...state.flex];

      function onMove(/** @type {MouseEvent} */ ev) {
        const dx = ev.clientX - startX;
        const w = container.getBoundingClientRect().width || 800;
        const deltaFlex = (dx / Math.max(w, 400)) * 3;
        let fl = startFlex[leftIdx] + deltaFlex;
        let fr = startFlex[rightIdx] - deltaFlex;
        if (fl < 0.25) {
          fr -= 0.25 - fl;
          fl = 0.25;
        }
        if (fr < 0.25) {
          fl -= 0.25 - fr;
          fr = 0.25;
        }
        const next = [...startFlex];
        next[leftIdx] = fl;
        next[rightIdx] = fr;
        state.flex = normalizeFlex(next);
        applyFlexFromOrder(container, state);
      }

      function onUp() {
        el.classList.remove("is-active");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        saveState(state);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });

  /** @type {string} */
  let dragFromId = "";

  container.addEventListener("dragstart", (e) => {
    if (!e.target || !(/** @type {HTMLElement} */ (e.target)).closest?.(".workspace-col__drag")) {
      return;
    }
    const col = /** @type {HTMLElement} */ (e.target).closest(".workspace-col");
    const id = col?.dataset?.panelId;
    if (!id) return;
    dragFromId = id;
    e.dataTransfer?.setData("text/plain", id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    col.classList.add("is-drag-source");
  });

  container.addEventListener("dragend", () => {
    if (dragFromId) {
      container
        .querySelector(`[data-panel-id="${dragFromId}"]`)
        ?.classList.remove("is-drag-source");
    }
    getColumns(container).forEach((c) => c.classList.remove("is-drop-target"));
    dragFromId = "";
  });

  container.addEventListener("dragover", (e) => {
    if (!dragFromId) return;
    const col = /** @type {HTMLElement | null} */ ((e.target instanceof Element ? e.target : null)?.closest?.(".workspace-col"));
    if (!col) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  });

  container.addEventListener("dragenter", (e) => {
    if (!dragFromId) return;
    getColumns(container).forEach((c) => c.classList.remove("is-drop-target"));
    const t = e.target;
    if (t instanceof Element) {
      const col = t.closest(".workspace-col");
      col?.classList.add("is-drop-target");
    }
  });

  container.addEventListener("dragleave", (e) => {
    const col = /** @type {HTMLElement | null} */ ((e.target instanceof Element ? e.target : null)?.closest?.(".workspace-col"));
    if (col && e.relatedTarget && !col.contains(/** @type {Node} */ (e.relatedTarget))) {
      col.classList.remove("is-drop-target");
    }
  });

  container.addEventListener("drop", (e) => {
    const col = /** @type {HTMLElement | null} */ ((e.target instanceof Element ? e.target : null)?.closest?.(".workspace-col"));
    if (!col || !dragFromId) return;
    e.preventDefault();
    col.classList.remove("is-drop-target");
    const fromId = e.dataTransfer?.getData("text/plain") || dragFromId;
    const toId = col.dataset.panelId || "";
    if (!fromId || fromId === toId) return;
    const ord = [...state.order];
    const iFrom = ord.indexOf(fromId);
    const iTo = ord.indexOf(toId);
    if (iFrom < 0 || iTo < 0) return;
    ord.splice(iFrom, 1);
    ord.splice(iTo, 0, fromId);
    const movedFlex = state.flex[iFrom];
    const nf = state.flex.filter((_, j) => j !== iFrom);
    nf.splice(iTo, 0, movedFlex);
    state.order = ord;
    state.flex = normalizeFlex(nf);
    applyAll(container, state);
    saveState(state);
  });

  container.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement | null} */ (
      e.target instanceof Element ? e.target.closest(".workspace-col__collapse") : null
    );
    if (!btn) return;
    const col = btn.closest(".workspace-col");
    const id = col?.dataset?.panelId;
    if (!id) return;
    state.collapsed[id] = !state.collapsed[id];
    applyCollapsed(container, state);
    saveState(state);
  });

  document.getElementById("layout-reset")?.addEventListener("click", () => {
    state = defaultState();
    applyAll(container, state);
    saveState(state);
  });
}
