import { Vector3, type Camera, type Object3D } from 'three';

// A small thought bubble above the character's head (what it wants or is about to do).

export const NEED_ICONS: Record<string, string> = {
  kenyang: '🍜',
  energi: '😴',
  bersih: '🚿',
  sosial: '💬',
  hiburan: '🎮',
  stres: '🧘',
  belanja: '🛒',
};

export class ThoughtBubble {
  private readonly el: HTMLElement;
  private until = 0;
  private readonly v = new Vector3();

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'thought';
    this.el.hidden = true;
    parent.append(this.el);
  }

  show(icon: string, seconds = 3): void {
    this.el.textContent = icon;
    this.el.hidden = false;
    this.until = performance.now() + seconds * 1000;
  }

  /** Keeps the bubble above the head; hides it when its time is up. */
  update(target: Object3D, camera: Camera): void {
    if (this.el.hidden) return;
    if (performance.now() > this.until || !target.visible) {
      this.el.hidden = true;
      return;
    }
    target.getWorldPosition(this.v);
    this.v.y += 2.0;
    this.v.project(camera);
    this.el.style.transform = `translate(${((this.v.x + 1) / 2) * window.innerWidth}px, ${((1 - this.v.y) / 2) * window.innerHeight}px) translate(-50%, -100%)`;
  }
}
