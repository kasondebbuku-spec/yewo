// A worker's money: what's waiting for the next payout day, and past weekly payouts.
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Badge, Card, colors, ErrorText, H2, kwacha, Loading, Muted, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { formatDay } from '@/lib/time';
import type { Payout } from '@/lib/types';

type Summary = { upcoming: { jobs: number; amount: number; payoutDay: string }; payouts: Payout[] };

export default function WorkerPayouts() {
  const { user } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Summary>('/workers/me/payouts').then(setData).catch((e) => setError(errorMessage(e)));
  }, []);
  useFocusEffect(load);

  if (!data) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const { upcoming, payouts } = data;

  return (
    <Screen>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Muted>Waiting to be paid to you</Muted>
        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primaryDark }}>{kwacha(upcoming.amount)}</Text>
        <Muted>
          {upcoming.jobs} paid job{upcoming.jobs === 1 ? '' : 's'}. Payouts are worked out every Monday and sent to your
          Mobile Money ({user?.phone}). Next: {formatDay(upcoming.payoutDay)}.
        </Muted>
      </Card>

      <H2>Past payouts</H2>
      {payouts.length === 0 && <Muted>No payouts yet. Finish and get paid for jobs to start earning.</Muted>}
      {payouts.map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{kwacha(p.amount)}</Text>
            <Badge label={p.status === 'paid' ? '✓ Sent' : 'Being sent'} tone={p.status === 'paid' ? 'success' : 'warn'} />
          </Row>
          <Muted>
            Week of {formatDay(p.periodStart)} · {p.jobs} job{p.jobs === 1 ? '' : 's'}
          </Muted>
          {p.reference ? <Muted style={{ fontSize: 12 }}>MoMo reference: {p.reference}</Muted> : null}
        </Card>
      ))}
    </Screen>
  );
}
