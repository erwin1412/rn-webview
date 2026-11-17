# React Native WebView Tester

App Android (React Native 0.88 + [`react-native-webview`](https://github.com/react-native-webview/react-native-webview) 14)
untuk menguji sebuah web app di dalam WebView, dengan fokus pada **perilaku bawaan
`react-native-webview`** dan cara memperbaikinya.

Dibuat untuk membuktikan bahwa dua masalah di app mitra berasal dari **pengaturan WebView di
sisi app**, bukan dari web app-nya:

1. **Pembayaran kartu kredit + 3D Secure** — layar putih/blank saat diarahkan ke halaman OTP
   bank (terjadi pada kartu BCA Visa; BCA Mastercard normal; kartu yang sama normal di browser).
2. **Download Bukti (PDF)** — tombol download tidak menghasilkan apa-apa di dalam app.

Versi Flutter (WebView Android murni, popup asli): [flutter-webview](https://github.com/erwin1412/flutter-webview).

---

## Daftar isi

- [Temuan di react-native-webview](#temuan-di-react-native-webview)
- [Fitur](#fitur)
- [Pengaturan yang diuji](#pengaturan-yang-diuji)
- [Install](#install)
- [Cara pakai](#cara-pakai)
- [Skenario uji](#skenario-uji)
- [Membaca log](#membaca-log)
- [Build dari source](#build-dari-source)
- [Struktur project](#struktur-project)
- [Rekomendasi untuk app React Native](#rekomendasi-untuk-app-react-native)

---

## Temuan di react-native-webview

Dari kode native Android `react-native-webview` 14:

### 1. Popup dimuat di WebView yang tidak pernah tampil

`RNCWebChromeClient.onCreateWindow`:

```java
final WebView newWebView = new WebView(view.getContext());
if (mHasOnOpenWindowEvent) {
    newWebView.setWebViewClient(new WebViewClient() {
        public boolean shouldOverrideUrlLoading(WebView subview, String url) {
            // kirim event onOpenWindow { targetUrl: url } ke JS
            return true;
        }
    });
}
transport.setWebView(newWebView);   // ← WebView ini tidak pernah ditempel ke layar
```

Akibatnya, kalau web app membuka pembayaran lewat `window.open` lalu mengirim **form POST** ke
jendela itu (pola umum untuk payment gateway):

| Konfigurasi app | Yang terjadi |
| --- | --- |
| Tanpa `onOpenWindow` (default) | Halaman bank dimuat di WebView **tak terlihat** — user tidak melihat apa-apa |
| Dengan `onOpenWindow` | Yang diteruskan hanya **URL**; `shouldOverrideUrlLoading` tidak dipanggil untuk POST, dan kalau URL dibuka ulang, **POST body hilang** → halaman gateway error/blank |
| `window.open` dibuat `null` | Web app memakai jalur cadangan (`target=_self`) → form dikirim di halaman yang sama → **jalan** |

### 2. Download `blob:` selalu gagal

```kotlin
val request = DownloadManager.Request(Uri.parse(url))   // blob: → IllegalArgumentException
var fileName = URLUtil.guessFileName(url, contentDisposition, mimetype)  // nama dari URL → UUID
```

`DownloadManager` hanya menerima http(s), dan atribut `download` (nama file) tidak pernah
sampai ke native.

### 3. Halaman 3DS bank

Halaman OTP milik ACS bank (berbeda vendor per network: Visa vs Mastercard) bisa juga
membutuhkan cookie pihak ketiga, DOM storage, atau membuka app bank (`intent://`). Di RN,
cookie pihak ketiga dan DOM storage **sudah aktif secara default**, jadi tersangka utama di app
RN adalah penanganan popup (#1) dan link non-http.

---

## Fitur

- Form **Base URL**, **partner key (`k`)**, **user id (`uid`)** → `<base>#k=<k>&uid=<uid>`
  (format yang sama dengan app mitra), atau **URL lengkap**. Isian disimpan di HP
  (AsyncStorage); tidak ada URL yang ditanam di kode.
- Saklar pengaturan + **3 mode penanganan popup** + preset **Default RN** / **Disarankan**.
- **Download blob** dengan nama file yang benar → disimpan ke folder **Download** lalu dibuka.
- **Link non-http** (`intent://`, app bank, `tel:`, `mailto:`) via `Linking`, dengan fallback.
- **Panel log** yang bisa disalin, termasuk `window.open` (beserta hasilnya) dan
  `form-submit` (action + target) yang tidak terlihat dari sisi native.
- `webviewDebuggingEnabled` → bisa di-inspect dari `chrome://inspect`.

---

## Pengaturan yang diuji

| Opsi di app | Prop / mekanisme |
| --- | --- |
| Cookie pihak ketiga | `thirdPartyCookiesEnabled` (default RN: `true`) |
| DOM storage | `domStorageEnabled` (default RN: `true`) |
| Multiple windows | `setSupportMultipleWindows` + `javaScriptCanOpenWindowsAutomatically` |
| Popup: **Bawaan RN** | tanpa `onOpenWindow` — perilaku default |
| Popup: **onOpenWindow** | URL popup dibuka di WebView kedua (modal) — pola RN yang umum |
| Popup: **Halaman sama** | script disisipkan: `window.open = () => null` |
| Tangani download blob: | script disisipkan: klik `a[download]` ber-`blob:` → fetch → base64 → `postMessage` → simpan |
| Tangani link non-http | `onShouldStartLoadWithRequest` → `Linking.openURL` |

| Preset | Isi |
| --- | --- |
| **Default RN** | cookie & DOM storage aktif, multiple windows aktif, popup *Bawaan RN*, tanpa penanganan download & link |
| **Disarankan** | semua aktif, popup *Halaman sama* |

---

## Install

Unduh APK dari halaman **Releases** repo ini, atau build sendiri. APK berisi `arm64-v8a` dan
`armeabi-v7a`. Android akan meminta izin *Install dari sumber tidak dikenal*.

---

## Cara pakai

1. Isi **Base URL webview** (contoh format: `https://contoh-webview.example/`).
2. Isi **Partner key (k)** dan **Flip user id (uid)** dari akun uji, atau **URL lengkap**.
3. Pilih preset / atur opsi.
4. **Buka webview**. Tombol **Log** di kanan atas → **Salin**.

---

## Skenario uji

### A. Pembayaran kartu (3D Secure)

1. Preset **Default RN** → bayar dengan kartu yang bermasalah. Perhatikan log:
   `window.open → window` lalu `form-submit ... target=<nama popup>` tanpa halaman bank yang
   tampil = gejala #1.
2. Ganti popup ke **onOpenWindow** → lihat apakah halaman di modal kosong/error (POST hilang).
3. Preset **Disarankan** (popup *Halaman sama*) → log menunjukkan `window.open → null` dan
   `form-submit ... target=_self`; halaman OTP bank harus muncul.

> Gunakan nominal kecil kalau menguji di lingkungan yang memakai merchant produksi.

### B. Download Bukti

1. Preset **Default RN** → Download Bukti → tidak terjadi apa-apa
   (log: `klik link download href=blob:...`).
2. Preset **Disarankan** → file `bukti-....pdf` tersimpan di folder **Download** dan terbuka.

---

## Membaca log

Format: `jam [sumber/jenis] pesan`. Sumber `main` = WebView utama, `main>popup` = WebView
modal dari `onOpenWindow`.

| Jenis | Arti |
| --- | --- |
| `navigate` | `onShouldStartLoadWithRequest` (URL, main frame atau bukan) |
| `load-start` / `load-end` | halaman mulai / selesai dimuat |
| `window.open` | dipanggil halaman; `→ window` / `→ null` = hasil yang diterima halaman |
| `form-submit` | form dikirim: method, action, **target** |
| `onOpenWindow` | event popup dari native (mode onOpenWindow) |
| `error` / `http-error` | gagal muat / server 4xx-5xx |
| `render-gone` | proses render WebView crash |
| `console:*` | console & error JavaScript halaman |
| `scheme` / `intent` / `launch` | link non-http |
| `download` | klik link download, penyimpanan, pembukaan file |
| `config` | opsi yang aktif saat webview dibuka |

---

## Build dari source

Prasyarat: Node 22+, JDK 17–25, Android SDK (platform 36).

```bash
npm install
npx tsc --noEmit && npx eslint . && npx jest
cd android && ./gradlew assembleRelease
# hasil: android/app/build/outputs/apk/release/app-release.apk
```

Mode pengembangan: `npx react-native start` lalu `npx react-native run-android`.

Build release ditandatangani debug keystore bawaan template — cukup untuk sideload uji.

**Windows:** build C++ new architecture membuat path yang sangat panjang dan gagal dengan
`ninja: error: ... Filename longer than 260 characters` kalau project ada di folder yang dalam.
Clone ke path pendek (mis. `D:\b\rnw`) atau aktifkan *long paths* Windows sebelum build.

---

## Struktur project

```
App.tsx                 layar awal, form, preset, panel log
src/TesterWebView.tsx   WebView + popup modal, link non-http, simpan download
src/injected.ts         script yang disisipkan: console, window.open, form submit, blob
src/config.ts           tipe pengaturan + preset Default RN / Disarankan
src/log.ts              penyimpanan log (useSyncExternalStore)
__tests__/App.test.tsx  uji layar awal
```

---

## Rekomendasi untuk app React Native

```tsx
<WebView
  source={{ uri }}
  javaScriptEnabled
  domStorageEnabled
  thirdPartyCookiesEnabled
  // 1. Popup: react-native-webview tidak bisa menampilkan popup asli.
  //    Paksa web app memakai jalur halaman yang sama:
  injectedJavaScriptBeforeContentLoaded={`window.open = function(){ return null; }; true;`}
  // 2. Link non-http (app bank / intent://)
  onShouldStartLoadWithRequest={req => {
    if (/^https?:|^about:|^blob:|^data:/.test(req.url)) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }}
  // 3. Download blob: tangkap klik a[download] di JS, kirim base64 lewat postMessage,
  //    simpan di native (lihat src/injected.ts & src/TesterWebView.tsx).
  onMessage={handleMessage}
/>
```

Kalau popup asli memang dibutuhkan, alternatifnya adalah native module / fork yang menempelkan
WebView dari `onCreateWindow` ke layar (seperti versi Flutter di repo
[flutter-webview](https://github.com/erwin1412/flutter-webview)).
