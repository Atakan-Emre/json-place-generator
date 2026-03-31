/** @typedef {'auto' | 'curl' | 'json'} InputType */

/** @typedef {{ method: string, url: string, headers: { key: string, value: string }[], hasLocation: boolean }} CurlMeta */

/** @typedef {{ preBody: string, jsonString: string }} CurlSplitResult */

/** @param {string} text */
export function detectInputType(text) {
  const t = text.trimStart();
  const lower = t.slice(0, 1200).toLowerCase();
  if (
    lower.startsWith("curl ") ||
    /^[\s\S]{0,400}\bcurl\s+/i.test(t) ||
    /\s--data(-raw|-binary)?\s/.test(lower) ||
    /(^|[\s])-d\s+/.test(lower)
  ) {
    return "curl";
  }
  // Yapısal: URL + header + JSON gövde (bazen "curl" kelimesi olmadan export)
  if (
    /\bhttps?:\/\/[^\s'"`]+/i.test(t) &&
    /--header\b|\s-H\s+/i.test(t) &&
    /\{[\s\S]*\}/.test(t)
  ) {
    return "curl";
  }
  if (t.startsWith("{") || t.startsWith("[")) {
    return "json";
  }
  return "json";
}

/**
 * tırnak dışında kalan ilk JSON kökü { veya [ — gövde flag'i yokken yapısal ayrım
 * @param {string} text
 */
function findFirstStructuralJsonIndex(text) {
  let i = 0;
  let inSQ = false;
  let inDQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inSQ) {
      if (c === "\\" && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (c === "'") inSQ = false;
      i++;
      continue;
    }
    if (inDQ) {
      if (c === "\\" && i + 1 < text.length) {
        i += 2;
        continue;
      }
      if (c === '"') inDQ = false;
      i++;
      continue;
    }
    if (c === "'") {
      inSQ = true;
      i++;
      continue;
    }
    if (c === '"') {
      inDQ = true;
      i++;
      continue;
    }
    if (c === "{" || c === "[") {
      return i;
    }
    i++;
  }
  return -1;
}

/** @param {string} s @param {"'" | '"'} quote */
function extractQuotedString(s, quote) {
  let out = "";
  let i = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      out += s[i + 1];
      i += 2;
      continue;
    }
    if (c === quote) {
      break;
    }
    out += c;
    i++;
  }
  return out.trim();
}

/** @param {string} s */
function extractBalancedJson(s) {
  const open = s[0];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let strQuote = "";
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === strQuote) {
        inStr = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strQuote = c;
      continue;
    }
    if (c === open) depth++;
    if (c === close) {
      depth--;
      if (depth === 0) {
        return s.slice(0, i + 1);
      }
    }
  }
  return s.trim();
}

/**
 * @param {string} text
 * @returns {{ preBody: string, jsonString: string } | null}
 */
function tryExtractJsonAfterDataFlag(text) {
  const patterns = [
    /--data-raw\s+/gi,
    /--data-binary\s+/gi,
    /--data\s+/gi,
    /\s-d\s+/gi,
  ];

  let flagIndex = -1;
  let payloadStart = -1;

  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m && (flagIndex < 0 || m.index < flagIndex)) {
      flagIndex = m.index;
      payloadStart = m.index + m[0].length;
    }
  }

  if (payloadStart < 0) {
    const m = text.match(/\s-d\s*'([^']*)'|\s-d\s*"([^"]*)"/i);
    if (m) {
      const idx = /** @type {RegExpMatchArray} */ (m).index ?? -1;
      if (idx >= 0) {
        return {
          preBody: text.slice(0, idx).trimEnd(),
          jsonString: (m[1] ?? m[2] ?? "").trim(),
        };
      }
    }
    return null;
  }

  const after = text.slice(payloadStart).trimStart();
  if (!after.length) return null;

  const q = after[0];
  let jsonStr;
  if (q === "'" || q === '"') {
    jsonStr = extractQuotedString(after, q);
  } else {
    const brace = after.search(/[\[{]/);
    if (brace < 0) return null;
    jsonStr = extractBalancedJson(after.slice(brace));
  }

  return { preBody: text.slice(0, flagIndex).trimEnd(), jsonString: jsonStr };
}

/**
 * cURL yapısı (method, URL, header'lar) ile JSON gövdesini ayırır.
 * Önce --data-raw / --data / -d; yoksa tırnak dışı ilk { veya [ ile gövde bulunur.
 * @param {string} curlText
 * @returns {CurlSplitResult}
 */
export function splitCurlStructuralAndBody(curlText) {
  const text = curlText.replace(/\r\n/g, "\n");

  const flagged = tryExtractJsonAfterDataFlag(text);
  if (flagged && flagged.jsonString.length > 0) {
    return flagged;
  }

  const j = findFirstStructuralJsonIndex(text);
  if (j < 0) {
    throw new Error(
      "JSON gövdesi bulunamadı: --data-raw / -d yoksa gövde { veya [ ile başlamalı (tırnak dışında)."
    );
  }

  const jsonString = extractBalancedJson(text.slice(j));
  const preBody = text.slice(0, j).trimEnd();

  if (!jsonString || (!jsonString.startsWith("{") && !jsonString.startsWith("["))) {
    throw new Error("Geçerli JSON gövdesi çıkarılamadı.");
  }

  return { preBody, jsonString };
}

/**
 * cURL içinden yalnızca JSON string (split ile uyumlu)
 * @param {string} curlText
 */
export function extractJsonFromCurl(curlText) {
  return splitCurlStructuralAndBody(curlText).jsonString;
}

/**
 * @param {string} text
 * @param {InputType} [forcedType]
 */
export function parseInput(text, forcedType = "auto") {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Girdi boş.");
  }

  const type = forcedType === "auto" ? detectInputType(trimmed) : forcedType;

  let jsonStr = trimmed;
  if (type === "curl") {
    jsonStr = splitCurlStructuralAndBody(trimmed).jsonString;
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`JSON parse hatası: ${msg}`);
  }
}

/**
 * cURL meta: yalnızca gövdeden önceki yapı; header/URL isimleri tamamen girdiden gelir.
 * @param {string} curlText
 */
export function parseCurlMetadata(curlText) {
  const { preBody } = splitCurlStructuralAndBody(curlText);
  const text = preBody.replace(/\r\n/g, "\n");
  const hasLocation = /--location\b/i.test(text);

  let method = "GET";
  const mReq = text.match(/(?:^|\s)--request\s+(\w+)|(?:^|\s)-X\s+(\w+)/i);
  if (mReq) method = (mReq[1] || mReq[2] || "GET").toUpperCase();

  let url = "";
  const urlMatch = text.match(/['"](https?:\/\/[^'"]+)['"]/);
  if (urlMatch) url = urlMatch[1];

  /** @type {{ key: string, value: string }[]} */
  const headers = [];

  const hdrRe = /--header\s+(['"])([\s\S]*?)\1|--?H\s+(['"])([\s\S]*?)\3/gi;
  let hm;
  while ((hm = hdrRe.exec(text)) !== null) {
    const line = (hm[2] ?? hm[4] ?? "").trim().replace(/\n/g, " ");
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    headers.push({ key, value });
  }

  return { method, url, headers, hasLocation };
}
