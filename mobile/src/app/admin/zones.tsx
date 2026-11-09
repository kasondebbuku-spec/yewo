// Staff: switch neighbourhoods on or off, adjust their size, or add a new one.
import { useCallback, useState } from 'react';
import { Switch, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Card, colors, ErrorText, Field, H2, Muted, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { AdminZone } from '@/lib/types';

const STEP_KM = 0.5;

export default function AdminZones() {
  const [zones, setZones] = useState<AdminZone[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState({ name: '', lat: '', lng: '', radiusKm: '2' });

  const load = useCallback(() => {
    api<{ zones: AdminZone[] }>('/admin/zones').then((r) => setZones(r.zones)).catch((e) => setError(errorMessage(e)));
  }, []);
  useFocusEffect(load);

  async function change(zone: AdminZone, body: Partial<Pick<AdminZone, 'active' | 'radiusKm'>>) {
    setError('');
    setBusy(zone.id);
    try {
      const r = await api<{ zone: AdminZone }>(`/admin/zones/${zone.id}`, { method: 'PATCH', body });
      setZones((list) => list.map((z) => (z.id === zone.id ? { ...z, ...r.zone } : z)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    setError('');
    setBusy('new');
    try {
      await api('/admin/zones', {
        method: 'POST',
        body: { name: draft.name, lat: Number(draft.lat), lng: Number(draft.lng), radiusKm: Number(draft.radiusKm) },
      });
      setDraft({ name: '', lat: '', lng: '', radiusKm: '2' });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const live = zones.filter((z) => z.active).length;

  return (
    <Screen>
      <Muted>
        {live} of {zones.length} zones are live. Customers can only book inside a live zone. Switching a zone off doesn’t
        cancel bookings already made there.
      </Muted>
      <ErrorText>{error}</ErrorText>

      {zones.map((z) => (
        <Card key={z.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 }}>{z.name}</Text>
            <Text style={{ color: z.active ? colors.success : colors.muted, fontWeight: '600' }}>
              {z.active ? 'Live' : 'Coming soon'}
            </Text>
            <Switch
              value={z.active}
              disabled={busy === z.id}
              onValueChange={(active) => change(z, { active })}
              trackColor={{ true: colors.success }}
            />
          </Row>
          <Muted>
            {z.jobs} booking{z.jobs === 1 ? '' : 's'} so far{z.openJobs ? ` · ${z.openJobs} open now` : ''}
          </Muted>
          <Row>
            <Muted style={{ flex: 1 }}>Radius {z.radiusKm} km</Muted>
            <Button
              title="−"
              variant="secondary"
              style={{ paddingVertical: 6, paddingHorizontal: 16 }}
              disabled={busy === z.id || z.radiusKm - STEP_KM < 0.5}
              onPress={() => change(z, { radiusKm: z.radiusKm - STEP_KM })}
            />
            <Button
              title="+"
              variant="secondary"
              style={{ paddingVertical: 6, paddingHorizontal: 16 }}
              disabled={busy === z.id || z.radiusKm + STEP_KM > 10}
              onPress={() => change(z, { radiusKm: z.radiusKm + STEP_KM })}
            />
          </Row>
        </Card>
      ))}

      <Card>
        <H2>Add a neighbourhood</H2>
        <Muted>New zones start as “coming soon”. Switch them on when you have workers there.</Muted>
        <Field label="Name" value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} placeholder="e.g. Chelston" />
        <Row>
          <Field label="Latitude" value={draft.lat} onChangeText={(lat) => setDraft((d) => ({ ...d, lat }))} placeholder="-15.36" keyboardType="numbers-and-punctuation" style={{ minWidth: 120 }} />
          <Field label="Longitude" value={draft.lng} onChangeText={(lng) => setDraft((d) => ({ ...d, lng }))} placeholder="28.40" keyboardType="numbers-and-punctuation" style={{ minWidth: 120 }} />
        </Row>
        <Field label="Radius (km)" value={draft.radiusKm} onChangeText={(radiusKm) => setDraft((d) => ({ ...d, radiusKm }))} keyboardType="decimal-pad" />
        <Button title="Add zone" onPress={add} loading={busy === 'new'} disabled={!draft.name || !draft.lat || !draft.lng} />
      </Card>
    </Screen>
  );
}
