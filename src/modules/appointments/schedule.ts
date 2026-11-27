export const bookingTimes = ['09:30 AM', '10:30 AM', '11:30 AM', '01:00 PM', '02:30 PM', '04:00 PM'];

export function salonDate(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
}

export function slotMinutes(slot: string): number {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)\s(AM|PM)$/i.exec(slot);
  return match ? (Number(match[1]) % 12 + (match[3]?.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2]) : NaN;
}

export function reservationKeys(date: string, slot: string, duration?: number): string[] {
  const start = slotMinutes(slot);
  if (!duration || !Number.isFinite(start) || start + duration > 1440) return [];
  return Array.from({ length: duration }, (_, offset) => `${date}|${start + offset}`);
}
