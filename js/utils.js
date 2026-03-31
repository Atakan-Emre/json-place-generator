/** @param {string} str */
export function toCamelCase(str) {
  if (!str) return "";
  const parts = str.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  return (
    first.toLowerCase() +
    rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("")
  );
}

/**
 * Her türlü header adından değişken üretir (X-Tenant, Custom_Header, IMS-Org vb.)
 * @param {string} key
 */
export function httpHeaderKeyToVarName(key) {
  const raw = key.trim();
  if (!raw) return "httpHeader";
  let parts = raw
    .split("-")
    .map((p) => p.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) {
    parts = raw.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  }
  if (parts.length === 0) return "httpHeader";
  const slug = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
  return slug.charAt(0).toLowerCase() + slug.slice(1);
}

/**
 * Tam URL path'inden (son anlamlı segmentler) önerilen env adı: örn. .../purchase/header → purchaseHeaderUrl
 * @param {string} url
 */
export function suggestUrlEnvName(url) {
  try {
    const u = new URL(url);
    let segs = u.pathname.split("/").filter(Boolean);
    const noise = /^(v\d+(\.\d+)*|api)$/i;
    segs = segs.filter((s) => !noise.test(s));
    const tail = segs.slice(-4);
    if (!tail.length) {
      return "requestUrl";
    }
    const base = toCamelCase(tail.join(" "));
    return base ? `${base}Url` : "requestUrl";
  } catch {
    return "requestUrl";
  }
}

export function segmentsToCamelVariable(segments) {
  if (!segments.length) return "";
  let acc = "";
  segments.forEach((s, i) => {
    if (/^[0-9]+$/.test(s)) {
      acc += s;
      return;
    }
    if (i === 0) {
      acc = s.charAt(0).toLowerCase() + s.slice(1);
    } else {
      acc += s.charAt(0).toUpperCase() + s.slice(1);
    }
  });
  return acc;
}

export function deepClone(obj) {
  return structuredClone(obj);
}

/** @param {string} text */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/** @param {string} filename @param {string} content @param {string} [mime] */
export function downloadFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
