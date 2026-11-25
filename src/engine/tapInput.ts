// Distinguishes a tap from the drags and pinches that move the camera.

const MAX_MOVE_PX = 10;
const MAX_TAP_MS = 400;

export function onTap(target: HTMLElement, handler: (x: number, y: number) => void): void {
  let start: { x: number; y: number; t: number; id: number } | null = null;
  let pointers = 0;
  target.addEventListener('pointerdown', (e) => {
    pointers++;
    start = pointers === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
  });
  const end = (e: PointerEvent): void => {
    pointers = Math.max(0, pointers - 1);
    const s = start;
    if (!s || e.pointerId !== s.id) return;
    start = null;
    if (performance.now() - s.t > MAX_TAP_MS) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > MAX_MOVE_PX) return;
    handler(e.clientX, e.clientY);
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', () => {
    pointers = Math.max(0, pointers - 1);
    start = null;
  });
}
