import React, { useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import type { WebViewProps } from 'react-native-webview/lib/WebView';
import type {
  ShouldStartLoadRequest,
  WebViewMessageEvent,
  WebViewOpenWindowEvent,
} from 'react-native-webview/lib/WebViewTypes';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { log } from './log';
import { buildInjectedScript } from './injected';
import type { TesterConfig } from './config';

// Tipe v14 mendeklarasikan WebView sebagai FunctionComponent tanpa prop `ref`
// (React 19 memperlakukan ref sebagai prop biasa) → bungkus tipenya saja.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebViewHandle> }>;

// Skema yang tetap dimuat di WebView (bukan dibuka ke app lain).
// eslint-disable-next-line no-script-url
const WEB_SCHEMES = ['http:', 'https:', 'about:', 'data:', 'blob:', 'javascript:', 'file:'];

type Props = {
  url: string;
  config: TesterConfig;
  label: string;
  onClose?: () => void;
};

export function TesterWebView({ url, config, label, onClose }: Props) {
  const ref = useRef<WebViewHandle>(null);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const injected = useMemo(() => buildInjectedScript(config), [config]);
  const L = (tag: string, msg: string) => log(`${label}/${tag}`, msg);

  async function launchExternal(target: string) {
    if (target.startsWith('intent://')) {
      // intent://HOST/PATH#Intent;scheme=X;package=Y;S.browser_fallback_url=Z;end
      const hashIdx = target.indexOf('#Intent;');
      const body = target.substring(9, hashIdx < 0 ? target.length : hashIdx);
      const params: Record<string, string> = {};
      if (hashIdx >= 0) {
        target
          .substring(hashIdx + 8)
          .split(';')
          .forEach(p => {
            const eq = p.indexOf('=');
            if (eq > 0) params[p.substring(0, eq)] = p.substring(eq + 1);
          });
      }
      if (params.scheme) {
        const app = `${params.scheme}://${body}`;
        try {
          await Linking.openURL(app);
          L('intent', `buka ${app} (package=${params.package ?? '-'})`);
          return;
        } catch (e) {
          L('intent', `aplikasi tidak ada untuk ${app}: ${e}`);
        }
      }
      const fb = params['S.browser_fallback_url'];
      if (fb) {
        const decoded = decodeURIComponent(fb);
        L('intent', `fallback → ${decoded}`);
        ref.current?.injectJavaScript(`location.href = ${JSON.stringify(decoded)}; true;`);
      } else {
        L('intent', 'gagal: tidak ada aplikasi & tanpa fallback');
      }
      return;
    }
    try {
      await Linking.openURL(target);
      L('launch', `OK ${target}`);
    } catch (e) {
      L('launch', `GAGAL ${target}: ${e}`);
    }
  }

  function onShouldStart(req: ShouldStartLoadRequest) {
    L('navigate', `${req.url} (mainFrame=${req.isTopFrame ?? '?'})`);
    const scheme = req.url.substring(0, req.url.indexOf(':') + 1).toLowerCase();
    if (!scheme || WEB_SCHEMES.includes(scheme)) return true;
    if (!config.handleExternalSchemes) {
      L('scheme', `skema ${scheme} TIDAK ditangani (saklar mati) → ${req.url}`);
      return false;
    }
    launchExternal(req.url);
    return false;
  }

  async function saveBlob(name: string, type: string, dataUrl: string) {
    const safe = (name || 'download').replace(/[^A-Za-z0-9._-]/g, '_');
    const fileName = type === 'application/pdf' && !safe.toLowerCase().endsWith('.pdf') ? `${safe}.pdf` : safe;
    const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
    const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
    await ReactNativeBlobUtil.fs.writeFile(path, base64, 'base64');
    const size = (await ReactNativeBlobUtil.fs.stat(path)).size;
    L('download', `tersimpan ${size} byte (${type}) di ${path}`);
    try {
      const uri = await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        { name: fileName, parentFolder: '', mimeType: type },
        'Download',
        path,
      );
      L('download', `disalin ke folder Download: ${uri}`);
    } catch (e) {
      L('download', `gagal salin ke folder Download: ${e}`);
    }
    try {
      await ReactNativeBlobUtil.android.actionViewIntent(path, type);
    } catch (e) {
      L('download', `gagal membuka file: ${e}`);
    }
  }

  function onMessage(e: WebViewMessageEvent) {
    let m: any;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      L('message', e.nativeEvent.data);
      return;
    }
    switch (m.t) {
      case 'console':
        L(`console:${m.level}`, m.text);
        break;
      case 'open':
        L('window.open', `url="${m.url}" name="${m.name}" → ${m.result}`);
        break;
      case 'submit':
        L('form-submit', `${(m.method || 'get').toUpperCase()} ${m.action} target=${m.target}`);
        break;
      case 'download-click':
        L('download', `klik link download href=${m.href} name=${m.name}`);
        break;
      case 'blob':
        saveBlob(m.name, m.type, m.data).catch(err => L('download', `gagal simpan: ${err}`));
        break;
      case 'blob-error':
        L('download', `gagal baca blob ${m.name}: ${m.error}`);
        break;
      case 'ready':
        L('ready', m.href);
        break;
      default:
        L('message', e.nativeEvent.data.substring(0, 300));
    }
  }

  // Native hanya memasang handler kalau prop ini !== undefined; mode lain
  // sengaja undefined supaya perilaku bawaan RN yang teruji.
  const onOpenWindow =
    config.popupMode === 'onOpenWindow'
      ? (ev: WebViewOpenWindowEvent) => {
          const target = ev.nativeEvent.targetUrl;
          L('onOpenWindow', `${target} → dibuka di WebView kedua (POST body tidak ikut)`);
          setPopupUrl(target);
        }
      : undefined;

  return (
    <View style={styles.fill}>
      <WebView
        ref={ref}
        source={{ uri: url }}
        style={styles.fill}
        webviewDebuggingEnabled
        javaScriptEnabled
        domStorageEnabled={config.domStorage}
        thirdPartyCookiesEnabled={config.thirdPartyCookies}
        setSupportMultipleWindows={config.multipleWindows}
        javaScriptCanOpenWindowsAutomatically={config.multipleWindows}
        injectedJavaScriptBeforeContentLoaded={injected}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onLoadStart={e => L('load-start', e.nativeEvent.url)}
        onLoadEnd={e => L('load-end', e.nativeEvent.url)}
        onError={e => L('error', `${e.nativeEvent.code} ${e.nativeEvent.description} → ${e.nativeEvent.url}`)}
        onHttpError={e => L('http-error', `${e.nativeEvent.statusCode} ${e.nativeEvent.description} → ${e.nativeEvent.url}`)}
        onRenderProcessGone={e => {
          L('render-gone', `didCrash=${e.nativeEvent.didCrash}`);
          Alert.alert('WebView crash', 'Proses render WebView berhenti.');
        }}
        onOpenWindow={onOpenWindow}
      />
      {onClose ? (
        <Pressable style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>Tutup popup</Text>
        </Pressable>
      ) : null}
      <Modal visible={popupUrl !== null} animationType="slide" onRequestClose={() => setPopupUrl(null)}>
        {popupUrl ? (
          <TesterWebView url={popupUrl} config={config} label={`${label}>popup`} onClose={() => setPopupUrl(null)} />
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  close: { padding: 14, backgroundColor: '#222', alignItems: 'center' },
  closeText: { color: '#fff', fontWeight: '600' },
});
