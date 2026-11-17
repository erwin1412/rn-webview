// Pengaturan yang bisa diubah dari layar awal.

/**
 * Cara menangani window.open / form ber-target popup:
 * - native: perilaku bawaan react-native-webview (tanpa onOpenWindow). Popup
 *   dimuat di WebView baru yang TIDAK pernah ditampilkan.
 * - onOpenWindow: pola RN yang umum — URL popup dibuka di WebView kedua (modal).
 *   POST body (form NICEPAY) hilang karena yang diteruskan cuma URL.
 * - samePage: window.open dibuat mengembalikan null sehingga webview Rintisan
 *   memakai jalur cadangannya (form dikirim di halaman yang sama).
 */
export type PopupMode = 'native' | 'onOpenWindow' | 'samePage';

export type TesterConfig = {
  thirdPartyCookies: boolean;
  domStorage: boolean;
  multipleWindows: boolean;
  popupMode: PopupMode;
  handleBlobDownloads: boolean;
  handleExternalSchemes: boolean;
};

/** Default react-native-webview 14 tanpa tambahan apa pun. */
export const RN_DEFAULT: TesterConfig = {
  thirdPartyCookies: true,
  domStorage: true,
  multipleWindows: true,
  popupMode: 'native',
  handleBlobDownloads: false,
  handleExternalSchemes: false,
};

/** Konfigurasi yang kami sarankan. */
export const RECOMMENDED: TesterConfig = {
  thirdPartyCookies: true,
  domStorage: true,
  multipleWindows: true,
  popupMode: 'samePage',
  handleBlobDownloads: true,
  handleExternalSchemes: true,
};

export function describeConfig(c: TesterConfig) {
  return Object.entries(c)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}
