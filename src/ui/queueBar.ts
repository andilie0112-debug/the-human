import { t, tDynamic } from '../data/strings';
import type { QueueItem } from '../interaction/characterController';
import { actionIcon } from './actionIcons';

// Queued actions under the clock, as round icons. The first one is the action in progress: it is
// larger, shows its name and a progress ring. Tap an icon to cancel it.

export class QueueBar {
  private readonly root: HTMLElement;
  private ring: HTMLElement | null = null;

  constructor(parent: HTMLElement, private readonly onCancel: (index: number) => void) {
    this.root = document.createElement('div');
    this.root.className = 'queue-bar';
    parent.append(this.root);
  }

  render(queue: readonly QueueItem[]): void {
    this.root.replaceChildren();
    this.ring = null;
    queue.forEach((item, i) => {
      const chip = document.createElement('button');
      chip.className = `queue-chip${i === 0 ? ' active' : ''}${item.autonomous ? ' auto' : ''}`;
      const label = tDynamic(item.action.labelKey);
      chip.title = `${label} · ${t('queue.hint')}`;
      chip.setAttribute('aria-label', label);
      const icon = document.createElement('span');
      icon.className = 'queue-icon';
      icon.textContent = actionIcon(item.action.id);
      const x = document.createElement('span');
      x.className = 'queue-x';
      x.textContent = '✕';
      chip.append(icon, x);
      if (i === 0) {
        this.ring = icon;
        const name = document.createElement('span');
        name.className = 'queue-name';
        name.textContent = `${item.autonomous ? '💭 ' : ''}${label}`;
        chip.append(name);
      }
      chip.addEventListener('click', () => this.onCancel(i));
      this.root.append(chip);
    });
  }

  /** Progress of the running action, 0..1 (drawn as a ring around the first icon). */
  setProgress(fraction: number | null): void {
    if (this.ring) this.ring.style.setProperty('--p', `${Math.round((fraction ?? 0) * 100)}%`);
  }
}
