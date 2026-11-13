# Midterm Study Guides

Fall 2026 midterm guides: Data Mining (CEN376), Artificial Intelligence (CEN352), Computer Networks.

- `/` home page with all guides
- `/data-mining`, `/ai`, `/networks`; add `#test` (full test), `#play` (quick quiz) or `#cards` (flashcards)

No dependencies. Sounds and music are synthesized in the browser (fx.js); toggles are in the top bar. Run locally with `npm start` (port 3000, or `PORT`).

## Deploy on Railway
1. Push this folder to a new GitHub repo.
2. Railway: New → GitHub Repo → pick it. It detects Node and runs `npm start`.
3. Settings → Networking → Generate Domain to test it, then move `llokum.bet` over
   (remove it from the llokum service first, add it here, update the DNS CNAME).

## Progress features (all stored per device, no accounts)
- Daily review (spaced repetition), weak spots, topic mastery: `public/progress.js`
- XP, levels, a daily goal of 20, day streaks and badges
- Midterm countdown: students set their own date on each course page, or put the
  real dates in `EXAMS` at the top of `public/progress.js` so everyone gets them.
- Add `#review` to a course URL to open the daily review directly.
