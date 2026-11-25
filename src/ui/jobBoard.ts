import { fmt, t, tDynamic } from '../data/strings';
import type { Application, JobData } from '../sim/career';
import type { GameSession } from '../sim/session';
import { rupiah } from './format';

// Looking for work away from the phone: the job board (papan lowongan) at the market and the
// office, asking in person at a shop or warung, and the monthly job fair at the mall. Each job
// shows its requirements (education, SKCK, skills); walk-ins and the fair interview on the spot.

export interface JobHooks {
  toast: (text: string) => void;
  /** Runs the interview dialog for an application that is interviewing now. */
  interview: (app: Application) => void;
}

function dialog(title: string): { back: HTMLElement; box: HTMLElement; close: () => void } {
  const back = document.createElement('div');
  back.className = 'dialog-backdrop';
  const box = document.createElement('div');
  box.className = 'dialog store-dialog';
  const h = document.createElement('div');
  h.className = 'dialog-title';
  h.textContent = title;
  box.append(h);
  back.append(box);
  document.body.append(back);
  return { back, box, close: () => back.remove() };
}

/** "Syarat: S1 · SKCK · logika 2" for a job. */
export function requirementText(job: JobData): string {
  const skills = Object.entries(job.requiredSkills)
    .map(([k, v]) => ` · ${tDynamic(`skill.${k}`)} ${v}`)
    .join('');
  return fmt(t('job.req'), { edu: job.minEducation, skck: job.needsSkck ? t('job.reqSkck') : '', skills });
}

function jobCard(session: GameSession, parent: HTMLElement, job: JobData, company: string, salary: number, action: { label: string; onClick: () => void } | null): void {
  const card = document.createElement('div');
  card.className = 'phone-card';
  const title = document.createElement('div');
  title.className = 'phone-card-title';
  title.textContent = `${job.title} · ${company}`;
  const info = document.createElement('div');
  info.className = 'phone-small';
  info.textContent = `${fmt(t('job.salary'), { salary: rupiah(salary) })} · ${requirementText(job)}`;
  card.append(title, info);
  const block = session.career.requirementBlock(job);
  if (block) {
    const note = document.createElement('div');
    note.className = 'phone-small';
    note.textContent = `⚠️ ${fmt(tDynamic(`job.block.${block}`), { edu: job.minEducation })}`;
    card.append(note);
  }
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn-primary';
    b.textContent = action.label;
    b.addEventListener('click', action.onClick);
    card.append(b);
  }
  parent.append(card);
}

export function showJobBoard(session: GameSession, hooks: JobHooks): void {
  const c = session.career;
  const d = dialog(t('job.board'));
  for (const l of c.boardListings) {
    const job = c.jobData(l.jobId);
    const applied = c.hasApplied(l.id);
    jobCard(session, d.box, job, l.company, l.salary, applied ? null : {
      label: t('job.apply'),
      onClick: () => {
        c.apply(l.id);
        hooks.toast(`📨 ${t('job.applied')}: ${job.title}`);
        d.close();
        showJobBoard(session, hooks);
      },
    });
  }
  const close = document.createElement('button');
  close.className = 'btn-secondary';
  close.textContent = t('store.back');
  close.addEventListener('click', d.close);
  d.box.append(close);
}

/** Asking at a place whether they need someone; an opening means an interview right away. */
export function askForJob(session: GameSession, placeKind: string, company: string, hooks: JobHooks): void {
  const c = session.career;
  const jobs = c.walkInJobs(placeKind);
  // Not every visit finds an opening (about half the time).
  const job = jobs.length && session.chance(0.5) ? jobs[0] : null;
  const d = dialog(`🙋 ${t('act.askJob')}`);
  const p = document.createElement('p');
  p.textContent = job ? fmt(t('job.walkInYes'), { job: job.title }) : t('job.walkInNo');
  d.box.append(p);
  if (job) {
    jobCard(session, d.box, job, company, 0, {
      label: t('job.interviewNow'),
      onClick: () => {
        const app = c.walkIn(job.id, company, 'walkin');
        d.close();
        if (app) hooks.interview(app);
        else hooks.toast(fmt(tDynamic(`job.block.${c.requirementBlock(job) ?? 'education'}`), { edu: job.minEducation }));
      },
    });
  }
  const close = document.createElement('button');
  close.className = 'btn-secondary';
  close.textContent = t('store.back');
  close.addEventListener('click', d.close);
  d.box.append(close);
}

export function showJobFair(session: GameSession, hooks: JobHooks): void {
  const c = session.career;
  const now = session.clock.minutes;
  if (!c.isJobFair(now)) {
    hooks.toast(t('job.notFair'));
    return;
  }
  const d = dialog(t('job.fair'));
  for (const s of c.fairStands(now)) {
    const job = c.jobData(s.jobId);
    jobCard(session, d.box, job, s.company, 0, {
      label: t('job.interviewNow'),
      onClick: () => {
        const app = c.walkIn(job.id, s.company, 'bursa');
        d.close();
        if (app) hooks.interview(app);
        else hooks.toast(fmt(tDynamic(`job.block.${c.requirementBlock(job) ?? 'education'}`), { edu: job.minEducation }));
      },
    });
  }
  const close = document.createElement('button');
  close.className = 'btn-secondary';
  close.textContent = t('store.back');
  close.addEventListener('click', d.close);
  d.box.append(close);
}
