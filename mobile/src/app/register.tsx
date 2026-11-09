import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Badge, Button, Card, Chip, ErrorText, Field, H1, H2, Muted, Row, Screen } from '@/components/ui';
import { PhoneVerify } from '@/components/PhoneVerify';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import type { Agency, Service } from '@/lib/types';

export default function Register() {
  const { register } = useAuth();
  const [verified, setVerified] = useState<{ phone: string; phoneToken: string } | null>(null);
  const [role, setRole] = useState<'customer' | 'worker'>('customer');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [nrc, setNrc] = useState('');
  const [agencyId, setAgencyId] = useState<number | null>(null);
  const [skills, setSkills] = useState<number[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ agencies: Agency[] }>('/agencies').then((r) => setAgencies(r.agencies)).catch(() => {});
    api<{ services: Service[] }>('/services').then((r) => setServices(r.services)).catch(() => {});
  }, []);

  const toggleSkill = (id: number) =>
    setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Step 1: confirm the phone number by SMS.
  if (!verified) {
    return (
      <Screen>
        <H1>Create your account</H1>
        <Muted>First, let’s confirm your phone number. Your MTN or Airtel number works best for Mobile Money.</Muted>
        <PhoneVerify purpose="register" onVerified={(phone, phoneToken) => setVerified({ phone, phoneToken })} />
      </Screen>
    );
  }

  async function submit() {
    setError('');
    setLoading(true);
    try {
      const base = { role, name, pin, phoneToken: verified!.phoneToken };
      await register(role === 'worker' ? { ...base, nrc, agencyId, skills } : base);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // Step 2: the rest of the details.
  return (
    <Screen>
      <Badge tone="success" label={`✓ ${verified.phone} confirmed`} />
      <Row>
        <Chip label="I need help at home" selected={role === 'customer'} onPress={() => setRole('customer')} />
        <Chip label="I'm a worker" selected={role === 'worker'} onPress={() => setRole('worker')} />
      </Row>

      <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Chanda Mwila" />
      <Field label="Choose a PIN" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="4–6 digits" />

      {role === 'worker' && (
        <>
          <Card>
            <H2>Verification</H2>
            <Muted>
              Every Yewo worker is checked against their NRC and registered agency before they can take jobs.
              After signing up you’ll photograph your NRC and take a selfie.
            </Muted>
          </Card>
          <Field label="NRC number" value={nrc} onChangeText={setNrc} placeholder="123456/78/1" autoCapitalize="none" />

          <H2>Your agency</H2>
          <Row style={{ flexWrap: 'wrap' }}>
            {agencies.map((a) => (
              <Chip key={a.id} label={a.name} selected={agencyId === a.id} onPress={() => setAgencyId(a.id)} />
            ))}
          </Row>

          <H2>Services you can do</H2>
          <Row style={{ flexWrap: 'wrap' }}>
            {services.map((s) => (
              <Chip key={s.id} label={s.name} selected={skills.includes(s.id)} onPress={() => toggleSkill(s.id)} />
            ))}
          </Row>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={submit} loading={loading} disabled={!name || !pin} />
    </Screen>
  );
}
