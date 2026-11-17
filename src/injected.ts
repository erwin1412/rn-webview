// Script yang disisipkan ke halaman sebelum konten dimuat.
import type { TesterConfig } from './config';

export function buildInjectedScript(config: TesterConfig) {
  return `
(function () {
  if (window.__flipTester) return;
  window.__flipTester = true;

  function send(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }

  // Console + error halaman → log app.
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      try {
        var parts = Array.prototype.slice.call(arguments).map(function (a) {
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch (e) { return String(a); }
        });
        send({ t: 'console', level: level, text: parts.join(' ') });
      } catch (e) {}
      return orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    send({ t: 'console', level: 'pageerror', text: (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '') });
  });

  // window.open — catat hasilnya; mode samePage memaksa null.
  var origOpen = window.open;
  window.open = function (url, name, features) {
    ${
      config.popupMode === 'samePage'
        ? "send({ t: 'open', url: String(url || ''), name: String(name || ''), result: 'null (samePage)' }); return null;"
        : "var w = origOpen.apply(window, arguments); send({ t: 'open', url: String(url || ''), name: String(name || ''), result: w ? 'window' : 'null' }); return w;"
    }
  };

  // Form submit — penting untuk melihat target popup vs _self.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    send({ t: 'submit', action: f.action, method: f.method, target: f.target || '_self' });
  }, true);
  var origSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    send({ t: 'submit', action: this.action, method: this.method, target: this.target || '_self' });
    return origSubmit.apply(this, arguments);
  };

  // Download blob: — react-native-webview meneruskan ke DownloadManager yang
  // menolak URL blob:. Kalau diaktifkan, isi blob dibaca di sini lalu dikirim
  // ke app sebagai base64, dengan nama dari atribut download.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (!a || !a.href) return;
    send({ t: 'download-click', href: a.href, name: a.download });
    ${
      config.handleBlobDownloads
        ? `if (a.href.indexOf('blob:') !== 0) return;
    e.preventDefault();
    var href = a.href, name = a.download || 'download';
    fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
      var fr = new FileReader();
      fr.onloadend = function () { send({ t: 'blob', name: name, type: b.type, data: fr.result }); };
      fr.readAsDataURL(b);
    }).catch(function (err) { send({ t: 'blob-error', name: name, error: String(err) }); });`
        : ''
    }
  }, true);

  send({ t: 'ready', href: location.href });
})();
true;
`;
}
