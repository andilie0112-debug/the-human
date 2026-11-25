import { fmt, t } from '../data/strings';
import type { InterviewQuestion } from '../sim/career';

// Three interview questions with answer choices; resolves with the share (0..1) of the best score.

export function runInterview(jobTitle: string, questions: readonly InterviewQuestion[], rng: () => number): Promise<number> {
  const pool = [...questions];
  const picked: InterviewQuestion[] = [];
  while (picked.length < 3 && pool.length > 0) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const best = picked.reduce((s, q) => s + Math.max(...q.answers.map((a) => a.score)), 0);
  let got = 0;
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'dialog-backdrop';
    document.body.append(back);
    const show = (i: number): void => {
      back.replaceChildren();
      const box = document.createElement('div');
      box.className = 'dialog interview';
      const title = document.createElement('div');
      title.className = 'dialog-title';
      title.textContent = `🤝 ${fmt(t('interview.title'), { job: jobTitle })}`;
      box.append(title);
      if (i >= picked.length) {
        const done = document.createElement('p');
        done.className = 'interview-q';
        done.textContent = t('interview.done');
        const ok = document.createElement('button');
        ok.className = 'btn-primary';
        ok.textContent = 'OK';
        ok.addEventListener('click', () => {
          back.remove();
          resolve(best > 0 ? got / best : 0);
        });
        box.append(done, ok);
        back.append(box);
        return;
      }
      const q = picked[i];
      const n = document.createElement('div');
      n.className = 'phone-small';
      n.textContent = fmt(t('interview.q'), { n: i + 1, total: picked.length });
      const text = document.createElement('p');
      text.className = 'interview-q';
      text.textContent = `“${q.question}”`;
      box.append(n, text);
      // Shuffle the answers so the best one is not always in the same place.
      const answers = [...q.answers].sort(() => rng() - 0.5);
      for (const a of answers) {
        const b = document.createElement('button');
        b.className = 'interview-a';
        b.textContent = a.text;
        b.addEventListener('click', () => {
          got += a.score;
          show(i + 1);
        });
        box.append(b);
      }
      back.append(box);
    };
    show(0);
  });
}
