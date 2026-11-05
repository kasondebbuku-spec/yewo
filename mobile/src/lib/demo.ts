// Demo location switch. When on, everyone is placed in Kabulonga so the app can be
// demoed from anywhere. When off (the default), the app uses the phone's real GPS.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const KEY = 'yewo.demoLocation';
let demo = process.env.EXPO_PUBLIC_DEMO_LOCATION === 'true';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v != null) {
      demo = v === '1';
      emit();
    }
  })
  .catch(() => {});

export const isDemo = () => demo;

export function setDemo(on: boolean) {
  demo = on;
  AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  emit();
}

export function useDemo() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isDemo,
    isDemo
  );
}
