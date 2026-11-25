// On-screen joystick for walking outside, plus keyboard (WASD / arrows, Shift to run) on PC.

export class Joystick {
  readonly root: HTMLElement;
  private readonly knob: HTMLElement;
  /** -1..1 in screen space: x right, y down. */
  x = 0;
  y = 0;
  private pointerId: number | null = null;
  private keys = new Set<string>();
  runKey = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.root.append(this.knob);
    this.root.hidden = true;
    document.body.append(this.root);
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointerId) return;
      const r = this.root.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2;
      let dx = (e.clientX - cx) / max;
      let dy = (e.clientY - cy) / max;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.x = dx;
      this.y = dy;
      this.knob.style.transform = `translate(${dx * max * 0.6}px, ${dy * max * 0.6}px)`;
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.x = 0;
      this.y = 0;
      this.knob.style.transform = '';
    };
    this.root.addEventListener('pointerdown', (e) => {
      this.pointerId = e.pointerId;
      this.root.setPointerCapture(e.pointerId);
      move(e);
    });
    this.root.addEventListener('pointermove', move);
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === 'Shift') this.runKey = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Shift') this.runKey = false;
    });
  }

  /** Combined input from the stick and the keyboard. */
  read(): { x: number; y: number } {
    let x = this.x;
    let y = this.y;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }
}
