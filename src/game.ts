import { Box3, Raycaster, Vector2, type Mesh } from 'three';
import { fmt, t, tDynamic } from './data/strings';
import { KOS_LAYOUT, LAYOUTS } from './data/objectCatalog';
import { HumanModel } from './characters/humanModel';
import { createKosRoom } from './home/kosRoom';
import { createRoomView } from './home/roomView';
import { createSurroundings } from './home/surroundings';
import { Interior } from './world/interior';
import { StoreVisit } from './ui/storeVisit';
import { showArrest } from './ui/arrestDialog';
import { FacilityVisit } from './ui/facilityVisit';
import { askForJob, showJobBoard, showJobFair } from './ui/jobBoard';
import type { FacilityKind } from './world/spaces/facility';
import { cityLabels } from './world/cityLook';
import { onTap } from './engine/tapInput';
import { CharacterController } from './interaction/characterController';
import type { GameSession, SimEvent } from './sim/session';
import type { ActionDef } from './sim/actions';
import { Phone } from './ui/phone';
import { EventDialog } from './ui/eventDialog';
import { Visit } from './ui/visit';
import { Weather } from './world/rain';
import { Tutorial, tutorialDone } from './ui/tutorial';
import { KidsAtHome } from './characters/kids';
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
import { NEED_KEYS, needStatus } from './sim/needs';
import { StatusMarker } from './characters/statusMarker';
import { contactShadow } from './home/contactShadow';
import { blockKey } from './ui/actionMenu';
import { ONE_SHOTS, getAudio, type LoopId, type OneShotId } from './engine/audio';
import { Ambience } from './engine/ambience';
import { Adzan, type AdzanWhere } from './engine/adzan';
import { speak } from './engine/voice';
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
  const audio = getAudio();
  const ambience = new Ambience(audio);
  const adzan = new Adzan(audio, `${import.meta.env.BASE_URL}assets/audio/adzan.mp3`);
  const adzanWhere = (): AdzanWhere => (facilityVisit?.inMosque ? 'mosque' : interior?.active ? 'inside' : outdoor?.active ? 'street' : 'home');
  // Welcome music when arriving home.
  audio.playMusic('welcome');
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
    if (step.animation === 'worship') {
      const religion = inst.def.religion ?? session.character.religionId;
      loops.push(religion === 'islam' ? 'murmur' : religion === 'kristen' || religion === 'katolik' ? 'hymn' : 'chant');
    }
    return loops;
  }
  const view = createRoomView(canvas, room, Math.hypot(room.layout.width, room.layout.depth) * 0.46);
  // The street, the houses next door and the neighbours, visible from home.
  const surroundings = createSurroundings(room.scene, room.layout);
  // Rain around the house (never inside it) and puddles in the yard and the street.
  const hw = room.layout.width / 2;
  const hd = room.layout.depth / 2;
  const homePuddles: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < 12; i++) homePuddles.push({ x: (Math.random() - 0.5) * 18, z: hd + 1.5 + Math.random() * 6, r: 0.4 + Math.random() * 0.8 });
  const homeWeather = new Weather(room.scene, homePuddles, 0.2, false);
  homeWeather.exclude = { x0: -hw - 0.3, z0: -hd - 0.3, x1: hw + 0.3, z1: hd + 0.3 };
  // Children living at home.
  const kids = new KidsAtHome(room.scene, room, () => session.character);
  kids.sync(session.children);
  build = new BuildMode(session, room, () => {
    for (let i = (controller?.queue.length ?? 0) - 1; i >= 0; i--) controller?.cancel(i);
  }, (text) => hud.toast(text));

  let controller: CharacterController | null = null;
  // Neighbours and friends dropping by.
  const visit = new Visit({
    session,
    room,
    player: () => charModel,
    stopPlayer: () => {
      for (let i = (controller?.queue.length ?? 0) - 1; i >= 0; i--) controller?.cancel(i);
    },
    showEvents: (events) => hud.showEvents(events),
    toast: (text) => hud.toast(text),
  });
  const queueBar = new QueueBar(hudRoot, (i) => controller?.cancel(i));
  const shop = new ShopDialog(document.body, session, simData.items);
  /** Place actions with their own screen: job board, job fair, asking for work, buying now. */
  const placeUi = (placeId: string, action: ActionDef): void => {
    const place = PLACES.find((p) => p.id === placeId);
    if (action.ui === 'jobBoard') return showJobBoard(session, jobHooks);
    if (action.ui === 'jobFair') return showJobFair(session, jobHooks);
    if (action.ui === 'askJob') return askForJob(session, place?.kind ?? '', cityLabels(session.city)[placeId] ?? tDynamic(place?.nameKey ?? 'place.warung'), jobHooks);
    if (action.ui === 'shopNow') {
      shop.payNowLabel = true;
      shop.open((list) => {
        if (!session.buyNow(list, action.priceFactor ?? 1)) return;
        audio.play('pay');
        refreshFridge();
        if (session.startAction(action, `place:${placeId}`) && !interior?.active) outdoor?.startedPlaceAction(placeId);
      }, action.priceFactor ?? 1);
    }
  };
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
      if (action.ui === 'enterStore') {
        enterStore(placeId);
        return;
      }
      if (action.ui === 'jobBoard' || action.ui === 'jobFair' || action.ui === 'askJob') return placeUi(placeId, action);
      if (action.ui === 'enterCafe' || action.ui === 'enterWorship' || action.ui === 'enterPlace') {
        enterFacility(placeId, action.ui === 'enterCafe' ? 'cafe' : action.ui === 'enterWorship' ? 'worship' : 'walkin');
        return;
      }
      if (action.ui === 'enterHospital' || action.ui === 'enterStation' || action.ui === 'enterAirport') {
        enterFacility(placeId, action.ui === 'enterHospital' ? 'hospital' : action.ui === 'enterStation' ? 'station' : 'airport');
        return;
      }
      if (action.ui === 'shopNow') return placeUi(placeId, action);
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

  // --- Inside places (minimarket) ----------------------------------------------------------
  let interior: Interior | null = null;
  let store: StoreVisit | null = null;
  const enterStore = (placeId: string): void => {
    if (!charModel || !outdoor) return;
    interior ??= new Interior(view, charModel, (zone) => (store?.active ? store.onZone(zone) : facilityVisit?.onZone(zone)));
    store ??= new StoreVisit(session, simData.items, interior, {
      toast: (text) => hud.toast(text),
      sound: (id) => audio.play(id),
      speak: (text, gender) => speak(text, { gender, muted: audio.muted }),
      onLeave: () => outdoor?.enter(storePlace),
    });
    storePlace = placeId;
    outdoor.exit();
    const betamart = placeId === 'betamart';
    store.start(betamart ? t('place.betamart') : t('city.minimarket'), betamart ? '#6c3483' : '#d35400', betamart ? 0.98 : 1);
    audio.play('doorOpen');
  };
  let storePlace = 'minimarket';
  let facilityVisit: FacilityVisit | null = null;
  const getFacility = (): FacilityVisit | null => {
    if (!charModel) return null;
    if (facilityVisit) return facilityVisit;
    interior ??= new Interior(view, charModel, (zone) => (store?.active ? store.onZone(zone) : facilityVisit?.onZone(zone)));
    facilityVisit = new FacilityVisit(session, interior, {
      toast: (text) => hud.toast(text),
      speak: (text) => speak(text, { gender: 'female', muted: audio.muted }),
      sound: (id) => audio.play(id),
      onLeave: (away) => {
        outdoor?.enter(storePlace);
        if (!away) return;
        // Off on the trip, or staying in hospital: time away from home.
        goHome();
        const door = room.instances.get('door');
        if (door && controller) controller.enqueueAwayNow(door, away);
      },
      character: () => charModel,
      placeUi,
      loops: (ids) => audio.setLoops(ids),
    });
    return facilityVisit;
  };
  const enterFacility = (placeId: string, kind: FacilityKind): void => {
    if (!charModel || !outdoor) return;
    const facility = getFacility();
    if (!facility) return;
    storePlace = placeId;
    outdoor.exit();
    const labels = cityLabels(session.city);
    const place = PLACES.find((p) => p.id === placeId);
    const flights = [session.mudikInfo().region, ...session.trips.filter((tr) => (tr.mode ?? 'pesawat') === 'pesawat').map((tr) => tr.destination)];
    facility.start(kind, labels[placeId] ?? tDynamic(place?.nameKey ?? placeId), placeId, {
      variant: place?.kind,
      actions: place?.actions,
      religion: (place as { religion?: string } | undefined)?.religion,
      destinations: flights,
    });
  };

  // An interview on the spot (walk-in or job fair): the usual three questions.
  const jobHooks = {
    toast: (text: string) => hud.toast(text),
    interview: (app: { id: string; jobId: string }) => {
      const speed = session.clock.speed;
      session.clock.speed = 0;
      void runInterview(session.career.jobData(app.jobId).title, simData.interviewQuestions, Math.random).then((share) => {
        session.career.attendInterview(app.id, share);
        session.clock.speed = speed === 0 ? 1 : speed;
        hud.toast(t('job.offerSoon'));
      });
    },
  };

  /** Says hello (voice when the device has Indonesian speech, always as a toast). */
  function greet(back: boolean): void {
    const c = session.character;
    const h = toParts(session.clock.minutes).hour;
    const key = back ? 'greet.back' : h < 11 ? 'greet.morning' : h < 15 ? 'greet.day' : h < 19 ? 'greet.evening' : 'greet.night';
    const line = fmt(tDynamic(key), { name: c.name.split(' ')[0] });
    hud.toast(`🗣️ ${c.name.split(' ')[0]}: "${line}"`);
    speak(line, { gender: c.gender, muted: audio.muted });
    hud.showTasks();
  }

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
      sound: (id) => audio.play(id),
      onArrest: () => {
        void showArrest(session).then((jail) => {
          if (!jail) {
            hud.toast(t('crime.released'));
            return;
          }
          // Taken away: the sentence runs like time away from home.
          goHome();
          const door = room.instances.get('door');
          if (door && controller) controller.enqueueAwayNow(door, jail);
          hud.toast(t('crime.jailed'));
        });
      },
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
    greet(true);
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
    // Sound cues from worship movements (bells, genta, gong).
    model.onCue = (cue) => {
      if ((ONE_SHOTS as readonly string[]).includes(cue)) audio.play(cue as OneShotId);
    };
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
        // Off to work: show the shift at the workplace (office, factory floor or counter).
        if (item.action.id === 'go_work' && session.career.job) {
          const job = session.career.job;
          const workplace = session.career.jobData(job.jobId).workplace;
          if (workplace) getFacility()?.startWork(workplace, job.company);
          return;
        }
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
    // The root is scaled to the character's height: keep the marker a fixed size, just above the head.
    const sc = model.root.scale.x || 1;
    const top = new Box3().setFromObject(model.root).max.y;
    marker.root.scale.setScalar(1 / sc);
    marker.root.userData.baseY = (top - model.root.position.y + 0.32) / sc;
    model.root.add(marker.root);
    // The character greets the player, and today's tasks open.
    window.setTimeout(() => greet(false), 1200);
    const feet = contactShadow(0.45, 0.35, 0.4);
    feet.scale.setScalar(1 / sc);
    model.root.add(feet);
    autonomy = new AutonomyDriver(session, room, controller, (choice) => bubble.show(NEED_ICONS[choice.reason] ?? '💭'));
  });
  let charModel: HumanModel | null = null;
  // Status triangle above the character (green / orange / red).
  const marker = new StatusMarker();

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
      floorTapped = true;
      hint.hidden = true;
    }
  });

  let night: boolean | null = null;
  let hudTimer = 0;
  // First game: a short guided start (not in automated test runs).
  let walked = 0;
  let floorTapped = false;
  let lastPos: { x: number; z: number } | null = null;
  const tutorial = !tutorialDone() && !new URLSearchParams(location.search).has('debug')
    ? new Tutorial({
        floorTapped: () => floorTapped,
        walked: () => walked,
        menuOpen: () => menu.isOpen,
        queued: () => controller?.queue.some((q) => !q.autonomous) ?? false,
        needsOpen: () => hud.cardTapped,
        phoneOpen: () => phone.isOpen,
        outside: () => outdoor?.active ?? false,
      })
    : null;
  view.start((dt, realDt) => {
    const events = session.tick(realDt);
    if (events.length > 0) {
      hud.showEvents(events);
      // A house finished on the family land: rebuild the scene around the new home.
      if (events.some((e) => e.kind === 'houseBuilt')) reloadIntoGame();
      if (events.some((e) => e.kind === 'newDay')) {
        autosave();
        phone.refresh();
      }
      if (events.some((e) => e.kind === 'salary' || e.kind === 'thr')) audio.play('pay');
      else if (events.some((e) => e.kind === 'bill' || e.kind === 'sick' || e.kind === 'burnout' || e.kind === 'shoppingDone' || (e.kind === 'newDay' && (e.holidays.length > 0 || e.ramadanStart)))) audio.play('notify');
      // End of the shift: back from the workplace to the front door, then walk in.
      if (facilityVisit?.atWork && events.some((e) => e.kind === 'actionDone' && e.actionId === 'go_work') && charModel) {
        facilityVisit.endWork();
        view.setOverride(null);
        document.body.classList.remove('outside');
        room.scene.add(charModel.root);
        charModel.root.position.set(room.outside.x, 0, room.outside.z);
        hud.toast(t('work.done'));
      }
      controller?.handleEvents(events);
      outdoor?.handleEvents(events);
      for (const e of events) if (e.kind === 'visit' && !outdoor?.active && !interior?.active) visit.knock(e.npcId);
      for (const e of events) {
        if (e.kind !== 'adzan') continue;
        adzan.play(adzanWhere());
        hud.toast(fmt(t('adzan.toast'), { name: tDynamic(`adzan.name.${e.name}`) }));
      }
      if (events.some((e) => e.kind === 'family')) {
        kids.sync(session.children);
        audio.play('bell');
        phone.refresh();
      }
      if (events.some((e) => e.kind === 'birthday' || e.kind === 'retired')) {
        audio.play('bell');
        phone.refresh();
      }
      if (events.some((e) => e.kind === 'delivery')) {
        audio.play(outdoor?.active || interior?.active ? 'notify' : 'knock');
        phone.refresh();
      }
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
    if (tutorial && charModel) {
      const r = charModel.root.position;
      if (lastPos && outdoor?.active) walked += Math.min(1, Math.hypot(r.x - lastPos.x, r.z - lastPos.z));
      lastPos = { x: r.x, z: r.z };
      tutorial.update(realDt);
    }
    hudTimer -= realDt;
    if (hudTimer <= 0) {
      hudTimer = 0.2;
      queueBar.setProgress(session.progress()?.fraction ?? null);
      hud.setCardVisible(!outdoor?.active && !interior?.active);
      const w = session.weatherNow();
      session.outdoors = (outdoor?.active ?? false) && !outdoor?.inCar;
      ambience.setRain(interior?.active ? w.intensity * 0.3 : w.intensity);
      if (adzan.sounding) adzan.setWhere(adzanWhere());
      homeWeather.set(w.intensity, false);
    }

    const hour = toParts(session.clock.minutes).hour;
    const isNight = hour < 6 || hour >= 18;
    if (isNight !== night) {
      night = isNight;
      room.setNight(isNight);
      homeWeather.resetSky();
    }

    if (events.some((e) => e.kind === 'shoppingDone')) refreshFridge();

    marker.setStatus(needStatus(session.character.vitals));
    marker.update(dt);

    const tp = toParts(session.clock.minutes);
    ambience.update(realDt, tp.hour + tp.minute / 60, outdoor?.active ?? false);

    if ((interior?.active || outdoor?.active) && visit.active) visit.cancel();
    if (interior?.active) {
      interior.update(dt);
      if (facilityVisit?.active) facilityVisit.update();
      if (charModel && interior.camera) bubble.update(charModel.root, interior.camera);
      return;
    }
    if (outdoor?.active) {
      outdoor.update(dt, realDt, isNight);
      if (charModel && outdoor.camera) bubble.update(charModel.root, outdoor.camera);
      return;
    }
    room.update(dt, controller && charModel?.root.visible ? controller.position : null, (controller?.frontDoorOpen ?? false) || visit.doorOpen);
    surroundings.update(dt);
    homeWeather.update(dt, 0, 0);
    kids.update(dt);
    visit.update(dt, view.camera);
    if (!controller || !charModel) return;
    if (session.clock.speed === 0) charModel.update(dt);
    else controller.update(dt);
    if (!visit.active) autonomy?.update(realDt);

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
      get outdoor() {
        return outdoor;
      },
      enterStore: (id: string) => enterStore(id),
      knock: (npcId: string) => visit.knock(npcId),
      syncKids: () => kids.sync(session.children),
      enterFacility: (id: string, kind: FacilityKind) => enterFacility(id, kind),
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
