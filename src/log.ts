// Log kejadian WebView — bisa disalin dari app sebagai bukti untuk tim Flip.
import { useSyncExternalStore } from 'react';

export type LogEntry = { time: Date; tag: string; message: string };

let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function log(tag: string, message: string) {
  const e = { time: new Date(), tag, message };
  console.log(`[${tag}] ${message}`);
  entries = [...entries, e];
  emit();
}

export function clearLog() {
  entries = [];
  emit();
}

export function formatEntry(e: LogEntry) {
  return `${e.time.toISOString().substring(11, 23)} [${e.tag}] ${e.message}`;
}

export function dumpLog() {
  return entries.map(formatEntry).join('\n');
}

export function useLog() {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => entries,
  );
}
