import { Raycaster, Vector2, type Mesh } from 'three';
import { t } from './data/strings';
import { KOS_LAYOUT, LAYOUTS } from './data/objectCatalog';
import { HumanModel } from './characters/humanModel';
import { createKosRoom } from './home/kosRoom';
import { createRoomView } from './home/roomView';
import { onTap } from './engine/tapInput';
import { CharacterController } from './interaction/characterController';
import type { GameSession, SimEvent } from './sim/session';
import type { ActionDef } from './sim/actions';
import { Phone } from './ui/phone';
import { EventDialog } from './ui/eventDialog';
import { BuildMode } from './ui/buildMode';
import { Outdoor, PLACES } from './world/outdoor';
import { spotOf } from './interaction/characterController';
import { runInterview } from './ui/interviewDialog';
import { createStorage } from './save/saveStorage';
import { simData } from './sim/gameData';
import { lookFor } from './characters/look';
import { toParts } from './sim/time';
import { Hud } from './ui/hud';
import { ActionMenu } from './ui/actionMenu';
import { QueueBar } from './ui/queueBar';
import { ShopDialog } from './ui/shopDialog';
import { NEED_ICONS, ThoughtBubble } from './ui/thoughtBubble';
import { AutonomyDriver } from './interaction/autonomyDriver';
import { NEED_KEYS } from './sim/needs';
import { blockKey } from './ui/actionMenu';
import { AudioEngine, type LoopId } from './engine/audio';
import type { ActionStep } from './sim/actions';
import type { ObjectInstance } from './home/kosRoom';


/** Place kinds where the character can meet new people. */
const SOCIAL_PLACES = new Set(['cafe', 'park', 'gym', 'worship', 'work', 'market']);

