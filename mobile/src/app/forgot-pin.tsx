import { useState } from 'react';
import { router } from 'expo-router';
import { Badge, Button, ErrorText, Field, H1, Muted, Screen } from '@/components/ui';
import { PhoneVerify } from '@/components/PhoneVerify';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';

export default function ForgotPin() {
  const { resetPin } = useAuth();
  const [verified, setVerified] = useState<{ phone: string; phoneToken: string } | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!verified) {
    return (
      <Screen>
        <H1>Reset your PIN</H1>
        <Muted>We’ll text a code to the number on your Yewo account.</Muted>
        <PhoneVerify purpose="reset_pin" onVerified={(phone, phoneToken) => setVerified({ phone, phoneToken })} />
      </Screen>
    );
  }

  async function submit() {
    if (pin !== confirm) {
      setError("The two PINs don't match");
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPin(verified!.phoneToken, pin);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Badge tone="success" label={`✓ ${verified.phone} confirmed`} />
      <Field label="New PIN" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="4–6 digits" />
      <Field label="Type it again" value={confirm} onChangeText={setConfirm} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <ErrorText>{error}</ErrorText>
      <Button title="Save PIN and log in" onPress={submit} loading={loading} disabled={!pin || !confirm} />
    </Screen>
  );
}
