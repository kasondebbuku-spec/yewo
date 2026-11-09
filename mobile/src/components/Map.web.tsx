// Web stand-in: react-native-maps only runs on phones. Same props as Map.tsx.
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, Muted } from './ui';
import type { Point } from '@/lib/types';

export type Zone = { id: number; name: string; lat: number; lng: number; radiusKm: number; active: boolean };

const fmt = (p: Point) => `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;

export function PickLocationMap({
  initial, onChange,
}: {
  initial: Point;
  zones?: Zone[];
  onChange: (p: Point) => void;
  onLocate: () => Promise<Point>;
}) {
  useEffect(() => onChange(initial), [initial, onChange]);
  return (
    <View style={styles.box}>
      <Text style={styles.title}>📍 {fmt(initial)}</Text>
      <Muted>The map with a draggable pin is in the phone app.</Muted>
    </View>
  );
}

export function JobMap({
  home, worker, workerLabel = 'Worker',
}: {
  home: Point;
  worker?: Point | null;
  workerLabel?: string;
  showMe?: boolean;
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>📍 Job address: {fmt(home)}</Text>
      {worker && <Muted>🧹 {workerLabel}: {fmt(worker)}</Muted>}
      <Muted>The live map is in the phone app.</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    padding: 16,
    gap: 4,
    backgroundColor: '#fff',
  },
  title: { fontWeight: '700', color: colors.text },
});
