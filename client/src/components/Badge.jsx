// Coloured status pill, e.g. <Badge status="ACTIVE" />. Colour classes are grouped by meaning.
const LABELS = {
  ACTIVE: 'Active',
  EXPIRING: 'Expiring soon',
  EXPIRED: 'Expired',
  NONE: 'No membership',
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
  DISABLED: 'Disabled',
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  VALID: 'Valid',
  PENDING_PAYMENT: 'Awaiting payment',
  READY: 'Ready to collect',
  COLLECTED: 'Collected',
  SUBMITTED: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  TODO: 'Pending',
  IN_PROGRESS: 'In progress',
  DONE: 'Completed',
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  PLANNING: 'Planning',
  COMPLETED: 'Completed',
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  BEHIND: 'Behind',
  PUBLIC: 'Everyone',
  MEMBERS: 'Members',
  VOLUNTEERS: 'Volunteers',
  STAFF: 'Club staff',
  COLLEGE: 'College only',
  CLUB: 'Club members only',
  LEFT: 'Left',
  REMOVED: 'Removed',
};

const TONE = {
  good: ['RESOLVED', 'ACTIVE', 'PAID', 'VALID', 'PUBLISHED', 'COLLECTED', 'DONE', 'ON_TRACK', 'COMPLETED'],
  warn: ['OPEN', 'TODO', 'EXPIRING', 'PENDING', 'PENDING_PAYMENT', 'SUBMITTED', 'AT_RISK', 'IN_PROGRESS', 'PLANNING'],
  info: ['READY', 'APPROVED', 'MEMBERS', 'VOLUNTEERS', 'STAFF', 'COLLEGE', 'CLUB'],
  bad: ['EXPIRED', 'DISABLED', 'REJECTED', 'BEHIND', 'REMOVED'],
};
const toneOf = (s) => Object.keys(TONE).find((k) => TONE[k].includes(s)) || 'neutral';

export default function Badge({ status, children }) {
  return <span className={`badge tone-${toneOf(status)}`}>{children || LABELS[status] || status}</span>;
}
