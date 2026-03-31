import { segmentsToCamelVariable } from "./utils.js";

/** @typedef {{ useDefaultPatterns: boolean, extraLeafKeys: Set<string> }} IdDetectOptions */

/**
 * @param {IdDetectOptions | undefined} options
 * @returns {IdDetectOptions}
 */
function resolveIdOptions(options) {
  if (!options) {
    return { useDefaultPatterns: true, extraLeafKeys: new Set() };
  }
  const extra =
    options.extraLeafKeys instanceof Set
      ? options.extraLeafKeys
      : new Set(Array.isArray(options.extraLeafKeys) ? options.extraLeafKeys : []);
  return {
    useDefaultPatterns: options.useDefaultPatterns !== false,
    extraLeafKeys: extra,
  };
}

/**
 * @param {unknown} raw
 * @returns {IdDetectOptions}
 */
export function idDetectOptionsFromStorage(raw) {
  if (!raw || typeof raw !== "object") {
    return { useDefaultPatterns: true, extraLeafKeys: new Set() };
  }
  const o = /** @type {{ useDefaultPatterns?: boolean, extraLeafKeys?: unknown }} */ (raw);
  const keys = Array.isArray(o.extraLeafKeys)
    ? o.extraLeafKeys.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return {
    useDefaultPatterns: o.useDefaultPatterns !== false,
    extraLeafKeys: new Set(keys),
  };
}

/**
 * @param {IdDetectOptions} opts
 */
export function idDetectOptionsToStorage(opts) {
  const r = resolveIdOptions(opts);
  return {
    useDefaultPatterns: r.useDefaultPatterns,
    extraLeafKeys: [...r.extraLeafKeys],
  };
}

/**
 * @param {unknown} val
 */
function isIdScalarValue(val) {
  if (typeof val === "string" && val.length > 0) return true;
  if (typeof val === "number" && Number.isFinite(val)) return true;
  return false;
}

/**
 * @param {unknown} val
 */
function scalarToIdString(val) {
  if (typeof val === "string") return val;
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  return "";
}

/**
 * Varsayılan kalıplar: id, …Id, …_id — paid gibi yanlış pozitif yok.
 * @param {string} key
 */
export function matchesDefaultIdPattern(key) {
  if (key === "id") return true;
  if (key.length >= 3 && /[a-z0-9]Id$/.test(key)) return true;
  if (key.length > 3 && /_id$/i.test(key)) return true;
  return false;
}

/**
 * @param {string} key
 * @param {IdDetectOptions} opts
 */
export function isIdLeafKey(key, opts) {
  const o = resolveIdOptions(opts);
  if (o.extraLeafKeys.has(key)) return true;
  if (o.useDefaultPatterns && matchesDefaultIdPattern(key)) return true;
  return false;
}

/**
 * @param {string} seg
 */
function normalizeIdPathSegment(seg) {
  if (/_id$/i.test(seg) && seg.length > 3) {
    const stem = seg.slice(0, -3);
    if (!stem) return "id";
    return stem.charAt(0).toLowerCase() + stem.slice(1) + "Id";
  }
  return seg;
}

/**
 * @param {unknown} obj
 * @param {string[]} pathSeg
 * @param {IdDetectOptions} [options]
 * @returns {{ path: string, value: string }[]}
 */
export function findIdFields(obj, pathSeg = [], options) {
  const opts = resolveIdOptions(options);
  /** @type {{ path: string, value: string }[]} */
  const out = [];

  if (obj === null || obj === undefined) return out;

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      out.push(...findIdFields(item, [...pathSeg, String(i)], opts));
    });
    return out;
  }

  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const nextPath = [...pathSeg, key];

      if (isIdLeafKey(key, opts) && isIdScalarValue(val)) {
        out.push({
          path: nextPath.join("."),
          value: scalarToIdString(val),
        });
      } else {
        out.push(...findIdFields(val, nextPath, opts));
      }
    }
  }

  return out;
}

/**
 * path: "branchDocumentSeries.id" → branchDocumentSeriesId
 * "branchId" (yaprak anahtar) → branchId (çift Id üretmez)
 * @param {string} fullPath
 * @param {IdDetectOptions} [options]
 */
export function generateVariableName(fullPath, options) {
  const opts = resolveIdOptions(options);
  const segs = fullPath.split(".");
  const last = segs[segs.length - 1] ?? "";

  if (segs.length >= 2 && last === "id") {
    const parentSegs = segs.slice(0, -1);
    if (parentSegs.length === 0) return "rootId";
    const base = segmentsToCamelVariable(parentSegs);
    return base ? `${base}Id` : "rootId";
  }

  if (isIdLeafKey(last, opts)) {
    const norm = segs.map(normalizeIdPathSegment);
    const name = segmentsToCamelVariable(norm);
    return name || "rootId";
  }

  const base = segmentsToCamelVariable(segs);
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
 * @param {IdDetectOptions} [options]
 */
export function buildDetectedFields(found, options) {
  const opts = resolveIdOptions(options);
  const suggested = found.map((f) => generateVariableName(f.path, opts));
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
