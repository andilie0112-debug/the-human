// Small pictures for actions in the queue and the progress card (presentation only).

const RULES: [RegExp, string][] = [
  [/sleep|nap|tidur/, '😴'],
  [/shower|mandi/, '🚿'],
  [/toilet/, '🚽'],
  [/drink|coffee/, '🥤'],
  [/cook|eat|snack|jajan|makan/, '🍜'],
  [/video_call|call/, '📹'],
  [/browse|study|design|laptop/, '💻'],
  [/watch_tv|cinema/, '📺'],
  [/workout|gym|exercise/, '🏋️'],
  [/worship|pray|visit_place|sholat/, '🙏'],
  [/dress/, '👕'],
  [/laundry/, '🧺'],
  [/water_plant/, '🪴'],
  [/read/, '📖'],
  [/speech/, '🎤'],
  [/shop|store|market|mall_clothes/, '🛒'],
  [/work|ojol|interview|loker|skck/, '💼'],
  [/doctor|rs_|klinik|inpatient|rawat/, '🩺'],
  [/trip|mudik/, '🧳'],
  [/go_outside|walk|park|enter/, '🚶'],
  [/chat|hangout/, '💬'],
  [/jail/, '🚓'],
];

export function actionIcon(actionId: string): string {
  for (const [re, icon] of RULES) if (re.test(actionId)) return icon;
  return '✨';
}
