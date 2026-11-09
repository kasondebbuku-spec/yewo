// Business settings from the server (booking hours, emergency numbers), fetched once.
import { useEffect, useState } from 'react';
import { api } from './api';
import type { EmergencyNumber } from './types';

export type Settings = {
  scheduling: {
    minLeadMinutes: number;
    maxDaysAhead: number;
    openHour: number;
    lastStartHour: number;
    timezoneOffsetMinutes: number;
  };
  emergencyNumbers: EmergencyNumber[];
};

let cached: Settings | null = null;
let pending: Promise<Settings> | null = null;

export function loadSettings() {
  if (cached) return Promise.resolve(cached);
  pending ??= api<Settings>('/settings').then((s) => (cached = s)).finally(() => (pending = null));
  return pending;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(cached);
  useEffect(() => {
    if (!cached) loadSettings().then(setSettings).catch(() => {});
  }, []);
  return settings;
}
