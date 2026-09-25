# Bloub

`engine/` is vendored from [jeremy-prt/bloub](https://github.com/jeremy-prt/bloub)
(MIT, © 2026 Jérémy Perret, see `LICENSE`), commit `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`:
`src/bot/*.ts` without tests, plus `src/ui/gaze.ts`. The files are unchanged apart from import
paths. The numbers in them are measurements; do not round them (see the upstream README).

`Bloub.tsx` is our React renderer, a port of upstream `BloubBot.vue` without the timeline and
export features. To update: copy the same files from a newer commit and run `pnpm typecheck`.
