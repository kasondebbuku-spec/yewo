// Staff: work out last week's payouts, send them by MoMo, and record the reference.
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Badge, Button, Card, Chip, colors, ErrorText, Field, kwacha, Muted, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDay } from '@/lib/time';
import type { Payout } from '@/lib/types';

type RunResult = { periodStart: string; periodEnd: string; payouts: Payout[] };

export default function AdminPayouts() {
  const [filter, setFilter] = useState<'pending' | 'paid'>('pending');
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | 'run' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ payouts: Payout[] }>(`/admin/payouts?status=${filter}`)
      .then((r) => setPayouts(r.payouts))
      .catch((e) => setError(errorMessage(e)));
  }, [filter]);
  useFocusEffect(load);

  async function run() {
    setError('');
    setBusy('run');
    try {
      const r = await api<RunResult>('/admin/payouts/run', { method: 'POST' });
      const week = `week of ${formatDay(r.periodStart)}`;
      setMessage(r.payouts.length ? `Created ${r.payouts.length} payout(s) for the ${week}.` : `Nothing new to pay for the ${week}.`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(p: Payout) {
    setError('');
    setBusy(p.id);
    try {
      await api(`/admin/payouts/${p.id}/mark-paid`, { method: 'POST', body: { reference: refs[p.id] } });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const total = payouts.reduce((s, p) => s + p.amount, 0);

  return (
    <Screen>
      <Card>
        <Muted>
          Every Monday, work out what each worker earned from paid jobs last week. Send each amount from Yewo’s Mobile
          Money account, then enter the transaction reference.
        </Muted>
        <Button title="Work out last week’s payouts" onPress={run} loading={busy === 'run'} />
        {message ? <Text style={{ color: colors.success, fontWeight: '600' }}>{message}</Text> : null}
      </Card>

      <Row>
        <Chip label="To send" selected={filter === 'pending'} onPress={() => setFilter('pending')} />
        <Chip label="Sent" selected={filter === 'paid'} onPress={() => setFilter('paid')} />
      </Row>
      {payouts.length > 0 && <Muted>{payouts.length} payout(s), {kwacha(Math.round(total * 100) / 100)} in total</Muted>}
      {payouts.length === 0 && <Muted>Nothing here.</Muted>}
      <ErrorText>{error}</ErrorText>

      {payouts.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 }}>{p.worker.name}</Text>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{kwacha(p.amount)}</Text>
          </Row>
          <Muted>
            {p.worker.phone} ({p.worker.network.toUpperCase()}) · {p.agency}
          </Muted>
          <Muted>
            Week of {formatDay(p.periodStart)} · {p.jobs} job{p.jobs === 1 ? '' : 's'}
          </Muted>
          {p.status === 'paid' ? (
            <Badge tone="success" label={`✓ Sent · ref ${p.reference}`} />
          ) : (
            <>
              <Field
                label="MoMo transaction reference"
                value={refs[p.id] ?? ''}
                onChangeText={(t) => setRefs((r) => ({ ...r, [p.id]: t }))}
                placeholder="e.g. MP261116.1234.A1"
                autoCapitalize="characters"
              />
              <Button title="Mark as sent" onPress={() => markPaid(p)} loading={busy === p.id} disabled={(refs[p.id] ?? '').trim().length < 4} />
            </>
          )}
        </Card>
      ))}
    </Screen>
  );
}
