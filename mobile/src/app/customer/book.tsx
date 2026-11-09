import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, Chip, colors, ErrorText, Field, H1, H2, kwacha, LineItem, Loading, Muted, Row, Screen } from '@/components/ui';
import { PickLocationMap, type Zone } from '@/components/Map';
import { api, errorMessage } from '@/lib/api';
import { DEMO_POINTS } from '@/lib/config';
import { isDemo } from '@/lib/demo';
import { describePoint, getCurrentPoint } from '@/lib/location';
import { useSettings } from '@/lib/settings';
import { bookingSlots, formatWhen } from '@/lib/time';
import type { Job, Point, Service } from '@/lib/types';

const URGENCY_FEE = 30; // matches backend config.urgencyFee

type ZoneCheck = { zone: { name: string; active: boolean } | null; available: boolean };

export default function Book() {
  const { serviceId, laterOnly } = useLocalSearchParams<{ serviceId: string; laterOnly?: string }>();
  const [service, setService] = useState<Service | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [start, setStart] = useState<Point | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [zoneCheck, setZoneCheck] = useState<ZoneCheck | null>(null);
  // In demo mode the address is pre-filled, so we don't overwrite it from the map.
  const [address, setAddress] = useState(() => (isDemo() ? DEMO_POINTS.customerHome.address : ''));
  const addressTouched = useRef(isDemo());
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [when, setWhen] = useState<'now' | 'later'>(laterOnly ? 'later' : 'now');
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const settings = useSettings();
  const days = useMemo(() => (settings ? bookingSlots(settings.scheduling) : []), [settings]);
  const day = days.find((d) => d.key === dayKey) ?? days[0];
  const [gpsError, setGpsError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ services: Service[] }>('/services').then((r) =>
      setService(r.services.find((s) => s.id === Number(serviceId)) ?? null)
    );
    api<{ zones: Zone[] }>('/zones').then((r) => setZones(r.zones)).catch(() => {});

    getCurrentPoint()
      .then(setStart)
      .catch((e) => {
        // No GPS: start the map in Kabulonga so the customer can still drop a pin.
        setGpsError(e.message);
        setStart(DEMO_POINTS.customerHome);
      });
  }, [serviceId]);

  // Each time the pin settles: is Yewo available here, and what's the address?
  useEffect(() => {
    if (!point) return;
    let stale = false;
    const timer = setTimeout(async () => {
      api<ZoneCheck>(`/zones/detect?lat=${point.lat}&lng=${point.lng}`)
        .then((r) => !stale && setZoneCheck(r))
        .catch(() => {});
      if (!addressTouched.current) {
        const text = await describePoint(point);
        if (!stale && text && !addressTouched.current) setAddress(text);
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [point]);

  const later = when === 'later';

  async function submit() {
    if (!service || !point) return;
    setError('');
    setLoading(true);
    try {
      const { job } = await api<{ job: Job }>('/jobs', {
        method: 'POST',
        body: {
          serviceId: service.id, address, notes, ...point,
          urgent: later ? false : urgent,
          scheduledFor: later ? slot : undefined,
        },
      });
      router.replace(`/job/${job.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  if (!service || !start) return <Loading />;
  const total = service.base_price + (urgent && !later ? URGENCY_FEE : 0);
  const available = !!zoneCheck?.available;

  return (
    <Screen>
      <H1>{service.name}</H1>
      <Muted>{service.description}</Muted>

      <Muted>Move the map so the pin is on your gate.</Muted>
      <PickLocationMap
        initial={start}
        zones={zones}
        onChange={setPoint}
        onLocate={async () => {
          const p = await getCurrentPoint();
          setGpsError('');
          return p;
        }}
      />
      {gpsError ? <ErrorText>{gpsError}</ErrorText> : null}
      {zoneCheck && (
        <Badge
          tone={available ? 'success' : 'warn'}
          label={
            available
              ? `✓ ${zoneCheck.zone?.name}: workers available`
              : zoneCheck.zone
                ? `${zoneCheck.zone.name} is coming soon`
                : 'Outside our service area. Move the pin into a shaded zone.'
          }
        />
      )}

      <Field
        label="Address"
        value={address}
        onChangeText={(t) => {
          addressTouched.current = true;
          setAddress(t);
        }}
        placeholder="House number, street, landmark"
        hint="Add a landmark the worker can recognise (e.g. blue gate opposite the church)."
      />
      <Field
        label="Notes for the worker (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Gate code, what needs doing, pets"
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />

      <H2>When?</H2>
      <Row>
        {!laterOnly && <Chip label="Now" selected={!later} onPress={() => setWhen('now')} />}
        <Chip label="Book for later" selected={later} onPress={() => setWhen('later')} />
      </Row>
      {laterOnly ? <Muted>You have a booking under way, so this one is for later.</Muted> : null}
      {later && day && (
        <Card>
          <Row style={{ flexWrap: 'wrap' }}>
            {days.map((d) => (
              <Chip key={d.key} label={d.label} selected={d.key === day.key} onPress={() => { setDayKey(d.key); setSlot(null); }} />
            ))}
          </Row>
          <Row style={{ flexWrap: 'wrap', marginTop: 6 }}>
            {day.slots.filter((x) => x.available).map((x) => (
              <Chip key={x.iso} label={x.label} selected={slot === x.iso} onPress={() => setSlot(x.iso)} />
            ))}
          </Row>
          <Muted style={{ fontSize: 12 }}>We start finding your worker shortly before the time you pick.</Muted>
        </Card>
      )}

      {!later && (
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Urgent (priority dispatch)</Text>
          <Switch value={urgent} onValueChange={setUrgent} trackColor={{ true: colors.primary }} />
        </Row>
        <Muted>Adds {kwacha(URGENCY_FEE)}. Your request goes out with an urgent tag.</Muted>
      </Card>
      )}

      <Card>
        <LineItem label={service.name} value={kwacha(service.base_price)} />
        {urgent && !later && <LineItem label="Urgency fee" value={kwacha(URGENCY_FEE)} />}
        <LineItem label="Total" value={kwacha(total)} bold />
        <Muted style={{ fontSize: 12 }}>You pay with MTN or Airtel Mobile Money after the job is done.</Muted>
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button
        title={later ? (slot ? `Book for ${formatWhen(slot)} · ${kwacha(total)}` : 'Pick a time') : `Request a worker · ${kwacha(total)}`}
        onPress={submit}
        loading={loading}
        disabled={!address || !point || !available || (later && !slot)}
      />
    </Screen>
  );
}
