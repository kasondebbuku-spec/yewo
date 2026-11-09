// "Report a problem" on a job, plus the status of reports already made.
// The server decides which kinds apply at this stage of the job.
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Badge, Button, Card, Chip, colors, ErrorText, Field, H2, Muted, Row } from './ui';
import { api, errorMessage } from '@/lib/api';
import { useSocketEvent } from '@/lib/auth';
import { formatWhen } from '@/lib/time';
import type { Incident, IncidentKind, JobStatus, ReportOption } from '@/lib/types';

const STATUS: Record<Incident['status'], { label: string; tone: 'warn' | 'success' | 'muted' }> = {
  open: { label: 'Being looked into', tone: 'warn' },
  resolved: { label: 'Resolved', tone: 'success' },
  dismissed: { label: 'Closed', tone: 'muted' },
};

export function ReportProblem({ jobId, jobStatus }: { jobId: number; jobStatus: JobStatus }) {
  const [reports, setReports] = useState<Incident[]>([]);
  const [options, setOptions] = useState<ReportOption[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<IncidentKind | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ reports: Incident[]; options: ReportOption[] }>(`/jobs/${jobId}/reports`)
      .then((r) => {
        setReports(r.reports);
        setOptions(r.options.filter((o) => o.kind !== 'emergency')); // emergency has its own button
      })
      .catch(() => {});
  }, [jobId]);

  useEffect(load, [load, jobStatus]);
  useSocketEvent<Incident>('incident:update', (i) => i.jobId === jobId && load());

  async function submit() {
    if (!kind) return;
    setBusy(true);
    setError('');
    try {
      await api(`/jobs/${jobId}/reports`, { method: 'POST', body: { kind, description } });
      setOpen(false);
      setKind(null);
      setDescription('');
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!reports.length && !options.length) return null;

  return (
    <>
      {reports.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{r.label}</Text>
            <Badge label={STATUS[r.status].label} tone={STATUS[r.status].tone} />
          </Row>
          {r.description ? <Muted>“{r.description}”</Muted> : null}
          <Muted style={{ fontSize: 12 }}>Reported {formatWhen(r.createdAt)}</Muted>
          {r.resolution ? <Muted>Yewo: {r.resolution}</Muted> : null}
        </Card>
      ))}

      {options.length > 0 &&
        (open ? (
          <Card>
            <H2>What went wrong?</H2>
            <Row style={{ flexWrap: 'wrap' }}>
              {options.map((o) => (
                <Chip key={o.kind} label={o.label} selected={kind === o.kind} onPress={() => setKind(o.kind)} />
              ))}
            </Row>
            <Field
              label="Tell us what happened"
              value={description}
              onChangeText={setDescription}
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top' }}
              placeholder="A few words help our team act quickly"
            />
            <ErrorText>{error}</ErrorText>
            <Row>
              <Button title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => setOpen(false)} />
              <Button title="Send report" style={{ flex: 2 }} onPress={submit} loading={busy} disabled={!kind || description.trim().length < 5} />
            </Row>
          </Card>
        ) : (
          <Button title="Report a problem" variant="ghost" onPress={() => setOpen(true)} />
        ))}
    </>
  );
}