/** Starts the home scene for a session (after the character creator, or a loaded save). */
export function startGame(session: GameSession): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  const hudRoot = document.querySelector<HTMLDivElement>('#hud');
  const controlsEl = document.querySelector<HTMLDivElement>('#controls');
  if (!canvas || !hudRoot || !controlsEl) throw new Error('Missing page elements');

  const hud = new Hud(hudRoot, session);
  const storage = createStorage();
  let build: BuildMode | null = null;
  const phone = new Phone(session, storage, () => hud.toast(t('save.saved')), (text) => hud.toast(text), {
    openShop: () => build?.enter('beli'),
    mapPlaces: () => PLACES.map((p) => ({ id: p.id, nameKey: p.nameKey, distance: outdoor ? outdoor.distanceTo(p.id) : 0 })),
    travelTo: (placeId) => {
      if (!outdoor) return;
      if (session.isNyepi()) {
        hud.toast(t('toast.nyepi'));
        return;
      }
      const events = session.travel(outdoor.distanceTo(placeId));
      if (!events) {
        hud.toast(t('block.money'));
        return;
      }
      hud.showEvents(events);
      if (!outdoor.active) goOutside(placeId);
      else outdoor.teleport(placeId);
    },
    showEvents: (events) => hud.showEvents(events),
    startTrip: (action) => {
      const door = room.instances.get('door');
      if (!door || !controller) return;
      if (outdoor?.active) goHome();
      controller.enqueue(door, action);
    },
    reload: () => reloadIntoGame(),
    onMoved: () => reloadIntoGame(),
  });
  // Rebuild everything (new home, new graphics): save, then reload straight into the game.
  function reloadIntoGame(): void {
    void storage.save('auto', session.toSave()).then(() => {
      try {
        sessionStorage.setItem('the-human.autoContinue', '1');
      } catch {
        // Without session storage the player taps Lanjutkan on the menu.
      }
      location.reload();
    });
  }
  hud.onToast = (text) => phone.notify(text, text.startsWith('📩'));
  const eventDialog = new EventDialog(session, () => phone.refresh());
  // A choice that was waiting when the game was saved.
  eventDialog.check();
  const autosave = (): void => {
    void storage.save('auto', session.toSave());
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) autosave();
  });
  // Going to an interview: the commute, the interview itself and the way back.
  const INTERVIEW_ACTION: ActionDef = {
    id: 'go_interview',
    labelKey: 'act.goInterview',
    durationMinutes: 150,
    cost: simData.config.career.transportCostPerTrip * 2,
    ui: 'interview',
    animation: 'away',
    fastForward: true,
    needsPerHour: { sosial: 4 },
    stressPerHour: 3,
  };

  const styleLink = document.createElement('a');
  styleLink.href = './style.html';
  styleLink.textContent = t('m0.styleLink');
  const hint = document.createElement('div');
  hint.className = 'tap-hint';
  hint.textContent = t('hint.tap');
  controlsEl.append(styleLink);
  document.body.append(hint);

  const room = createKosRoom(LAYOUTS[session.home.layoutId] ?? KOS_LAYOUT, session.home.placements, session.character.religionId);
  const audio = new AudioEngine();
  room.onDoor = (opening) => audio.play(opening ? 'doorOpen' : 'doorClose');

  // Mute toggle (remembered on this device).
  const muteBtn = document.createElement('button');
  muteBtn.className = 'mute-btn';
  const renderMute = (): void => {
    muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  };
  renderMute();
  muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    renderMute();
  });
  document.body.append(muteBtn);

  // Autonomy level: Penuh (full), Rendah (only urgent needs), Mati (off).
  const autoBtn = document.createElement('button');
  autoBtn.className = 'auto-btn';
  const AUTO_LEVELS = ['full', 'low', 'off'] as const;
  const renderAuto = (): void => {
    autoBtn.textContent = t(`auto.${session.character.autonomy}`);
  };
  renderAuto();
  autoBtn.addEventListener('click', () => {
    const i = AUTO_LEVELS.indexOf(session.character.autonomy);
    session.character.autonomy = AUTO_LEVELS[(i + 1) % AUTO_LEVELS.length];
    renderAuto();
  });
  document.body.append(autoBtn);
  const bubble = new ThoughtBubble(document.body);
  let autonomy: AutonomyDriver | null = null;
  let urgentTimer = 0;

  /** Which sound loops an activity step makes. */
  function loopsFor(step: ActionStep, inst: ObjectInstance, actionId: string): LoopId[] {
    const loops: LoopId[] = [];
    if (step.prop === 'water') loops.push('water');
    if (step.prop === 'cooking') loops.push('flame', 'sizzle');
    if (step.prop === 'chop') loops.push('chopping');
    if (step.prop === 'warm') loops.push('flame');
    if (step.prop === 'open' && inst.def.model === 'fridge') loops.push('fridgeHum');
    if (step.prop === 'screen') loops.push(inst.def.model === 'tv' ? 'tv' : actionId === 'video_call' ? 'voices' : 'typing');
    if (step.animation === 'lie') loops.push('breath');
    if (step.animation === 'exercise') loops.push('workout');
    if (step.animation === 'eat' || step.prop === 'plate') loops.push('eating');
    return loops;
  }
  const view = createRoomView(canvas, room, Math.hypot(room.layout.width, room.layout.depth) * 0.46);
  build = new BuildMode(session, room, () => {
    for (let i = (controller?.queue.length ?? 0) - 1; i >= 0; i--) controller?.cancel(i);
  }, (text) => hud.toast(text));

  let controller: CharacterController | null = null;
  const queueBar = new QueueBar(hudRoot, (i) => controller?.cancel(i));
  const shop = new ShopDialog(document.body, session, simData.items);
  const menu = new ActionMenu(document.body, session, (inst, action, religion) => {
    // Places in the neighborhood.
    if (inst.id.startsWith('place:')) {
      const placeId = inst.id.slice('place:'.length);
      if (action.ui === 'enterHome') {
        goHome();
        return;
      }
      if (action.ui === 'map') {
        phone.openApp('peta');
        return;
      }
      if (action.ui === 'shopNow') {
        shop.payNowLabel = true;
        shop.open((list) => {
          if (!session.buyNow(list, action.priceFactor ?? 1)) return;
          audio.play('pay');
          refreshFridge();
          if (session.startAction(action, inst.id)) outdoor?.startedPlaceAction(placeId);
        }, action.priceFactor ?? 1);
        return;
      }
      if (session.actionBlock(action, religion)) return;
      if (!session.startAction(action, inst.id)) return;
      outdoor?.startedPlaceAction(placeId);
      if (action.ui === 'interview') {
        const app = session.career.interviewNow();
        if (app) {
          const speed = session.clock.speed;
          session.clock.speed = 0;
          void runInterview(session.career.jobData(app.jobId).title, simData.interviewQuestions, Math.random).then((share) => {
            session.career.attendInterview(app.id, share);
            session.clock.speed = speed === 0 ? 1 : speed;
          });
        }
      }
      return;
    }
    if (action.ui === 'shop') {
      shop.payNowLabel = false;
      shop.open((list) => {
        audio.play('pay');
        controller?.enqueue(inst, action, list);
      });
    } else {
      controller?.enqueue(inst, action);
    }
  });

  // --- Going out and coming home -----------------------------------------------------------
  let outdoor: Outdoor | null = null;
  const goOutside = (placeId = 'kos'): void => {
    if (!charModel || !controller) return;
    if (session.isNyepi()) {
      hud.toast(t('toast.nyepi'));
      return;
    }
    for (let i = controller.queue.length - 1; i >= 0; i--) controller.cancel(i);
    session.cancelAction();
    outdoor ??= new Outdoor(session, view, charModel, {
      openMenu: (inst, extra, religion) => menu.open(inst, window.innerWidth / 2, window.innerHeight * 0.6, extra, religion),
      enterHome: () => goHome(),
      toast: (text) => hud.toast(text),
    });
    outdoor.enter(placeId);
    audio.setLoops([]);
  };
  const goHome = (): void => {
    if (!outdoor || !charModel) return;
    outdoor.exit();
    room.scene.add(charModel.root);
    charModel.root.visible = true;
    charModel.root.position.y = 0;
    const door = room.instances.get('door');
    const spot = door ? spotOf(door) : { x: 0, z: 0 };
    charModel.root.position.set(spot.x, 0, spot.z);
    charModel.root.rotation.set(0, Math.PI, 0);
    charModel.play('Idle_Loop');
  };

  /** Shows what is in the fridge (one model per item unit). */
  function refreshFridge(): void {
    const units: { color: string; shape: string }[] = [];
    for (const [id, n] of session.inventory.list()) {
      const def = simData.items.find((i) => i.id === id);
      if (def) for (let k = 0; k < n; k++) units.push({ color: def.color, shape: def.shape });
    }
    room.setFridgeContents(units);
  }
  refreshFridge();

  void HumanModel.load(lookFor(session.character)).then((model) => {
    model.censorCamera = view.camera;
    model.root.position.set(-0.45, 0, 1.6);
    model.root.rotation.y = Math.PI;
    room.scene.add(model.root);
    controller = new CharacterController(session, room, model, {
      notify: (block) => {
        if (block) hud.toast(t(blockKey(block)));
      },
      onQueueChange: () => {
        queueBar.render(controller?.queue ?? []);
        refreshFridge();
      },
      itemColor: (id) => simData.items.find((i) => i.id === id)?.color,
      onStepChange: (step, inst, actionId) => {
        audio.setLoops(step && inst && actionId ? loopsFor(step, inst, actionId) : []);
        if (step?.prop === 'open' && inst?.def.model === 'fridge') audio.play('fridgeOpen');
        if (step?.prop === 'flush') audio.play('flush');
        if (step?.prop === 'open' && inst && inst.def.model !== 'fridge') audio.play('doorOpen');
      },
      onFootstep: () => audio.play('footstep'),
      onAway: (item) => {
        if (item.action.ui === 'goOutside') {
          session.cancelAction();
          controller?.cancel(0);
          goOutside();
          return;
        }
        if (item.action.ui !== 'interview') return;
        const app = session.career.interviewNow();
        if (!app) return;
        const speed = session.clock.speed;
        session.clock.speed = 0;
        void runInterview(session.career.jobData(app.jobId).title, simData.interviewQuestions, Math.random).then((share) => {
          session.career.attendInterview(app.id, share);
          session.clock.speed = speed === 0 ? 1 : speed;
        });
      },
    });
    charModel = model;
    autonomy = new AutonomyDriver(session, room, controller, (choice) => bubble.show(NEED_ICONS[choice.reason] ?? '💭'));
  });
  let charModel: HumanModel | null = null;

  // Tap: an object opens its action menu, the floor is a walk command.
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  onTap(canvas, (x, y) => {
    if (menu.isOpen) return;
    if (build?.active) {
      ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, view.camera);
      const objHit = raycaster.intersectObjects(room.pickables.filter((o) => o.visible && o.parent?.visible !== false && !o.userData.floor), false)[0];
      const floorHit = raycaster.intersectObjects(room.pickables.filter((o) => o.userData.floor), false)[0];
      build.handleTap(objHit ? ((objHit.object as Mesh).userData.instanceId as string | undefined) : undefined, floorHit ? { x: floorHit.point.x, z: floorHit.point.z } : null);
      return;
    }
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, view.camera);
    const hits = raycaster.intersectObjects(room.pickables.filter((o) => o.visible && o.parent?.visible !== false), false);
    const hit = hits[0];
    if (!hit) return;
    const id = (hit.object as Mesh).userData.instanceId as string | undefined;
    const inst = id ? room.instances.get(id) : undefined;
    if (inst) {
      menu.open(inst, x, y, inst.def.id === 'front_door' ? session.doorActions(INTERVIEW_ACTION) : []);
      hint.hidden = true;
    } else if ((hit.object as Mesh).userData.floor) {
      controller?.walkTo({ x: hit.point.x, z: hit.point.z });
      hint.hidden = true;
    }
  });

  let night: boolean | null = null;
  view.start((dt, realDt) => {
    const events = session.tick(realDt);
    if (events.length > 0) {
      hud.showEvents(events);
      if (events.some((e) => e.kind === 'newDay')) {
        autosave();
        phone.refresh();
      }
      if (events.some((e) => e.kind === 'salary' || e.kind === 'thr')) audio.play('pay');
      else if (events.some((e) => e.kind === 'bill' || e.kind === 'sick' || e.kind === 'burnout' || e.kind === 'shoppingDone' || (e.kind === 'newDay' && (e.holidays.length > 0 || e.ramadanStart)))) audio.play('notify');
      controller?.handleEvents(events);
      outdoor?.handleEvents(events);
      if (events.some((e) => e.kind === 'lifeEvent')) {
        audio.play('notify');
        eventDialog.check();
      }
      // Meeting new people at social places, and coworkers on a new job.
      const met: SimEvent[] = [];
      for (const e of events) {
        if (e.kind === 'actionDone' && e.objectInstanceId.startsWith('place:')) {
          const kind = PLACES.find((p) => `place:${p.id}` === e.objectInstanceId)?.kind;
          if (kind && SOCIAL_PLACES.has(kind)) {
            const n = session.meetSomeone(kind === 'work' ? 'rekan' : 'kenalan');
            if (n) met.push({ kind: 'met', name: n.name });
          }
        }
        if (e.kind === 'hired') {
          for (let i = 0; i < 2; i++) {
            const n = session.meetSomeone('rekan', true);
            if (n) met.push({ kind: 'met', name: n.name });
          }
        }
      }
      if (met.length) hud.showEvents(met);
      // Body composition changes overnight.
      if (charModel && events.some((e) => e.kind === 'newDay')) charModel.setBodyShape(session.character.body.muscle, session.character.body.fat);
    }
    hud.update(dt);

    const hour = toParts(session.clock.minutes).hour;
    const isNight = hour < 6 || hour >= 18;
    if (isNight !== night) {
      night = isNight;
      room.setNight(isNight);
    }

    if (events.some((e) => e.kind === 'shoppingDone')) refreshFridge();

    if (outdoor?.active) {
      outdoor.update(dt, realDt, isNight);
      if (charModel && outdoor.camera) bubble.update(charModel.root, outdoor.camera);
      return;
    }
    room.update(dt, controller && charModel?.root.visible ? controller.position : null, controller?.frontDoorOpen ?? false);
    if (!controller || !charModel) return;
    if (session.clock.speed === 0) charModel.update(dt);
    else controller.update(dt);
    autonomy?.update(realDt);

    // A very low need shows its icon every few seconds, even with autonomy off.
    urgentTimer -= realDt;
    if (urgentTimer <= 0) {
      urgentTimer = 6;
      const v = session.character.vitals.needs;
      const worst = NEED_KEYS.reduce((a, b) => (v[a] <= v[b] ? a : b));
      if (v[worst] < 20) bubble.show(NEED_ICONS[worst], 2.5);
    }
    bubble.update(charModel.root, view.camera);
  });

  // Test hook for the Playwright smoke test (only with ?debug).
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { __game: unknown }).__game = {
      session,
      room,
      view,
      get controller() {
        return controller;
      },
      get character() {
        return charModel;
      },
      /** Screen position (CSS px) of an object's centre, for simulated taps. */
      screenOf(id: string, y = 0.4) {
        const inst = room.instances.get(id);
        if (!inst) return null;
        const v = inst.group.position.clone();
        v.y = y;
        v.project(view.camera);
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
      },
    };
  }
}
