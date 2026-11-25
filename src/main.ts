import { validateGameData } from './data';
import { startGame } from './game';
import { GameSession, defaultCharacter } from './sim/session';
import { simData } from './sim/gameData';
import { showMainMenu } from './ui/mainMenu';
import { showIntro } from './ui/intro';
import { showHousingPicker } from './ui/housingPicker';
import { showCreator } from './ui/creator';
import { createStorage } from './save/saveStorage';
import { setupPwa } from './engine/pwa';

// Entry point: main menu -> character creator -> home. ?debug / ?quick / ?agama= skip straight
// into the game with a default character (tests and quick checks). After moving house the page
// reloads straight into the saved game.

const issues = validateGameData();
if (issues.length > 0) console.warn('Data validation issues:', issues);

const params = new URLSearchParams(location.search);
const storage = createStorage();

function takeAutoContinue(): boolean {
  try {
    const on = sessionStorage.getItem('the-human.autoContinue') === '1';
    sessionStorage.removeItem('the-human.autoContinue');
    return on;
  } catch {
    return false;
  }
}

function quickStart(): void {
  const character = defaultCharacter();
  const agama = params.get('agama');
  if (agama && simData.religions.some((r) => r.id === agama)) character.religionId = agama;
  // ?rumah=apartemen|tanah|... starts in another home (quick checks), with enough savings.
  const rumah = params.get('rumah');
  const session = new GameSession(simData, character, 1, rumah ? 50000000 : undefined);
  if (rumah) session.startHome(rumah);
  startGame(session);
}

async function boot(): Promise<void> {
  const slots = await storage.list().catch(() => []);
  const latest = [...slots].sort((a, b) => b.savedAt - a.savedAt)[0];
  const load = async (): Promise<void> => {
    const save = latest ? await storage.load(latest.slot) : null;
    if (save) startGame(GameSession.fromSave(simData, save));
  };
  if (takeAutoContinue() && latest) {
    await load();
    return;
  }
  if (params.has('debug') || params.has('quick') || params.has('agama') || params.has('rumah')) {
    quickStart();
    return;
  }
  // Animated intro first; the menu appears on top of it.
  const intro = showIntro(() =>
    showMainMenu({
      overIntro: true,
      onNew: () => {
        intro.stop();
        showCreator((created) => {
          const session = new GameSession(simData, created.character, Date.now() % 100000, created.savings);
          showHousingPicker(session, () => startGame(session));
        });
      },
      onContinue: latest
        ? () => {
            intro.stop();
            void load();
          }
        : undefined,
    }),
  );
}

setupPwa();
void boot();
