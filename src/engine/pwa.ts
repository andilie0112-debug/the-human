// Installable web app: registers the service worker (production builds only) and keeps the
// browser's install prompt so the Setelan app can offer an install button.

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

let deferred: InstallPrompt | null = null;

export function setupPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        // Offline support is optional; the game works without it.
      });
    });
  }
}

export function canInstall(): boolean {
  return deferred !== null;
}

export async function install(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  deferred = null;
}
