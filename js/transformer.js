import { segmentsToCamelVariable } from "./utils.js";

/**
 * @param {unknown} obj
 * @param {string[]} pathSeg
 * @returns {{ path: string, value: string }[]}
 */
export function findIdFields(obj, pathSeg = []) {
  /** @type {{ path: string, value: string }[]} */
  const out = [];

  if (obj === null || obj === undefined) return out;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      out.push(...findIdFields(item, [...pathSeg, String(i)]));
    });
    return out;
  }

  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const nextPath = [...pathSeg, key];

      if (key === "id" && typeof val === "string" && val.length > 0) {
        out.push({
          path: nextPath.join("."),
          value: val,
        });
      } else {
        out.push(...findIdFields(val, nextPath));
      }
    }
  }

  return out;
}

/**
 * path: "branchDocumentSeries.id" → branchDocumentSeriesId
 * @param {string} fullPath
 */
export function generateVariableName(fullPath) {
  const segs = fullPath.split(".");
  if (segs.length < 2 || segs[segs.length - 1] !== "id") {
    const base = segmentsToCamelVariable(segs);
    return base ? `${base}Id` : "rootId";
  }
  const parentSegs = segs.slice(0, -1);
  if (parentSegs.length === 0) {
    return "rootId";
  }
  const base = segmentsToCamelVariable(parentSegs);
  return base ? `${base}Id` : "rootId";
}

/**
 * @param {string[]} baseNames
 * @returns {string[]}
 */
export function assignUniqueNames(baseNames) {
  const seen = new Map();
  return baseNames.map((base) => {
    if (!seen.has(base)) {
      seen.set(base, 1);
      return base;
    }
    let n = 2;
    let candidate = `${base}${n}`;
    while (seen.has(candidate)) {
      n++;
      candidate = `${base}${n}`;
    }
    seen.set(candidate, 1);
    return candidate;
  });
}

/**
 * @param {{ path: string, value: string }[]} found
 */
export function buildDetectedFields(found) {
  const suggested = found.map((f) => generateVariableName(f.path));
  const unique = assignUniqueNames(suggested);
  return found.map((f, i) => ({
    path: f.path,
    value: f.value,
    variableName: unique[i],
    enabled: true,
  }));
}

/**
 * Aynı değere sahip satırları, ilk görülen değişken adına hizala.
 * @param {{ path: string, value: string, variableName: string, enabled: boolean }[]} rows
 */
export function mergeRowsByValue(rows) {
  /** @type {Map<string, string>} */
  const firstNameByValue = new Map();
  for (const r of rows) {
    if (!firstNameByValue.has(r.value)) {
      firstNameByValue.set(r.value, r.variableName);
    }
  }
  return rows.map((r) => ({
    ...r,
    variableName: firstNameByValue.get(r.value) ?? r.variableName,
  }));
}

/**
 * @param {unknown} obj
 * @param {string} dotPath
 * @param {unknown} newVal
 */
function setByPath(obj, dotPath, newVal) {
  const segs = dotPath.split(".");
  if (!segs.length) return;
  /** @type {unknown} */
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (cur === null || typeof cur !== "object") return;
    const next = /** @type {Record<string, unknown>} */ (cur)[s];
    if (next === undefined) return;
    cur = next;
  }
  const last = segs[segs.length - 1];
  if (cur !== null && typeof cur === "object" && last in /** @type {object} */ (cur)) {
    /** @type {Record<string, unknown>} */ (cur)[last] = newVal;
  }
}

/**
 * @param {string} name
 * @param {string} [prefix]
 */
export function applyPrefixToName(name, prefix) {
  const p = (prefix || "").trim();
  if (!p) return name;
  const clean = p.replace(/[^a-zA-Z0-9]/g, "");
  if (!clean) return name;
  return clean.charAt(0).toLowerCase() + clean.slice(1) + name.charAt(0).toUpperCase() + name.slice(1);
}

/** @typedef {'handlebars' | 'dollar' | 'brackets'} PlaceholderFormat */

/**
 * @param {string} name
 * @param {PlaceholderFormat} format
 * @param {string} [prefix]
 */
export function formatVariablePlaceholder(name, format, prefix = "") {
  const n = applyPrefixToName(name, prefix);
  if (format === "handlebars") return `{{${n}}}`;
  if (format === "brackets") return `[[${n}]]`;
  return `\${${n}}`;
}

/**
 * @param {unknown} data
 * @param {{ path: string, variableName: string, enabled: boolean }[]} rules
 * @param {PlaceholderFormat} format
 * @param {string} [prefix]
 */
export function replaceIdsWithVariables(data, rules, format = "handlebars", prefix = "") {
  const clone = structuredClone(data);
  for (const r of rules) {
    if (!r.enabled) continue;
    setByPath(clone, r.path, formatVariablePlaceholder(r.variableName, format, prefix));
  }
  return clone;
}

/**
 * @param {{ path: string, value: string, variableName: string, enabled: boolean }[]} rules
 * @param {string} [prefix]
 */
export function buildEnvObject(rules, prefix = "") {
  /** @type {Record<string, string>} */
  const env = {};
  /** @type {Map<string, string>} */
  const valueByKey = new Map();

  for (const r of rules) {
    if (!r.enabled) continue;
    const key = applyPrefixToName(r.variableName, prefix);
    if (valueByKey.has(key)) continue;
    valueByKey.set(key, r.value);
    env[key] = r.value;
  }
  return env;
}
