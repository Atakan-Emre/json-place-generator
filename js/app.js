import { parseInput, parseCurlMetadata, detectInputType } from "./parser.js";
import {
  findIdFields,
  buildDetectedFields,
  mergeRowsByValue,
  replaceIdsWithVariables,
  buildEnvObject,
  applyPrefixToName,
  formatVariablePlaceholder,
  assignUniqueNames,
  idDetectOptionsFromStorage,
  idDetectOptionsToStorage,
} from "./transformer.js";
import { copyText, downloadFile, httpHeaderKeyToVarName, suggestUrlEnvName } from "./utils.js";
import { initWorkspaceLayout } from "./layout.js";

/** @typedef {{ path: string, value: string, variableName: string, enabled: boolean }} DetectedFieldRow */

/** @typedef {{ kind: 'url' | 'header', path: string, value: string, variableName: string, enabled: boolean, headerKey: string }} CurlMetaRow */

const el = {
  rawInput: /** @type {HTMLTextAreaElement} */ (document.getElementById("raw-input")),
  inputType: /** @type {HTMLSelectElement} */ (document.getElementById("input-type")),
  btnParse: document.getElementById("btn-parse"),
  btnRefresh: /** @type {HTMLButtonElement} */ (document.getElementById("btn-refresh")),
  parseStatus: document.getElementById("parse-status"),
  placeholderFmt: /** @type {HTMLSelectElement} */ (document.getElementById("placeholder-fmt")),
  varPrefix: /** @type {HTMLInputElement} */ (document.getElementById("var-prefix")),
  chkMerge: /** @type {HTMLInputElement} */ (document.getElementById("chk-merge-values")),
  chkIdDefaults: /** @type {HTMLInputElement | null} */ (document.getElementById("chk-id-defaults")),
  idExtraKeys: /** @type {HTMLTextAreaElement | null} */ (document.getElementById("id-extra-keys")),
  chkCurlMeta: /** @type {HTMLInputElement | null} */ (document.getElementById("chk-curl-meta")),
  curlMetaBlock: document.getElementById("curl-meta-block"),
  curlVarsSection: document.getElementById("curl-vars-section"),
  curlVarTbody: /** @type {HTMLTableSectionElement | null} */ (document.getElementById("curl-var-tbody")),
  curlVarCount: document.getElementById("curl-var-count"),
  varTbody: /** @type {HTMLTableSectionElement} */ (document.getElementById("var-tbody")),
  varCount: document.getElementById("var-count"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".tab-panel"),
  outJson: document.getElementById("out-json"),
  outCurl: document.getElementById("out-curl"),
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
const ID_DETECT_STORAGE_KEY = "jpg-id-detect";

const ICON_SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>`;

const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

/** @type {{ parsedJson: unknown | null, rows: DetectedFieldRow[], curlMeta: { method: string, url: string, headers: { key: string, value: string }[], hasLocation: boolean } | null, curlRows: CurlMetaRow[] }} */
const state = {
  parsedJson: null,
  rows: [],
  curlMeta: null,
  curlRows: [],
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

/** @returns {import("./transformer.js").IdDetectOptions} */
function getIdDetectOptions() {
  const useDefaultPatterns = el.chkIdDefaults?.checked !== false;
  const lines = el.idExtraKeys?.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) ?? [];
  return {
    useDefaultPatterns,
    extraLeafKeys: new Set(lines),
  };
}

function saveIdDetectSettings() {
  try {
    localStorage.setItem(ID_DETECT_STORAGE_KEY, JSON.stringify(idDetectOptionsToStorage(getIdDetectOptions())));
  } catch {
    /* ignore */
  }
}

function loadIdDetectSettings() {
  try {
    const raw = localStorage.getItem(ID_DETECT_STORAGE_KEY);
    if (!raw || !el.chkIdDefaults || !el.idExtraKeys) return;
    const o = idDetectOptionsFromStorage(JSON.parse(raw));
    el.chkIdDefaults.checked = o.useDefaultPatterns;
    el.idExtraKeys.value = [...o.extraLeafKeys].join("\n");
  } catch {
    /* ignore */
  }
}

function statusForIdCount(n, curlHint) {
  if (n === 0) return `id alanı tespit edilmedi${curlHint}.`;
  if (n === 1) return `1 id alanı tespit edildi${curlHint}.`;
  return `${n} id alanı tespit edildi${curlHint}.`;
}

function reapplyIdDetection() {
  if (!state.parsedJson) return;
  const opts = getIdDetectOptions();
  const found = findIdFields(state.parsedJson, [], opts);
  state.rows = buildDetectedFields(found, opts);
  const curlHint = state.curlMeta ? ` · ${state.curlMeta.headers.length} header` : "";
  setStatus(statusForIdCount(found.length, curlHint), "ok");
  renderTable();
  refreshOutputs();
}

/**
 * @param {NonNullable<typeof state.curlMeta>} meta
 * @returns {CurlMetaRow[]}
 */
function buildCurlMetaRows(meta) {
  if (!meta.url && meta.headers.length === 0) return [];
  /** @type {{ kind: 'url' | 'header', path: string, headerKey: string, value: string }[]} */
  const items = [];
  if (meta.url) {
    items.push({ kind: "url", path: "curl.url", headerKey: "", value: meta.url });
  }
  for (const h of meta.headers) {
    items.push({
      kind: "header",
      path: `curl.header.${h.key}`,
      headerKey: h.key,
      value: h.value,
    });
  }
  const names = items.map((it) =>
    it.kind === "url" ? suggestUrlEnvName(meta.url) : httpHeaderKeyToVarName(it.headerKey)
  );
  const unique = assignUniqueNames(names);
  return items.map((it, i) => ({
    kind: it.kind,
    path: it.path,
    value: it.value,
    variableName: unique[i],
    enabled: true,
    headerKey: it.headerKey,
  }));
}

/** @param {string} s */
function shellSingleQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {CurlMetaRow | undefined} row
 * @param {string} literal
 */
function displayCurlField(row, literal, fmt, prefix) {
  if (!el.chkCurlMeta?.checked || !row?.enabled) return literal;
  return formatVariablePlaceholder(row.variableName, fmt, prefix);
}

function buildCurlCommand() {
  const meta = state.curlMeta;
  if (!meta || state.parsedJson == null) return "";
  const fmt = getPlaceholderFormat();
  const prefix = getPrefix();
  const rows = postMergeRows();
  const bodyObj = replaceIdsWithVariables(state.parsedJson, rows, fmt, prefix);
  const bodyStr = JSON.stringify(bodyObj, null, 2);

  const urlRow = state.curlRows.find((r) => r.kind === "url");
  const urlDisp = urlRow
    ? displayCurlField(urlRow, meta.url, fmt, prefix)
    : meta.url;

  const startParts = [];
  if (meta.hasLocation) startParts.push("curl --location");
  else startParts.push("curl");
  startParts.push(`--request ${meta.method}`);
  startParts.push(shellSingleQuote(urlDisp));
  const firstLine = `${startParts.join(" ")} \\`;

  /** @type {string[]} */
  const out = [firstLine];
  for (const h of meta.headers) {
    const row = state.curlRows.find((r) => r.kind === "header" && r.headerKey === h.key);
    const valDisp = row ? displayCurlField(row, h.value, fmt, prefix) : h.value;
    out.push(`  --header ${shellSingleQuote(`${h.key}: ${valDisp}`)} \\`);
  }
  out.push(`  --data-raw ${shellSingleQuote(bodyStr)}`);
  return out.join("\n");
}

function syncCurlMetaUi() {
  const hasCurl =
    state.curlMeta != null && !!(state.curlMeta.url || state.curlMeta.headers.length);
  if (el.curlMetaBlock) el.curlMetaBlock.hidden = !hasCurl;
  if (el.curlVarsSection) el.curlVarsSection.hidden = state.curlRows.length === 0;
}

function renderCurlTable() {
  const tb = el.curlVarTbody;
  if (!tb) return;
  tb.innerHTML = "";
  if (!state.curlRows.length) {
    const tr = document.createElement("tr");
    tr.className = "placeholder-row";
    tr.innerHTML = `<td colspan="4">cURL parse sonrası satırlar.</td>`;
    tb.appendChild(tr);
    if (el.curlVarCount) el.curlVarCount.textContent = "0";
    syncCurlMetaUi();
    return;
  }
  if (el.curlVarCount) el.curlVarCount.textContent = String(state.curlRows.length);

  state.curlRows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    const tdOn = document.createElement("td");
    tdOn.className = "col-on";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = row.enabled;
    cb.addEventListener("change", () => {
      state.curlRows[idx].enabled = cb.checked;
      refreshOutputs();
    });
    tdOn.appendChild(cb);

    const tdAlan = document.createElement("td");
    tdAlan.textContent = row.kind === "url" ? "URL" : `header: ${row.headerKey}`;

    const tdVal = document.createElement("td");
    tdVal.className = "value-cell";
    tdVal.title = row.value;
    tdVal.textContent = row.value;

    const tdVar = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = row.variableName;
    inp.addEventListener("input", () => {
      state.curlRows[idx].variableName = inp.value.trim() || row.variableName;
      refreshOutputs();
    });
    tdVar.appendChild(inp);

    tr.append(tdOn, tdAlan, tdVal, tdVar);
    tb.appendChild(tr);
  });
  syncCurlMetaUi();
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
  renderCurlTable();
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
  /** @type {{ name: string, value: string, alan: string }[]} */
  const out = [];
  for (const r of rows) {
    if (!r.enabled) continue;
    const nm = applyPrefixToName(r.variableName, prefix);
    const key = `${nm}\0${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: nm, value: r.value, alan: r.path });
  }
  return out;
}

