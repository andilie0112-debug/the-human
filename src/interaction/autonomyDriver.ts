import { chooseAction, type Candidate, type Choice } from '../sim/autonomy';
import type { GameSession } from '../sim/session';
import type { KosRoom } from '../home/kosRoom';
import { spotOf, type CharacterController } from './characterController';

// Runs the utility AI when the character has been idle for a moment, and queues what it picks.

export class AutonomyDriver {
  private idle = 0;

  constructor(
    private readonly session: GameSession,
    private readonly room: KosRoom,
    private readonly controller: CharacterController,
    private readonly onChoice: (choice: Choice) => void,
  ) {}

  /** `dt` in real seconds; idle time counts faster at higher game speeds. */
  update(dt: number): void {
    const speed = this.session.clock.speed;
    if (speed === 0 || !this.controller.isIdle) {
      this.idle = 0;
      return;
    }
    this.idle += dt * speed;
    if (this.idle < this.session.cfgAutonomy.idleSecondsBeforeActing) return;
    this.idle = 0;
    const p = this.controller.position;
    const candidates: Candidate[] = [];
    for (const inst of this.room.instances.values()) {
      const spot = spotOf(inst);
      const distance = Math.hypot(spot.x - p.x, spot.z - p.z);
      for (const action of inst.def.actions) candidates.push({ instanceId: inst.id, action, distance });
    }
    const choice = chooseAction(this.session, candidates, this.session.character.autonomy, this.session.cfgAutonomy, Math.random());
    if (!choice) return;
    const inst = this.room.instances.get(choice.instanceId);
    if (!inst) return;
    this.controller.enqueue(inst, choice.action, choice.action.ui === 'shop' ? { ...this.session.cfgAutonomy.autoBasket } : undefined, true);
    this.onChoice(choice);
  }
}
