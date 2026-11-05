export type Role = 'customer' | 'worker' | 'admin';

export type Point = { lat: number; lng: number };

export type WorkerProfile = {
  id: number;
  name: string;
  phone: string;
  nrc: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verified: boolean;
  agency: { id: number; name: string; phone: string | null };
  rating: number;
  ratingCount: number;
  jobsCompleted: number;
  online: boolean;
  skills?: number[];
  location: (Point & { at: string }) | null;
  distanceKm?: number | null;
  etaMinutes?: number | null;
};

export type User = {
  id: number;
  role: Role;
  name: string;
  phone: string;
  worker?: WorkerProfile;
};

export type Service = { id: number; name: string; description: string; base_price: number };
export type Agency = { id: number; name: string; area: string };

export type JobStatus =
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
