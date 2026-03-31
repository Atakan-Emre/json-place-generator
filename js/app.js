import { parseInput } from "./parser.js";
import {
  findIdFields,
  buildDetectedFields,
  mergeRowsByValue,
  replaceIdsWithVariables,
  buildEnvObject,
  applyPrefixToName,
  formatVariablePlaceholder,
} from "./transformer.js";
import { copyText, downloadFile } from "./utils.js";

/** @typedef {{ path: string, value: string, variableName: string, enabled: boolean }} DetectedFieldRow */

const el = {
  rawInput: /** @type {HTMLTextAreaElement} */ (document.getElementById("raw-input")),
  inputType: /** @type {HTMLSelectElement} */ (document.getElementById("input-type")),
  btnParse: document.getElementById("btn-parse"),
  btnRefresh: /** @type {HTMLButtonElement} */ (document.getElementById("btn-refresh")),
  parseStatus: document.getElementById("parse-status"),
  placeholderFmt: /** @type {HTMLSelectElement} */ (document.getElementById("placeholder-fmt")),
  varPrefix: /** @type {HTMLInputElement} */ (document.getElementById("var-prefix")),
  chkMerge: /** @type {HTMLInputElement} */ (document.getElementById("chk-merge-values")),
  varTbody: /** @type {HTMLTableSectionElement} */ (document.getElementById("var-tbody")),
  varCount: document.getElementById("var-count"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".tab-panel"),
  outJson: document.getElementById("out-json"),
  outEnv: document.getElementById("out-env"),
  outScript: document.getElementById("out-script"),
  outDotenv: document.getElementById("out-dotenv"),
  outCsv: document.getElementById("out-csv"),
  xrayOut: document.getElementById("xray-out"),
  btnCopy: document.getElementById("btn-copy-out"),
  btnDl: document.getElementById("btn-dl-out"),
};

const CLIPBOARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

const THEME_STORAGE_KEY = "jpg-theme";

const ICON_SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>`;

const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

/** @type {{ parsedJson: unknown | null, rows: DetectedFieldRow[] }} */
const state = {
  parsedJson: null,
  rows: [],
};

let activeTab = "json";

function setStatus(msg, kind = "neutral") {
  el.parseStatus.textContent = msg;
  el.parseStatus.className = "status";
  if (kind === "err") el.parseStatus.classList.add("status--err");
  if (kind === "ok") el.parseStatus.classList.add("status--ok");
}

function getInputType() {
  return /** @type {'auto' | 'curl' | 'json'} */ (el.inputType.value);
}

function getPlaceholderFormat() {
  const v = el.placeholderFmt.value;
  if (v === "dollar") return "dollar";
  if (v === "brackets") return "brackets";
  return "handlebars";
}

function getPrefix() {
  return el.varPrefix.value.trim();
}

function renderTable() {
  el.varTbody.innerHTML = "";
  if (!state.rows.length) {
    const tr = document.createElement("tr");
    tr.className = "placeholder-row";
    tr.innerHTML = `<td colspan="4">Parse sonrası satırlar burada listelenir.</td>`;
    el.varTbody.appendChild(tr);
    el.varCount.textContent = "0";
    return;
  }

  el.varCount.textContent = String(state.rows.length);

  state.rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(idx);

    const tdOn = document.createElement("td");
    tdOn.className = "col-on";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = row.enabled;
    cb.addEventListener("change", () => {
      state.rows[idx].enabled = cb.checked;
      refreshOutputs();
    });
    tdOn.appendChild(cb);

    const tdPath = document.createElement("td");
    tdPath.textContent = row.path;

    const tdVal = document.createElement("td");
    tdVal.className = "value-cell";
    tdVal.title = row.value;
    tdVal.textContent = row.value;

    const tdVar = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = row.variableName;
    inp.addEventListener("input", () => {
      state.rows[idx].variableName = inp.value.trim() || row.variableName;
      refreshOutputs();
    });
    tdVar.appendChild(inp);

    tr.append(tdOn, tdPath, tdVal, tdVar);
    el.varTbody.appendChild(tr);
  });
}

function postMergeRows() {
  let rows = structuredClone(state.rows);
  if (el.chkMerge.checked) {
    rows = mergeRowsByValue(rows);
  }
  return rows;
}

/**
 * @param {DetectedFieldRow[]} rows
 * @param {string} prefix
 */
function xrayRowsForDisplay(rows, prefix) {
  const seen = new Set();
  /** @type {{ name: string, value: string }[]} */
  const out = [];
  for (const r of rows) {
    if (!r.enabled) continue;
    const nm = applyPrefixToName(r.variableName, prefix);
    const key = `${nm}\0${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: nm, value: r.value });
  }
  return out;
}

