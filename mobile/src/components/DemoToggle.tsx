import { Switch, Text } from 'react-native';
import { colors, Muted, Row } from './ui';
import { setDemo, useDemo } from '@/lib/demo';

// Development-only switch between real GPS and the Kabulonga demo location.
export function DemoToggle() {
  const demo = useDemo();
  if (!__DEV__) return null;
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Row style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', color: colors.text }}>Demo location</Text>
        <Muted style={{ fontSize: 12, flexShrink: 1 }}>{demo ? 'Pretending to be in Kabulonga' : 'Using real GPS'}</Muted>
      </Row>
      <Switch value={demo} onValueChange={setDemo} trackColor={{ true: colors.accent }} />
    </Row>
  );
}
