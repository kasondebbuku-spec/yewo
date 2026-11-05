import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Muted, Screen } from '@/components/ui';
import { JobSummary } from '@/components/JobSummary';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { Job } from '@/lib/types';

export default function History() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<{ jobs: Job[] }>('/jobs').then((r) => setJobs(r.jobs)).catch(() => setJobs([]));
    }, [])
  );

  if (!user) return null;
  return (
    <Screen>
      {jobs?.length === 0 && <Muted>No bookings yet.</Muted>}
      {jobs?.map((j) => <JobSummary key={j.id} job={j} role={user.role} />)}
    </Screen>
  );
}
