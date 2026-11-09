export type Role = 'customer' | 'worker' | 'admin' | 'agency';

export type Point = { lat: number; lng: number };

export type WorkerProfile = {
  id: number;
  name: string;
  phone: string;
  nrc: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verified: boolean;
  verificationNote?: string | null;
  documents?: WorkerDocument[];
  agency: { id: number; name: string; phone: string | null };
  agencyConfirmed?: boolean;
  photosComplete?: boolean;
  rating: number;
  ratingCount: number;
  jobsCompleted: number;
  online: boolean;
  skills?: number[];
  location: (Point & { at: string }) | null;
  distanceKm?: number | null;
  etaMinutes?: number | null;
};

export type WorkerDocument = {
  kind: 'nrc_front' | 'nrc_back' | 'selfie';
  label: string;
  uploaded: boolean;
  url: string | null;
  uploadedAt?: string;
};

export type User = {
  id: number;
  role: Role;
  name: string;
  phone: string;
  worker?: WorkerProfile;
  agency?: { id: number; name: string; phone: string | null; area: string | null } | null;
};

export type Service = { id: number; name: string; description: string; base_price: number };
export type Agency = { id: number; name: string; area: string };

export type JobStatus =
  | 'scheduled'
  | 'searching'
  | 'accepted'
  | 'en_route'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_workers';

export type Rating = { from_user: number; stars: number; comment: string | null };

export type Job = {
  id: number;
  status: JobStatus;
  paymentStatus: 'unpaid' | 'pending' | 'paid' | 'failed';
  service: { id: number; name: string };
  zone: { id: number; name: string };
  address: string;
  location: Point;
  notes: string | null;
  urgent: boolean;
  price: number;
  urgencyFee: number;
  total: number;
  commission?: number;
  workerPayout?: number;
  customer?: { id: number; name: string; phone: string };
  worker: WorkerProfile | null;
  payment: { provider: 'mtn' | 'airtel'; phone: string; amount: number; reference: string; status: string } | null;
  customerRating: Rating | null;
  workerRating: Rating | null;
  scheduledFor: string | null;
  createdAt: string;
  acceptedAt: string | null;
  enRouteAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type Offer = {
  jobId: number;
  service: { id: number; name: string };
  zone: { id: number; name: string };
  urgent: boolean;
  notes: string | null;
  workerPayout: number;
  distanceKm: number;
  etaMinutes: number;
  offeredAt: string;
};

export const OPEN_STATUSES: JobStatus[] = ['searching', 'accepted', 'en_route', 'in_progress'];

export type IncidentKind =
  | 'emergency' | 'safety' | 'no_show' | 'customer_absent' | 'quality' | 'damage' | 'payment' | 'other';

export type ReportOption = { kind: IncidentKind; label: string; urgent: boolean };

export type Incident = {
  id: number;
  jobId: number;
  kind: IncidentKind;
  label: string;
  urgent: boolean;
  description: string | null;
  location: Point | null;
  status: 'open' | 'resolved' | 'dismissed';
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: number; name: string; role: Role; phone: string };
  job: { status: JobStatus; address: string; service: string };
};

export type EmergencyNumber = { label: string; number: string };

export type Payout = {
  id: number;
  worker: { id: number; name: string; phone: string; network: 'mtn' | 'airtel' | 'zamtel' };
  agency: string;
  periodStart: string;
  periodEnd: string;
  jobs: number;
  amount: number;
  status: 'pending' | 'paid';
  reference: string | null;
  paidAt: string | null;
};

export type AdminZone = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  active: boolean;
  jobs: number;
  openJobs: number;
};
