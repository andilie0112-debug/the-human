import { t, tDynamic } from '../data/strings';
import type { QueueItem } from '../interaction/characterController';

// Row of queued actions under the clock. The first chip is the action in progress.

export class QueueBar {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly onCancel: (index: number) => void) {
    this.root = document.createElement('div');
    this.root.className = 'queue-bar';
    parent.append(this.root);
  }

  render(queue: readonly QueueItem[]): void {
    this.root.replaceChildren();
    queue.forEach((item, i) => {
      const chip = document.createElement('button');
      chip.className = `queue-chip${i === 0 ? ' active' : ''}`;
      chip.textContent = `${item.autonomous ? '💭 ' : ''}${tDynamic(item.action.labelKey)} ✕`;
      chip.title = t('queue.hint');
      chip.addEventListener('click', () => this.onCancel(i));
      this.root.append(chip);
    });
  }
}