/**
 * @param {CurlMetaRow[]} curlRows
 * @param {string} prefix
 */
function curlRowsForPlaceDisplay(curlRows, prefix) {
  const seen = new Set();
  /** @type {{ name: string, value: string, alan: string }[]} */
  const out = [];
  for (const r of curlRows) {
    if (!r.enabled) continue;
    const nm = applyPrefixToName(r.variableName, prefix);
    const key = `${nm}\0${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const alan = r.kind === "url" ? "URL" : `header: ${r.headerKey}`;
    out.push({ name: nm, value: r.value, alan });
  }
  return out;
}

/**
 * @param {{ name: string, value: string, alan: string }[]} items
 * @param {'handlebars' | 'dollar' | 'brackets'} fmt
 * @param {string} prefix
 * @param {string} sectionTag
 */
function buildPlacePlainTextSection(items, fmt, prefix, sectionTag) {
  const body = items
    .map((i) => {
      const ph = formatVariablePlaceholder(i.name, fmt, prefix);
      return `${ph}\t${i.value}`;
    })
    .join("\n");
  if (!body) return "";
  return sectionTag ? `[${sectionTag}]\n${body}` : body;
}

/**
 * @param {{ name: string, value: string, alan: string }[]} curlItems
 * @param {{ name: string, value: string, alan: string }[]} idItems
 * @param {'handlebars' | 'dollar' | 'brackets'} fmt
 * @param {string} prefix
 */
function buildPlacePlainTextCombined(curlItems, idItems, fmt, prefix) {
  const parts = [];
  const c = buildPlacePlainTextSection(curlItems, fmt, prefix, "cURL — URL & header");
  if (c) parts.push(c);
  const j = buildPlacePlainTextSection(idItems, fmt, prefix, "JSON — id");
  if (j) parts.push(j);
  return parts.join("\n\n");
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
 * @param {{ name: string, value: string, alan: string }[]} entries
 * @param {'handlebars' | 'dollar' | 'brackets'} fmt
 * @param {string} prefix
 */
function appendPlaceSection(wrap, title, entries, fmt, prefix) {
  const section = document.createElement("div");
  section.className = "place-section";
  const h = document.createElement("h3");
  h.className = "place-section__title";
  h.textContent = title;
  section.appendChild(h);

  const table = document.createElement("table");
  table.className = "place-table";
  table.innerHTML =
    "<thead><tr><th class=\"place-col-alan\">Alan</th><th>Placeholder</th><th>Değer</th></tr></thead>";
  const tbody = document.createElement("tbody");

  for (const item of entries) {
    const tr = document.createElement("tr");
    const tdA = document.createElement("td");
    tdA.className = "place-col-alan";
    tdA.textContent = item.alan;

    const ph = formatVariablePlaceholder(item.name, fmt, prefix);
    const labelShort =
      fmt === "brackets"
        ? `[[${item.name}]]`
        : fmt === "dollar"
          ? "${" + item.name + "}"
          : `{{${item.name}}}`;

    const tdPh = document.createElement("td");
    const line = document.createElement("div");
    line.className = "xray-line";
    const code = document.createElement("code");
    code.textContent = ph;
    line.append(code, makeCopyIconButton(ph, `${labelShort} kopyala`));
    tdPh.appendChild(line);

    const tdVal = document.createElement("td");
    tdVal.className = "xray-id-cell";
    const span = document.createElement("span");
    span.className = "xray-id-val";
    span.textContent = item.value;
    tdVal.append(span, makeCopyIconButton(item.value, `${item.alan} — değer kopyala`));

    tr.append(tdA, tdPh, tdVal);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  section.appendChild(table);
  wrap.appendChild(section);
}

/**
 * @param {{ name: string, value: string, alan: string }[]} curlItems
 * @param {{ name: string, value: string, alan: string }[]} idItems
 * @param {'handlebars' | 'dollar' | 'brackets'} fmt
 * @param {string} prefix
 */
function renderXrayPanel(curlItems, idItems, fmt, prefix) {
  const wrap = el.xrayOut;
  if (!wrap) return;
  wrap.replaceChildren();
  if (!curlItems.length && !idItems.length) {
    const p = document.createElement("p");
    p.className = "xray-placeholder";
    p.textContent =
      "Açık satır yok. cURL satırları veya JSON id alanlarını etkinleştirin.";
    wrap.appendChild(p);
    return;
  }
  if (curlItems.length) {
    appendPlaceSection(wrap, "cURL — URL & header", curlItems, fmt, prefix);
  }
  if (idItems.length) {
    appendPlaceSection(wrap, "JSON — id", idItems, fmt, prefix);
  }
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

  /** @type {Record<string, string>} */
  let env = {};
  if (state.curlRows.length) {
    env = { ...buildEnvObject(state.curlRows, prefix) };
  }
  env = { ...env, ...buildEnvObject(rows, prefix) };

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

  const curlPlaceItems = curlRowsForPlaceDisplay(state.curlRows, prefix);
  const idPlaceItems = xrayRowsForDisplay(rows, prefix);
  renderXrayPanel(curlPlaceItems, idPlaceItems, fmt, prefix);

  if (el.outCurl) {
    if (!state.curlMeta) {
      el.outCurl.textContent =
        "Bu sekme yalnızca cURL girdisi parse edildiğinde doldurulur (Input: cURL veya otomatik).";
    } else {
      el.outCurl.textContent = buildCurlCommand();
    }
  }

  el.btnRefresh.disabled = false;
}

function escapeCsv(v) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function clearOutputs(msg = "") {
  el.outJson.textContent = msg;
  if (el.outCurl) el.outCurl.textContent = msg;
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
    const resolved = type === "auto" ? detectInputType(text) : type;
    let json;
    if (resolved === "curl") {
      state.curlMeta = parseCurlMetadata(text);
      state.curlRows = buildCurlMetaRows(state.curlMeta);
      json = parseInput(text, "curl");
    } else {
      state.curlMeta = null;
      state.curlRows = [];
      json = parseInput(text, type === "auto" ? "auto" : type);
    }
    state.parsedJson = json;
    const opts = getIdDetectOptions();
    const found = findIdFields(json, [], opts);
    state.rows = buildDetectedFields(found, opts);
    const curlHint = state.curlMeta ? ` · ${state.curlMeta.headers.length} header` : "";
    setStatus(statusForIdCount(found.length, curlHint), "ok");
    renderTable();
    refreshOutputs();
  } catch (e) {
    state.parsedJson = null;
    state.rows = [];
    state.curlMeta = null;
    state.curlRows = [];
    const m = e instanceof Error ? e.message : String(e);
    setStatus(m, "err");
    renderTable();
    clearOutputs("");
    syncCurlMetaUi();
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
    case "curl":
      return el.outCurl?.textContent || "";
    case "xray":
      if (!state.parsedJson) return "";
      return buildPlacePlainTextCombined(
        curlRowsForPlaceDisplay(state.curlRows, getPrefix()),
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
    case "curl":
      return "request.curl.sh";
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

el.chkIdDefaults?.addEventListener("change", () => {
  saveIdDetectSettings();
  reapplyIdDetection();
});

el.idExtraKeys?.addEventListener("input", () => {
  saveIdDetectSettings();
  reapplyIdDetection();
});

el.chkCurlMeta?.addEventListener("change", () => {
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

loadIdDetectSettings();

initWorkspaceLayout();

syncCurlMetaUi();
clearOutputs("");
