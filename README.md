# JSON Place Generator

API ve test payload’larındaki `id` alanlarını placeholder + ortam değişkeni üretimine çeviren **tek sayfalık** araç. Tarayıcıda çalışır; veri sunucuya gönderilmez. [GitHub Pages](https://pages.github.com/) ile statik yayınlanır.

**Önerilen depo adı:** `json-place-generator`  
**GitHub:** [github.com/atakanemre/json-place-generator](https://github.com/atakanemre/json-place-generator)  
**Örnek canlı adres:** https://atakanemre.github.io/json-place-generator/

## Özellikler

- cURL veya ham JSON; recursive `id` tespiti
- Placeholder: `{{var}}`, `[[var]]`, `${var}` — değişkenli JSON ve **Place** sekmesi bu seçime uyar
- Env JSON, Postman/Apidog, `.env` satırları, CSV, `place-list.txt`
- **Gündüz / gece teması** (sağ üstteki tema düğmesi; tercih `localStorage`’da `jpg-theme`: `light` | `dark`)

## Klasör yapısı

- `index.html` — tek sayfa
- `css/style.css`
- `js/parser.js`, `js/transformer.js`, `js/utils.js`, `js/app.js`

## GitHub Pages

1. `json-place-generator` reposunu oluşturup dosyaları `main` branch’ine gönderin.
2. **Settings** → **Pages** → branch **`main`**, klasör **`/ (root)`**.
3. Site: **https://atakanemre.github.io/json-place-generator/**

## Yerel önizleme

```bash
cd /path/to/json-place-generator
python3 -m http.server 8080
```

`http://127.0.0.1:8080` — ES modülleri için `file://` yerine küçük bir HTTP sunucusu kullanın.
