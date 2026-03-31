# JSON Place Generator

![Static App](https://img.shields.io/badge/Static-Web%20App-0f172a?style=flat-square)
![Browser Only](https://img.shields.io/badge/Browser-Only-1d4ed8?style=flat-square)
![No Backend](https://img.shields.io/badge/No-Backend-059669?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f59e0b?style=flat-square)

API örnekleri ve test payload'larındaki `id` alanlarını placeholder tabanlı yapıya dönüştüren hafif bir tarayıcı aracıdır. `cURL` veya ham `JSON` girdisini parse eder, değişkenli çıktı üretir ve veriyi tamamen tarayıcı içinde işler.

**Depo:** [github.com/Atakan-Emre/json-place-generator](https://github.com/Atakan-Emre/json-place-generator)  
**Canlı kullanım:** [atakan-emre.github.io/json-place-generator](https://atakan-emre.github.io/json-place-generator/)

> `id` alanlarını yakala, değişkenleştir, export et.

## ✨ Ne Yapar?

- `id`, `...Id` ve `..._id` alanlarını otomatik tespit eder
- Anlamlı değişken adları önerir
- Seçilen placeholder formatına göre JSON'u yeniden üretir
- `cURL` girdilerinde URL ve header değerlerini de değişkenleştirebilir
- Tüm işlemi istemci tarafında yapar; veri sunucuya gitmez

## 🧩 Temel Özellikler

- `cURL` ve ham `JSON` desteği
- Otomatik input tipi algılama
- Recursive `id` tarama
- Özel `id` alan adları tanımlayabilme
- Satır bazında aktif/pasif kontrol
- Değişken adlarını manuel düzenleyebilme
- Aynı değeri tek değişkende birleştirme
- Değişken adlarına ön ek ekleme
- Tema ve çalışma alanı ayarlarını tarayıcıda saklama
- Sürükle-bırak, yeniden boyutlandırma ve daraltma destekli panel yapısı

## 🪄 Placeholder Seçenekleri

- `{{variable}}`
- `[[variable]]`
- `${variable}`

## 📦 Üretilen Çıktılar

- Değişkenli JSON
- `cURL` komutu
- Env JSON
- Postman / Apidog script satırları
- `.env` satırları
- CSV
- Place görünümü
- `place-list.txt`

## 🚀 Kullanım Akışı

1. `cURL` komutunu veya ham `JSON` içeriğini yapıştır.
2. Gerekirse input tipini seç.
3. Placeholder formatını ve değişken ön ekini belirle.
4. `Parse` işlemini çalıştır.
5. Tespit edilen satırları düzenle veya kapat.
6. İstediğin çıktı sekmesini kopyala ya da indir.

## 🔐 Kısa Notlar

- Backend veya veritabanı bağımlılığı yoktur.
- Veriler tarayıcı içinde işlenir.
- Tüm çıktı sekmeleri aynı kaynak veriden birlikte üretilir.
- Yerleşim, tema ve tespit tercihleri `localStorage` ile korunur.

## 🗂 Proje Yapısı

```text
.
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── parser.js
│   ├── transformer.js
│   ├── layout.js
│   └── utils.js
└── assets/
```

## 💻 Yerel Çalıştırma

Build adımı gerekmez. ES module kullandığı için projeyi `file://` yerine basit bir HTTP sunucusu ile açman gerekir.

```bash
cd /path/to/json-place-generator
python3 -m http.server 8080
```

Ardından uygulamayı [http://127.0.0.1:8080](http://127.0.0.1:8080) adresinden açabilirsin.

## ⚙️ Teknik Özet

- Saf HTML, CSS ve JavaScript ile geliştirildi
- Framework veya bundler bağımlılığı yok
- Küçük, taşınabilir ve statik yayın için uygun
