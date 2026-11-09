// Maps for the phone app (Android/iOS). The web build uses Map.web.tsx instead.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { colors } from './ui';
import type { Point } from '@/lib/types';

export type Zone = { id: number; name: string; lat: number; lng: number; radiusKm: number; active: boolean };

const regionFor = (p: Point, delta = 0.008): Region => ({
  latitude: p.lat,
  longitude: p.lng,
  latitudeDelta: delta,
  longitudeDelta: delta,
});
const coord = (p: Point) => ({ latitude: p.lat, longitude: p.lng });

// Customer drags the map so the pin sits on their gate. Active zones are shaded.
export function PickLocationMap({
  initial, zones = [], onChange, onLocate,
}: {
  initial: Point;
  zones?: Zone[];
  onChange: (p: Point) => void;
  onLocate: () => Promise<Point>;
}) {
  const ref = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);

  async function locate() {
    setLocating(true);
    try {
      const p = await onLocate();
      ref.current?.animateToRegion(regionFor(p), 400);
    } catch {
      // the screen shows its own error
    } finally {
      setLocating(false);
    }
  }

  return (
    <View style={styles.box}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(initial)}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChangeComplete={(r) => onChange({ lat: r.latitude, lng: r.longitude })}
      >
        {zones
          .filter((z) => z.active)
          .map((z) => (
            <Circle
              key={z.id}
              center={coord(z)}
              radius={z.radiusKm * 1000}
              strokeColor="rgba(15,118,110,0.6)"
              fillColor="rgba(15,118,110,0.08)"
            />
          ))}
      </MapView>
      <View pointerEvents="none" style={styles.centerPin}>
        <Text style={{ fontSize: 34 }}>📍</Text>
      </View>
      <Pressable onPress={locate} style={styles.locate} hitSlop={6}>
        {locating ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.locateText}>◎ My location</Text>}
      </Pressable>
    </View>
  );
}

// Shows the customer's home and, once assigned, the worker moving toward it.
export function JobMap({
  home, worker, workerLabel = 'Worker', showMe = false,
}: {
  home: Point;
  worker?: Point | null;
  workerLabel?: string;
  showMe?: boolean;
}) {
  const ref = useRef<MapView>(null);
  const [hLat, hLng, wLat, wLng] = [home.lat, home.lng, worker?.lat, worker?.lng];

  // Keep both pins in view as the worker moves.
  useEffect(() => {
    if (wLat == null || wLng == null) return;
    ref.current?.fitToCoordinates([coord({ lat: hLat, lng: hLng }), coord({ lat: wLat, lng: wLng })], {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  }, [hLat, hLng, wLat, wLng]);

  return (
    <View style={styles.box}>
      <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={regionFor(home, 0.02)} showsUserLocation={showMe}>
        <Marker coordinate={coord(home)} title="Job address" pinColor={colors.primary} />
        {worker && (
          <Marker coordinate={coord(worker)} title={workerLabel} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.workerDot}>
              <Text style={{ fontSize: 16 }}>🧹</Text>
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 240, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  centerPin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -17,
    marginTop: -40, // the pin's tip sits on the centre of the map
  },
  locate: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locateText: { color: colors.primary, fontWeight: '700' },
  workerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
