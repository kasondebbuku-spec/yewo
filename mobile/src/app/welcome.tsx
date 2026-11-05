import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, colors, ErrorText, Field, Muted, Row, Screen } from '@/components/ui';
import { DemoToggle } from '@/components/DemoToggle';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';

// Seed accounts from backend/src/seed.js (only shown in development builds).
const DEMO_ACCOUNTS = [
  { label: 'Customer', phone: '0971111111' },
  { label: 'Worker', phone: '0962222221' },
  { label: 'Admin', phone: '0960000001' },
];

export default function Welcome() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    setLoading(true);
    try {
      await login(phone, pin);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 48, marginBottom: 16 }}>
        <View
          style={{
            width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>Y</Text>
        </View>
        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.text, marginTop: 12 }}>Yewo</Text>
        <Muted style={{ textAlign: 'center', marginTop: 4 }}>Verified home help in Lusaka, in minutes.</Muted>
      </View>

      <Field label="Phone number" placeholder="097 123 4567" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <Field label="PIN" placeholder="4–6 digits" keyboardType="number-pad" secureTextEntry maxLength={6} value={pin} onChangeText={setPin} />
      <ErrorText>{error}</ErrorText>
      <Button title="Log in" onPress={submit} loading={loading} disabled={!phone || !pin} />
      <Button title="New to Yewo? Create an account" variant="ghost" onPress={() => router.push('/register')} />

      {__DEV__ && (
        <Card style={{ backgroundColor: colors.warnSoft, borderColor: '#FDE68A' }}>
          <Text style={{ fontWeight: '700', color: '#92400E' }}>Demo accounts (PIN 1234)</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {DEMO_ACCOUNTS.map((a) => (
              <Button
                key={a.phone}
                title={a.label}
                variant="secondary"
                style={{ paddingVertical: 8 }}
                onPress={() => {
                  setPhone(a.phone);
                  setPin('1234');
                }}
              />
            ))}
          </Row>
          <DemoToggle />
        </Card>
      )}
    </Screen>
  );
}
