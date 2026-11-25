import { getAudio } from '../engine/audio';
import { t } from '../data/strings';

// Title screen.

export interface MainMenuHandlers {
  onNew: () => void;
  /** Present when there is a saved game to continue (M6). */
  onContinue?: () => void;
}

export function showMainMenu(h: MainMenuHandlers): void {
  const root = document.createElement('div');
  root.className = 'main-menu';
  const title = document.createElement('h1');
  title.textContent = t('game.title');
  const tagline = document.createElement('p');
  tagline.textContent = t('menu.tagline');
  const buttons = document.createElement('div');
  buttons.className = 'main-menu-buttons';
  const add = (label: string, primary: boolean, onClick: (() => void) | undefined): void => {
    const b = document.createElement('button');
    b.className = primary ? 'btn-primary' : 'btn-secondary';
    b.textContent = label;
    b.disabled = !onClick;
    b.addEventListener('click', () => {
      getAudio().playMusic(null);
      root.remove();
      onClick?.();
    });
    buttons.append(b);
  };
  if (h.onContinue) add(t('menu.continue'), true, h.onContinue);
  add(t('menu.new'), !h.onContinue, h.onNew);
  const style = document.createElement('a');
  style.href = './style.html';
  style.className = 'btn-secondary';
  style.textContent = t('m0.styleLink');
  buttons.append(style);
  root.append(title, tagline, buttons);
  document.body.append(root);
  getAudio().playMusic('menu');
}
