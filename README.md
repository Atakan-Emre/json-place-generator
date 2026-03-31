# JSON Place Generator

API ve test payload’larındaki `id` alanlarını placeholder + ortam değişkeni üretimine çeviren **tek sayfalık** araç. Tarayıcıda çalışır; veri sunucuya gönderilmez. [GitHub Pages](https://pages.github.com/) ile statik yayınlanır.

**Depo:** [github.com/Atakan-Emre/json-place-generator](https://github.com/Atakan-Emre/json-place-generator)  
**Canlı site (Pages):** [https://atakan-emre.github.io/json-place-generator/](https://atakan-emre.github.io/json-place-generator/)

## Özellikler

- cURL veya ham JSON; recursive `id` tespiti
- Placeholder: `{{var}}`, `[[var]]`, `${var}` — değişkenli JSON ve **Place** sekmesi bu seçime uyar
- Env JSON, Postman/Apidog, `.env` satırları, CSV, `place-list.txt`
- **Gündüz / gece teması** (`localStorage`: `jpg-theme` = `light` | `dark`)

## GitHub Pages — iki geçerli yöntem

**Aynı anda yalnızca birini** seçin (Settings → Pages → Build and deployment → Source).

### 1) GitHub Actions (bu repoda workflow hazır)

1. **Settings** → **Pages** → Source: **GitHub Actions**.
2. Repo kökünde [`.github/workflows/pages.yml`](.github/workflows/pages.yml) `main`’e push edildiğinde site yayınlanır.
3. İlk kez: Actions sekmesinden workflow’un yeşil bittiğini kontrol edin; birkaç dakika sonra site açılır.

### 2) Branch’ten yayın (Actions’sız)

1. **Settings** → **Pages** → Source: **Deploy from a branch**.
2. Branch: **main**, klasör: **`/ (root)`**.
3. Bu durumda `.github/workflows/pages.yml` dosyasını silmek veya devre dışı bırakmak iyi olur; iki kaynak karışmasın.

Site adresi her iki yöntemde de aynı kalır: **`https://atakan-emre.github.io/json-place-generator/`** (kullanıcı adı GitHub’da tire ile normalleşir).

## Klasör yapısı

- `index.html`, `css/`, `js/`, `assets/`

## Yerel önizleme

```bash
cd /path/to/json-place-generator
python3 -m http.server 8080
```

`http://127.0.0.1:8080` — ES modülleri için `file://` yerine HTTP kullanın.
