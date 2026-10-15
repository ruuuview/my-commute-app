export type DeliveryRowId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface DeliveryRowInput {
  mode: 'loud' | 'shush' | 'off';
  notifGranted: boolean;
  notifCanAsk: boolean;
  la: { supported: boolean; enabled: boolean };
}

export function getDeliveryRow(i: DeliveryRowInput): DeliveryRowId {
  if (i.mode === 'off') return 6;
  if (i.mode === 'loud') return i.notifGranted ? 1 : i.notifCanAsk ? 2 : 3;
  if (!i.la.supported) return 7;
  if (!i.la.enabled) return 5;
  return i.notifGranted ? 4 : 8;
}

export const DELIVERY_COPY: Record<DeliveryRowId, string> = {
  1: "Banners with sound when you're not commuting.",
  2: 'Turn on notifications to get disruption banners on your Lock Screen.',
  3: "Notifications are off in iOS Settings, so banners can't be delivered.",
  4: 'On a commute: live updates on your Dynamic Island and Lock Screen, plus one heads-up if your line turns severe. Otherwise disruptions arrive quietly as notifications.',
  5: "Live Activities are off in iOS Settings, so your commute can't show live updates or severe-delay heads-ups.",
  6: 'No alerts and no live commute card. Check status in the app.',
  7: "Live Activities need iOS 16.1 or later, so commute updates aren't available. Disruptions still arrive as notifications.",
  8: "Notifications are off, so you won't hear about disruptions when you're not commuting.",
};
