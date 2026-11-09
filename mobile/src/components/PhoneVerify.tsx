// "Enter your number → we text you a code → type the code". Used by sign-up and Forgot PIN.
import { useEffect, useState } from 'react';
import { Button, ErrorText, Field, Muted } from './ui';
import { api, errorMessage } from '@/lib/api';

type Purpose = 'register' | 'reset_pin';

export function PhoneVerify({
  purpose, onVerified,
}: {
  purpose: Purpose;
  onVerified: (phone: string, phoneToken: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Count down before "Send again" is allowed.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    setError('');
    setLoading(true);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: { phone, purpose },
      });
      setSent(true);
      setDevCode(r.devCode ?? null);
      setCooldown(60);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setError('');
    setLoading(true);
    try {
      const r = await api<{ phoneToken: string }>('/auth/otp/verify', {
        method: 'POST',
        body: { phone, purpose, code },
      });
      onVerified(phone, r.phoneToken);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  if (!sent) {
    return (
      <>
        <Field
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="097 123 4567"
          hint="We'll send you an SMS with a 6-digit code."
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Send code" onPress={send} loading={loading} disabled={!phone} />
      </>
    );
  }

  return (
    <>
      <Muted>We sent a code to {phone}. It expires in 10 minutes.</Muted>
      {__DEV__ && devCode && <Muted>Development: the code is {devCode} (also printed in the API terminal).</Muted>}
      <Field
        label="6-digit code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        placeholder="123456"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Confirm" onPress={verify} loading={loading} disabled={code.length !== 6} />
      <Button
        title={cooldown > 0 ? `Send again in ${cooldown}s` : 'Send a new code'}
        variant="ghost"
        onPress={send}
        disabled={cooldown > 0 || loading}
      />
      <Button
        title="Change number"
        variant="ghost"
        onPress={() => {
          setSent(false);
          setCode('');
          setError('');
        }}
      />
    </>
  );
}
