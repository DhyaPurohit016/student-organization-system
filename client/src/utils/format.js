export const money = (n) => {
  const v = Number(n || 0);
  const digits = Number.isInteger(Math.round(Math.abs(v) * 100) / 100) ? 0 : 2; // ₹800 but ₹382.50
  return `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
};

export const date = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const dateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

export const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');

const dayLabel = (d) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

// "Mon, 12 Oct · 9:00 am–5:00 pm", or with both days when the event runs past midnight
export const eventWhen = (e) => {
  const start = `${dayLabel(e.startsAt)} · ${time(e.startsAt)}`;
  if (!e.endsAt) return start;
  const sameDay = new Date(e.startsAt).toDateString() === new Date(e.endsAt).toDateString();
  return sameDay ? `${start}–${time(e.endsAt)}` : `${start} – ${dayLabel(e.endsAt)} · ${time(e.endsAt)}`;
};

export function durationLabel(plan) {
  return plan.durationType === 'YEAR_END' ? 'Until 31 Dec' : `${plan.durationMonths} month${plan.durationMonths === 1 ? '' : 's'}`;
}

export function benefitList(benefits = {}) {
  const items = [];
  if (benefits.ticketDiscountPercent) items.push(`${benefits.ticketDiscountPercent}% off event tickets`);
  if (benefits.merchDiscountPercent) items.push(`${benefits.merchDiscountPercent}% off merchandise`);
  return items.concat(benefits.perks || []);
}

// "MEMBERSHIP_DUES" → "Membership dues"
const ACRONYMS = { UPI: 'UPI' };
export const label = (s) => (s ? ACRONYMS[s] || s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

// <input type="datetime-local"> value ↔ ISO
export const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
