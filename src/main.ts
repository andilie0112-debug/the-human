import { validateGameData } from './data';
import { startGame } from './game';
import { GameSession, defaultCharacter } from './sim/session';
import { simData } from './sim/gameData';
import { showMainMenu } from './ui/mainMenu';
import { showCreator } from './ui/creator';
import { createStorage } from './save/saveStorage';

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
  startGame(new GameSession(simData, character));
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
  if (params.has('debug') || params.has('quick') || params.has('agama')) {
    quickStart();
    return;
  }
  showMainMenu({
    onNew: () =>
      showCreator((created) => {
        startGame(new GameSession(simData, created.character, Date.now() % 100000, created.savings));
      }),
    onContinue: latest ? () => void load() : undefined,
  });
}

void boot();
