/**
 * Flip WebView Tester (React Native) — pembanding app Flip untuk kasus
 * pembayaran kartu NICEPAY + 3DS dan Download Bukti di webview Rintisan.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TesterWebView } from './src/TesterWebView';
import { RECOMMENDED, RN_DEFAULT, describeConfig, type PopupMode, type TesterConfig } from './src/config';
import { clearLog, dumpLog, formatEntry, log, useLog } from './src/log';

const ORANGE = '#FB5B2D';
// Isian disimpan di HP (bukan di kode) supaya URL webview tidak ikut ke repo.
const STORAGE_KEY = 'tester_fields';
type Fields = { base: string; k: string; uid: string; url: string };

const POPUP_MODES: { value: PopupMode; label: string; hint: string }[] = [
  { value: 'native', label: 'Bawaan RN', hint: 'Tanpa onOpenWindow: popup dimuat di WebView yang tidak tampil' },
  { value: 'onOpenWindow', label: 'onOpenWindow', hint: 'URL popup dibuka di WebView kedua; POST body hilang' },
  { value: 'samePage', label: 'Halaman sama', hint: 'window.open → null; form dikirim di halaman ini' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [base, setBase] = useState('');
  const [k, setK] = useState('');
  const [uid, setUid] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        const f: Partial<Fields> = JSON.parse(raw);
        setBase(f.base ?? '');
        setK(f.k ?? '');
        setUid(f.uid ?? '');
        setCustomUrl(f.url ?? '');
      })
      .catch(() => {});
  }, []);
  const [config, setConfig] = useState<TesterConfig>(RECOMMENDED);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const set = <K extends keyof TesterConfig>(key: K, v: TesterConfig[K]) => setConfig(c => ({ ...c, [key]: v }));

  function buildUrl() {
    if (customUrl.trim()) return customUrl.trim();
    const params: string[] = [];
    if (k.trim()) params.push(`k=${encodeURIComponent(k.trim())}`);
    if (uid.trim()) params.push(`uid=${encodeURIComponent(uid.trim())}`);
    // Format yang sama dengan app Flip: partner key & uid lewat hash URL.
    return params.length ? `${base.trim()}#${params.join('&')}` : base.trim();
  }

  function open() {
    const url = buildUrl();
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('URL belum diisi', 'Isi Base URL (https://...) atau URL lengkap dulu.');
      return;
    }
    const fields: Fields = { base: base.trim(), k: k.trim(), uid: uid.trim(), url: customUrl.trim() };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fields)).catch(() => {});
    log('start', `Buka ${url}`);
    log('config', describeConfig(config));
    setOpenUrl(url);
  }

  if (openUrl) {
    return (
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <Header title="Webview" onBack={() => setOpenUrl(null)} onLog={() => setShowLog(true)} />
        <TesterWebView url={openUrl} config={config} label="main" />
        <LogSheet visible={showLog} onClose={() => setShowLog(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      <Header title="Flip WebView Tester (RN)" onLog={() => setShowLog(true)} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Field label="Base URL webview" value={base} onChange={setBase} placeholder="https://contoh-webview.example/" />
        <Field label="Partner key (k)" value={k} onChange={setK} />
        <Field label="Flip user id (uid)" value={uid} onChange={setUid} />
        <Field label="Atau URL lengkap (opsional)" value={customUrl} onChange={setCustomUrl} />

        <Text style={styles.section}>Pengaturan WebView</Text>
        <Toggle
          title="Cookie pihak ketiga"
          hint="thirdPartyCookiesEnabled — dibutuhkan halaman 3DS bank"
          value={config.thirdPartyCookies}
          onChange={v => set('thirdPartyCookies', v)}
        />
        <Toggle
          title="DOM storage"
          hint="domStorageEnabled — localStorage / sessionStorage"
          value={config.domStorage}
          onChange={v => set('domStorage', v)}
        />
        <Toggle
          title="Multiple windows"
          hint="setSupportMultipleWindows + javaScriptCanOpenWindowsAutomatically"
          value={config.multipleWindows}
          onChange={v => set('multipleWindows', v)}
        />
        <Text style={styles.subsection}>Penanganan popup</Text>
        {POPUP_MODES.map(m => (
          <Pressable key={m.value} style={styles.radioRow} onPress={() => set('popupMode', m.value)}>
            <View style={[styles.radio, config.popupMode === m.value && styles.radioOn]} />
            <View style={styles.fill}>
              <Text style={styles.toggleTitle}>{m.label}</Text>
              <Text style={styles.hint}>{m.hint}</Text>
            </View>
          </Pressable>
        ))}
        <Toggle
          title="Tangani download blob:"
          hint="Download Bukti — DownloadManager menolak URL blob:"
          value={config.handleBlobDownloads}
          onChange={v => set('handleBlobDownloads', v)}
        />
        <Toggle
          title="Tangani link non-http"
          hint="intent://, aplikasi bank, tel:, mailto:"
          value={config.handleExternalSchemes}
          onChange={v => set('handleExternalSchemes', v)}
        />
        <View style={styles.row}>
          <Pressable style={styles.outline} onPress={() => setConfig(RN_DEFAULT)}>
            <Text style={styles.outlineText}>Default RN</Text>
          </Pressable>
          <Pressable style={styles.outline} onPress={() => setConfig(RECOMMENDED)}>
            <Text style={styles.outlineText}>Disarankan</Text>
          </Pressable>
        </View>
        <Pressable style={styles.primary} onPress={open}>
          <Text style={styles.primaryText}>Buka webview</Text>
        </Pressable>
      </ScrollView>
      <LogSheet visible={showLog} onClose={() => setShowLog(false)} />
    </SafeAreaView>
  );
}

function Header({ title, onBack, onLog }: { title: string; onBack?: () => void; onLog: () => void }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerAction}>Kembali</Text>
        </Pressable>
      ) : null}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={onLog} hitSlop={12}>
        <Text style={styles.headerAction}>Log</Text>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function Toggle(p: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.fill}>
        <Text style={styles.toggleTitle}>{p.title}</Text>
        <Text style={styles.hint}>{p.hint}</Text>
      </View>
      <Switch value={p.value} onValueChange={p.onChange} trackColor={{ true: ORANGE }} />
    </View>
  );
}

function LogSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const entries = useLog();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.headerAction}>Tutup</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Log WebView ({entries.length})</Text>
          <Pressable onPress={() => Clipboard.setString(dumpLog())} hitSlop={12}>
            <Text style={styles.headerAction}>Salin</Text>
          </Pressable>
          <Pressable onPress={clearLog} hitSlop={12}>
            <Text style={styles.headerAction}>Hapus</Text>
          </Pressable>
        </View>
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.logList}
          renderItem={({ item }) => (
            <Text selectable style={styles.logLine}>
              {formatEntry(item)}
            </Text>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#111' },
  headerAction: { color: ORANGE, fontWeight: '600' },
  form: { padding: 16, paddingBottom: 40 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, color: '#444', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#111' },
  section: { marginTop: 24, fontSize: 16, fontWeight: '600', color: '#111' },
  subsection: { marginTop: 14, fontSize: 14, fontWeight: '600', color: '#111' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  toggleTitle: { fontSize: 15, color: '#111' },
  hint: { fontSize: 12, color: '#666', marginTop: 2 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#999' },
  radioOn: { borderColor: ORANGE, backgroundColor: ORANGE },
  row: { flexDirection: 'row', gap: 12, marginTop: 16 },
  outline: { flex: 1, borderWidth: 1, borderColor: ORANGE, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  outlineText: { color: ORANGE, fontWeight: '600' },
  primary: { marginTop: 20, backgroundColor: ORANGE, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  logList: { padding: 12 },
  logLine: { fontFamily: 'monospace', fontSize: 11, marginBottom: 6, color: '#111' },
});