/**
 * @param {{ name: string, value: string }[]} items
 * @param {'handlebars' | 'dollar' | 'brackets'} fmt
 * @param {string} prefix
 */
function buildXrayPlainText(items, fmt, prefix) {
  return items
    .map((i) => {
      const ph = formatVariablePlaceholder(i.name, fmt, prefix);
      return `${ph}\t${i.value}`;
    })
    .join("\n");
}

/**
 * @param {string} text
 * @param {string} label
 */
function makeCopyIconButton(text, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn-icon";
  b.setAttribute("aria-label", label);
  b.innerHTML = CLIPBOARD_SVG;
  b.addEventListener("click", async () => {
    const ok = await copyText(text);
    setStatus(ok ? `${label}: panoya kopyalandı.` : "Kopyalama başarısız.", ok ? "ok" : "err");
  });
  return b;
}

/**
 * @param {{ name: string, value: string }[]} items
 * @param {'handlebars' | 'dollar' | 'brackets'} fmt
 * @param {string} prefix
 */
function renderXrayPanel(items, fmt, prefix) {
  const wrap = el.xrayOut;
  if (!wrap) return;
  wrap.replaceChildren();
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "xray-placeholder";
    p.textContent = "Açık satır yok veya henüz id bulunamadı.";
    wrap.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  table.className = "xray-table";
  table.innerHTML =
    "<thead><tr><th>Değişken (Placeholder ile aynı)</th><th>ID</th></tr></thead>";
  const tbody = document.createElement("tbody");

  for (const item of items) {
    const tr = document.createElement("tr");
    const ph = formatVariablePlaceholder(item.name, fmt, prefix);
    const labelShort =
      fmt === "brackets"
        ? `[[${item.name}]]`
        : fmt === "dollar"
          ? "${" + item.name + "}"
          : `{{${item.name}}}`;

    const tdVar = document.createElement("td");
    const line = document.createElement("div");
    line.className = "xray-line";
    const code = document.createElement("code");
    code.textContent = ph;
    line.append(
      code,
      makeCopyIconButton(ph, `${labelShort} kopyala`)
    );
    tdVar.append(line);

    const tdId = document.createElement("td");
    tdId.className = "xray-id-cell";
    const span = document.createElement("span");
    span.className = "xray-id-val";
    span.textContent = item.value;
    tdId.append(
      span,
      makeCopyIconButton(item.value, `ID (${item.name}) kopyala`)
    );

    tr.append(tdVar, tdId);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
}

function refreshOutputs() {
  if (!state.parsedJson) {
    clearOutputs("Önce Parse çalıştırın.");
    return;
  }

  const rows = postMergeRows();
  const fmt = getPlaceholderFormat();
  const prefix = getPrefix();

  const transformed = replaceIdsWithVariables(state.parsedJson, rows, fmt, prefix);
  const env = buildEnvObject(rows, prefix);

  const jsonStr = JSON.stringify(transformed, null, 2);
  const envStr = JSON.stringify(env, null, 2);

  const keys = Object.keys(env);
  const script = keys
    .map((k) => `pm.environment.set(${JSON.stringify(k)}, ${JSON.stringify(env[k])});`)
    .join("\n");

  const dotenv = keys.map((k) => `${k}=${env[k]}`).join("\n");

  const csv = ["key,value", ...keys.map((k) => `${escapeCsv(k)},${escapeCsv(env[k])}`)].join(
    "\n"
  );

  el.outJson.textContent = jsonStr;
  el.outEnv.textContent = envStr;
  el.outScript.textContent = script || "// env boş";
  el.outDotenv.textContent = dotenv || "# env boş";
  el.outCsv.textContent = csv;

  const xrayItems = xrayRowsForDisplay(rows, prefix);
  renderXrayPanel(xrayItems, fmt, prefix);

  el.btnRefresh.disabled = false;
}

function escapeCsv(v) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function clearOutputs(msg = "") {
  el.outJson.textContent = msg;
  el.outEnv.textContent = msg;
  el.outScript.textContent = msg;
  el.outDotenv.textContent = msg;
  el.outCsv.textContent = msg;
  if (el.xrayOut) {
    el.xrayOut.replaceChildren();
    const p = document.createElement("p");
    p.className = "xray-placeholder";
    p.textContent = msg || "Önce Parse çalıştırın.";
    el.xrayOut.appendChild(p);
  }
}

function runParse() {
  const text = el.rawInput.value;
  const type = getInputType();

  try {
    const json = parseInput(text, type === "auto" ? "auto" : type);
    state.parsedJson = json;
    const found = findIdFields(json);
    state.rows = buildDetectedFields(found);
    setStatus(`${found.length} id alanı bulundu.`, "ok");
    renderTable();
    refreshOutputs();
  } catch (e) {
    state.parsedJson = null;
    state.rows = [];
    const m = e instanceof Error ? e.message : String(e);
    setStatus(m, "err");
    renderTable();
    clearOutputs("");
    el.btnRefresh.disabled = true;
  }
}

function switchTab(id) {
  activeTab = id;
  el.tabs.forEach((t) => {
    const on = t.getAttribute("data-tab") === id;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  el.panels.forEach((p) => {
    const pid = p.id.replace("panel-", "");
    const on = pid === id;
    p.classList.toggle("active", on);
    p.hidden = !on;
  });
}

function currentOutText() {
  switch (activeTab) {
    case "env":
      return el.outEnv.textContent || "";
    case "script":
      return el.outScript.textContent || "";
    case "dotenv":
      return el.outDotenv.textContent || "";
    case "csv":
      return el.outCsv.textContent || "";
    case "xray":
      if (!state.parsedJson) return "";
      return buildXrayPlainText(
        xrayRowsForDisplay(postMergeRows(), getPrefix()),
        getPlaceholderFormat(),
        getPrefix()
      );
    default:
      return el.outJson.textContent || "";
  }
}

function downloadName() {
  switch (activeTab) {
    case "env":
      return "env.json";
    case "script":
      return "postman-env-set.js";
    case "dotenv":
      return ".env.example";
    case "csv":
      return "env.csv";
    case "xray":
      return "place-list.txt";
    default:
      return "payload.json";
  }
}

el.btnParse.addEventListener("click", runParse);
el.btnRefresh.addEventListener("click", () => {
  renderTable();
  refreshOutputs();
});

el.placeholderFmt.addEventListener("change", refreshOutputs);
el.varPrefix.addEventListener("input", refreshOutputs);
el.chkMerge.addEventListener("change", () => {
  refreshOutputs();
});

el.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const id = tab.getAttribute("data-tab");
    if (id) switchTab(id);
  });
});

