// Staff: reports and emergencies from customers and workers. Urgent ones first.
import { useCallback, useState } from 'react';
import { Linking, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Badge, Button, Card, Chip, colors, ErrorText, Field, Muted, Row, Screen } from '@/components/ui';
import { useSocketEvent } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { formatWhen } from '@/lib/time';
import type { Incident } from '@/lib/types';

type Filter = 'open' | 'resolved' | 'dismissed';

export default function AdminReports() {
  const [filter, setFilter] = useState<Filter>('open');
  const [items, setItems] = useState<Incident[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ incidents: Incident[] }>(`/admin/incidents?status=${filter}`)
      .then((r) => setItems(r.incidents))
      .catch((e) => setError(errorMessage(e)));
  }, [filter]);
  useFocusEffect(load);
  useSocketEvent<Incident>('incident:new', load);

  async function close(i: Incident, outcome: 'resolved' | 'dismissed') {
    setError('');
    setBusy(i.id);
    try {
      await api(`/admin/incidents/${i.id}/resolve`, { method: 'POST', body: { outcome, resolution: notes[i.id] } });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Row>
        {(['open', 'resolved', 'dismissed'] as Filter[]).map((f) => (
          <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </Row>
      <ErrorText>{error}</ErrorText>
      {items.length === 0 && <Muted>Nothing here.</Muted>}

      {items.map((i) => (
        <Card key={i.id} style={i.urgent && i.status === 'open' ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: i.urgent ? colors.danger : colors.text, flex: 1 }}>
              {i.kind === 'emergency' ? '🚨 ' : ''}
              {i.label}
            </Text>
            {i.urgent && <Badge label="Urgent" tone="danger" />}
          </Row>
          <Muted>
            {i.reporter.name} ({i.reporter.role}) · {formatWhen(i.createdAt)}
          </Muted>
          <Muted>
            Job #{i.jobId} · {i.job.service} · {i.job.address}
          </Muted>
          {i.description ? <Text style={{ color: colors.text }}>“{i.description}”</Text> : null}

          <Row style={{ flexWrap: 'wrap' }}>
            <Button title={`Call ${i.reporter.name.split(' ')[0]}`} variant="secondary" style={{ paddingVertical: 8 }} onPress={() => Linking.openURL(`tel:${i.reporter.phone}`)} />
            {i.location && (
              <Button
                title="Map"
                variant="secondary"
                style={{ paddingVertical: 8 }}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${i.location!.lat},${i.location!.lng}`)}
              />
            )}
            <Button title="Open job" variant="ghost" style={{ paddingVertical: 8 }} onPress={() => router.push(`/job/${i.jobId}`)} />
          </Row>

          {i.status === 'open' ? (
            <>
              <Field
                label="What was done (the reporter sees this)"
                value={notes[i.id] ?? ''}
                onChangeText={(t) => setNotes((n) => ({ ...n, [i.id]: t }))}
                placeholder="e.g. Called both sides, K50 refund sent"
                multiline
              />
              <Row>
                <Button title="Dismiss" variant="ghost" style={{ flex: 1 }} disabled={busy === i.id || !notes[i.id]} onPress={() => close(i, 'dismissed')} />
                <Button title="Mark resolved" style={{ flex: 2 }} loading={busy === i.id} disabled={!notes[i.id]} onPress={() => close(i, 'resolved')} />
              </Row>
            </>
          ) : (
            <Muted>Outcome: {i.resolution}</Muted>
          )}
        </Card>
      ))}
    </Screen>
  );
}
