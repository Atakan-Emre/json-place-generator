/** @typedef {'auto' | 'curl' | 'json'} InputType */

/** @param {string} text */
export function detectInputType(text) {
  const t = text.trimStart();
  const lower = t.slice(0, 500).toLowerCase();
  if (
    lower.startsWith("curl ") ||
    /\s--data(-raw|-binary)?\s/.test(lower) ||
    /\s-d\s/.test(lower)
  ) {
    return "curl";
  }
  if (t.startsWith("{") || t.startsWith("[")) {
    return "json";
  }
  return "json";
}

/**
 * cURL içinden JSON body çıkarır; --data-raw, --data, --data-binary, -d
 * @param {string} curlText
 */
export function extractJsonFromCurl(curlText) {
  const text = curlText.replace(/\r\n/g, "\n");
  const patterns = [
    /--data-raw\s+/gi,
    /--data-binary\s+/gi,
    /--data\s+/gi,
    /\s-d\s+/gi,
  ];

  let start = -1;
  let usedPatternEnd = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m && (start < 0 || m.index < start)) {
      start = m.index + m[0].length;
      usedPatternEnd = start;
    }
  }

  if (start < 0) {
    const m = text.match(/\s-d\s*'([^']*)'|\s-d\s*"([^"]*)"/i);
    if (m) {
      return (m[1] ?? m[2] ?? "").trim();
    }
    throw new Error("cURL içinde --data-raw, --data veya -d bulunamadı.");
  }

  const after = text.slice(start).trimStart();
  if (!after.length) {
    throw new Error("cURL veri gövdesi boş.");
  }

  const q = after[0];
  if (q === "'" || q === '"') {
    return extractQuotedString(after, q);
  }

  const brace = after.search(/[\[{]/);
  if (brace >= 0) {
    return extractBalancedJson(after.slice(brace));
  }

  throw new Error("JSON gövdesi ayırt edilemedi (tırnak veya {/[ bekleniyor).");
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
 * @param {InputType} [forcedType]
 */
export function parseInput(text, forcedType = "auto") {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Girdi boş.");
  }

  const type =
    forcedType === "auto" ? detectInputType(trimmed) : forcedType;

  let jsonStr = trimmed;
  if (type === "curl") {
    jsonStr = extractJsonFromCurl(trimmed);
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`JSON parse hatası: ${msg}`);
  }
}