el.btnCopy.addEventListener("click", async () => {
  const ok = await copyText(currentOutText());
  setStatus(ok ? "Panoya kopyalandı." : "Kopyalama başarısız.", ok ? "ok" : "err");
});

el.btnDl?.addEventListener("click", () => {
  const name = downloadName();
  const body = currentOutText();
  const mime =
    name.endsWith(".json") || name.endsWith("payload.json")
      ? "application/json;charset=utf-8"
      : "text/plain;charset=utf-8";
  downloadFile(name, body, mime);
});

function initThemeSwitch() {
  const root = document.documentElement;
  const btn = document.getElementById("btn-theme");
  const iconEl = btn?.querySelector(".btn-theme__icon");
  const labelEl = btn?.querySelector(".btn-theme__label");
  if (!btn || !iconEl || !labelEl) return;

  function sync() {
    const dark = root.getAttribute("data-theme") !== "light";
    iconEl.innerHTML = dark ? ICON_SUN : ICON_MOON;
    labelEl.textContent = dark ? "Gündüz" : "Gece";
    const hint = dark ? "Açık temaya geç" : "Koyu temaya geç";
    btn.title = hint;
    btn.setAttribute("aria-label", hint);
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
  }

  btn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (_) {
      /* ignore */
    }
    sync();
  });

  sync();
}

initThemeSwitch();

clearOutputs("");
