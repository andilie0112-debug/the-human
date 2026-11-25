import { validateGameData } from './data';
import { startGame } from './game';
import { GameSession, defaultCharacter } from './sim/session';
import { simData } from './sim/gameData';
import { showMainMenu } from './ui/mainMenu';
import { showCreator } from './ui/creator';

// Entry point: main menu -> character creator -> home. ?debug / ?quick / ?agama= skip straight
// into the game with a default character (tests and quick checks).

const issues = validateGameData();
if (issues.length > 0) console.warn('Data validation issues:', issues);

const params = new URLSearchParams(location.search);
if (params.has('debug') || params.has('quick') || params.has('agama')) {
  const character = defaultCharacter();
  const agama = params.get('agama');
  if (agama && simData.religions.some((r) => r.id === agama)) character.religionId = agama;
  startGame(new GameSession(simData, character));
} else {
  showMainMenu({
    onNew: () =>
      showCreator((created) => {
        startGame(new GameSession(simData, created.character, Date.now() % 100000, created.savings));
      }),
  });
}
