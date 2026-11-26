// A short fade from black when the scene changes (walking through a door), so entering and
// leaving a place feels like moving, not like a cut.

export function fadeFromBlack(ms = 550): void {
  const el = document.createElement('div');
  el.className = 'scene-fade';
  document.body.append(el);
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${ms}ms ease-out`;
    el.style.opacity = '0';
  });
  window.setTimeout(() => el.remove(), ms + 100);
}
