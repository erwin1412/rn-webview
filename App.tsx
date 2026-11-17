/**
 * Flip WebView Tester (React Native) — pembanding app Flip untuk kasus
 * pembayaran kartu NICEPAY + 3DS dan Download Bukti di webview Rintisan.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TesterWebView } from './src/TesterWebView';
import { RECOMMENDED, RN_DEFAULT, describeConfig, type PopupMode, type TesterConfig } from './src/config';
import { clearLog, dumpLog, formatEntry, log, useLog } from './src/log';

// Isian disimpan di HP (bukan di kode) supaya URL webview tidak ikut ke repo.
const STORAGE_KEY = 'tester_fields';
type Fields = { base: string; k: string; uid: string; url: string };

const POPUP_MODES: { value: PopupMode; label: string; hint: string }[] = [
  { value: 'native', label: 'Bawaan RN', hint: 'Tanpa onOpenWindow: popup dimuat di WebView yang tidak tampil' },
  { value: 'onOpenWindow', label: 'onOpenWindow', hint: 'URL popup dibuka di WebView kedua; POST body hilang' },
  { value: 'samePage', label: 'Halaman sama', hint: 'window.open → null; form dikirim di halaman ini' },
];

// ---------------------------------------------------------------------------
// Tema: ikut mode terang/gelap HP, dengan kontras yang cukup di keduanya.
// ---------------------------------------------------------------------------

type Palette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  inputBg: string;
  accent: string;
  accentText: string;
};

const LIGHT: Palette = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  text: '#16181D',
  muted: '#5B6170',
  border: '#D5D8DE',
  inputBg: '#FFFFFF',
  accent: '#E8501F',
  accentText: '#FFFFFF',
};

const DARK: Palette = {
  bg: '#121316',
  surface: '#1E2025',
  text: '#F2F3F5',
  muted: '#B4B9C4',
  border: '#3A3E47',
  inputBg: '#272A30',
  accent: '#FF7A4D',
  accentText: '#16181D',
};

function makeStyles(p: Palette) {
  return StyleSheet.create({
    fill: { flex: 1 },
    screen: { flex: 1, backgroundColor: p.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: p.text },
    headerAction: { color: p.accent, fontWeight: '700', fontSize: 15 },
    form: { padding: 16, paddingBottom: 40, gap: 16 },
    card: {
      backgroundColor: p.surface,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      padding: 16,
    },
    cardTitle: { fontSize: 17, fontWeight: '700', color: p.text, marginBottom: 4 },
    cardNote: { fontSize: 13, color: p.muted, marginBottom: 4, lineHeight: 18 },
    field: { marginTop: 12 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: p.text, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.inputBg,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      color: p.text,
    },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: p.border },
    toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
    optionTitle: { fontSize: 16, fontWeight: '600', color: p.text },
    hint: { fontSize: 13, color: p.muted, marginTop: 3, lineHeight: 18 },
    radioRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: p.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOnRing: { borderColor: p.accent },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: p.accent },
    row: { flexDirection: 'row', gap: 12, marginTop: 12 },
    outline: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: p.accent,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    outlineText: { color: p.accent, fontWeight: '700', fontSize: 15 },
    primary: { backgroundColor: p.accent, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
    primaryText: { color: p.accentText, fontWeight: '700', fontSize: 16 },
    logList: { padding: 12 },
    logLine: { fontFamily: 'monospace', fontSize: 12, marginBottom: 8, color: p.text, lineHeight: 17 },
    empty: { padding: 24, textAlign: 'center', color: p.muted },
  });
}

type Theme = { p: Palette; s: ReturnType<typeof makeStyles>; dark: boolean };
const ThemeContext = createContext<Theme | null>(null);
const useTheme = () => useContext(ThemeContext)!;

// ---------------------------------------------------------------------------

export default function App() {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo<Theme>(() => {
    const p = dark ? DARK : LIGHT;
    return { p, s: makeStyles(p), dark };
  }, [dark]);
  return (
    <ThemeContext.Provider value={theme}>
      <SafeAreaProvider>
        <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
        <Main />
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

function Main() {
  const { s } = useTheme();
  const [base, setBase] = useState('');
  const [k, setK] = useState('');
  const [uid, setUid] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [config, setConfig] = useState<TesterConfig>(RECOMMENDED);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

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
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <Header title="Webview" onBack={() => setOpenUrl(null)} onLog={() => setShowLog(true)} />
        <TesterWebView url={openUrl} config={config} label="main" />
        <LogSheet visible={showLog} onClose={() => setShowLog(false)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="Flip WebView Tester (RN)" onLog={() => setShowLog(true)} />
      <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.cardTitle}>Alamat webview</Text>
          <Text style={s.cardNote}>Isian disimpan di HP ini. Kalau URL lengkap diisi, kolom lain diabaikan.</Text>
          <Field label="Base URL" value={base} onChange={setBase} placeholder="https://contoh-webview.example/" />
          <Field label="Partner key (k)" value={k} onChange={setK} />
          <Field label="Flip user id (uid)" value={uid} onChange={setUid} />
          <Field
            label="URL lengkap (opsional)"
            value={customUrl}
            onChange={setCustomUrl}
            placeholder="https://...#k=...&uid=..."
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Preset</Text>
          <Text style={s.cardNote}>
            Default RN = react-native-webview tanpa tambahan. Disarankan = semua penanganan aktif.
          </Text>
          <View style={s.row}>
            <Pressable style={s.outline} onPress={() => setConfig(RN_DEFAULT)}>
              <Text style={s.outlineText}>Default RN</Text>
            </Pressable>
            <Pressable style={s.outline} onPress={() => setConfig(RECOMMENDED)}>
              <Text style={s.outlineText}>Disarankan</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Pengaturan WebView</Text>
          <Toggle
            title="Cookie pihak ketiga"
            hint="thirdPartyCookiesEnabled — dibutuhkan halaman 3DS bank"
            value={config.thirdPartyCookies}
            onChange={v => set('thirdPartyCookies', v)}
          />
          <View style={s.divider} />
          <Toggle
            title="DOM storage"
            hint="domStorageEnabled — localStorage / sessionStorage"
            value={config.domStorage}
            onChange={v => set('domStorage', v)}
          />
          <View style={s.divider} />
          <Toggle
            title="Multiple windows"
            hint="setSupportMultipleWindows + javaScriptCanOpenWindowsAutomatically"
            value={config.multipleWindows}
            onChange={v => set('multipleWindows', v)}
          />
          <View style={s.divider} />
          <Toggle
            title="Tangani download blob:"
            hint="Download Bukti — DownloadManager menolak URL blob:"
            value={config.handleBlobDownloads}
            onChange={v => set('handleBlobDownloads', v)}
          />
          <View style={s.divider} />
          <Toggle
            title="Tangani link non-http"
            hint="intent://, aplikasi bank, tel:, mailto:"
            value={config.handleExternalSchemes}
            onChange={v => set('handleExternalSchemes', v)}
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Penanganan popup</Text>
          {POPUP_MODES.map(m => (
            <Radio
              key={m.value}
              selected={config.popupMode === m.value}
              title={m.label}
              hint={m.hint}
              onPress={() => set('popupMode', m.value)}
            />
          ))}
        </View>

        <Pressable style={s.primary} onPress={open}>
          <Text style={s.primaryText}>Buka webview</Text>
        </Pressable>
      </ScrollView>
      <LogSheet visible={showLog} onClose={() => setShowLog(false)} />
    </SafeAreaView>
  );
}

function Header({ title, onBack, onLog }: { title: string; onBack?: () => void; onLog: () => void }) {
  const { s } = useTheme();
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={s.headerAction}>Kembali</Text>
        </Pressable>
      ) : null}
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={onLog} hitSlop={12}>
        <Text style={s.headerAction}>Log</Text>
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
  const { s, p } = useTheme();
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={s.input}
        placeholder={placeholder}
        placeholderTextColor={p.muted}
        selectionColor={p.accent}
        cursorColor={p.accent}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function Toggle(props: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const { s, p } = useTheme();
  return (
    <View style={s.toggle}>
      <View style={s.fill}>
        <Text style={s.optionTitle}>{props.title}</Text>
        <Text style={s.hint}>{props.hint}</Text>
      </View>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        trackColor={{ true: p.accent, false: p.border }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function Radio(props: { selected: boolean; title: string; hint: string; onPress: () => void }) {
  const { s } = useTheme();
  return (
    <Pressable
      style={s.radioRow}
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
    >
      <View style={[s.radio, props.selected && s.radioOnRing]}>
        {props.selected ? <View style={s.radioDot} /> : null}
      </View>
      <View style={s.fill}>
        <Text style={s.optionTitle}>{props.title}</Text>
        <Text style={s.hint}>{props.hint}</Text>
      </View>
    </Pressable>
  );
}

function LogSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { s } = useTheme();
  const entries = useLog();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={s.headerAction}>Tutup</Text>
          </Pressable>
          <Text style={s.headerTitle}>Log ({entries.length})</Text>
          <Pressable onPress={() => Clipboard.setString(dumpLog())} hitSlop={12}>
            <Text style={s.headerAction}>Salin</Text>
          </Pressable>
          <Pressable onPress={clearLog} hitSlop={12}>
            <Text style={s.headerAction}>Hapus</Text>
          </Pressable>
        </View>
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          style={s.fill}
          contentContainerStyle={s.logList}
          ListEmptyComponent={<Text style={s.empty}>Belum ada log.</Text>}
          renderItem={({ item }) => (
            <Text selectable style={s.logLine}>
              {formatEntry(item)}
            </Text>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
