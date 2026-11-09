// Emergency button shown while a job is under way. Two taps (so it isn't pressed by
// accident), then Yewo staff and the worker's agency are alerted with the location,
// and the person gets one-tap calls to the emergency services.
import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { Button, Card, colors, ErrorText, H2, Muted, Row } from './ui';
import { api, errorMessage } from '@/lib/api';
import { DEMO_POINTS } from '@/lib/config';
import { isDemo } from '@/lib/demo';
import { getCurrentPoint } from '@/lib/location';
import type { EmergencyNumber, Point } from '@/lib/types';

export function EmergencyButton({ jobId, fallback }: { jobId: number; fallback: Point }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'sent'>('idle');
  const [numbers, setNumbers] = useState<EmergencyNumber[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    // Location helps, but the alert must go out even without GPS.
    const here = isDemo() ? DEMO_POINTS.customerHome : await getCurrentPoint().catch(() => fallback);
    try {
      const r = await api<{ numbers: EmergencyNumber[] }>(`/jobs/${jobId}/emergency`, { method: 'POST', body: here });
      setNumbers(r.numbers);
      setStep('sent');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'idle') {
    return <Button title="🚨 Emergency" variant="danger" onPress={() => setStep('confirm')} />;
  }

  return (
    <Card style={{ backgroundColor: colors.dangerSoft, borderColor: '#FECACA' }}>
      {step === 'confirm' ? (
        <>
          <H2>Send an emergency alert?</H2>
          <Muted>Yewo staff and the agency will be alerted right away with your location.</Muted>
          <Row>
            <Button title="Back" variant="ghost" style={{ flex: 1 }} onPress={() => setStep('idle')} />
            <Button title="Send alert" variant="danger" style={{ flex: 2 }} onPress={send} loading={busy} />
          </Row>
        </>
      ) : (
        <>
          <H2>Alert sent. Help is coming.</H2>
          <Muted>If you are in danger, call now:</Muted>
          <Row style={{ flexWrap: 'wrap' }}>
            {numbers.map((n) => (
              <Button
                key={n.number}
                title={`${n.label} ${n.number}`}
                variant="danger"
                style={{ paddingVertical: 10 }}
                onPress={() => Linking.openURL(`tel:${n.number}`)}
              />
            ))}
          </Row>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Stay somewhere safe. A Yewo staff member will call you.</Text>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
