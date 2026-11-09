// "Book a service" use case (Controller). It is also the Creator of jobs: it has all
// the information a new job needs (customer, service, zone, price, time).
import { config } from '../config.js';
import { startDispatch } from '../dispatch.js';
import { parseBookingTime } from '../domain/bookingTime.js';
import { clash, invalid } from '../domain/errors.js';
import { priceBooking } from '../domain/money.js';
import { countScheduled, findService, hasOpenBooking, insertJob } from '../repos/jobRepo.js';
import { activeZoneNames, locate } from './zoneService.js';

// input: { serviceId, address, point, notes, urgent, scheduledFor }
export function createBooking(customer, input, now = new Date()) {
  const service = findService(input.serviceId);
  if (!service) throw invalid('Choose a service');

  const zone = locate(input.point);
  if (!zone) {
    throw invalid(`Yewo isn't available at this address yet. We currently serve ${activeZoneNames().join(', ')}.`);
  }

  const scheduledFor = parseBookingTime(input.scheduledFor, now);
  if (scheduledFor) {
    if (countScheduled(customer.id) >= config.scheduling.maxPerCustomer) {
      throw clash(`You can have up to ${config.scheduling.maxPerCustomer} bookings planned ahead`);
    }
  } else if (hasOpenBooking(customer.id)) {
    throw clash('You already have a booking in progress');
  }

  // Urgent only means something for "now" bookings.
  const urgent = !scheduledFor && !!input.urgent;
  const money = priceBooking({ basePrice: service.base_price, urgent });

  const jobId = insertJob({
    customerId: customer.id,
    serviceId: service.id,
    zoneId: zone.id,
    address: input.address,
    lat: input.point.lat,
    lng: input.point.lng,
    notes: input.notes,
    urgent,
    ...money,
    status: scheduledFor ? 'scheduled' : 'searching',
    scheduledFor: scheduledFor?.toISOString() ?? null,
  });

  if (!scheduledFor) startDispatch(jobId);
  return jobId;
}
