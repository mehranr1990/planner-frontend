# Mehran Planner

Personal, project, team and company planning. Next.js (App Router) · React · TypeScript · Tailwind CSS v4.

The visual source of truth is `design/` (the final Personal package: see the root `CLAUDE.md` and `design/PERSONAL.md`). The boards are reference only; production code lives in `src/`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:3000 — app shell at `/personal` · `/projects` · `/teams` · `/companies`; docs at `/styleguide` (foundations), `/styleguide/components`, `/styleguide/navigation` |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route type generation + `tsc --noEmit` |
| `npm test` | Vitest unit and component tests |
| `npm run test:e2e` | Playwright: builds, serves on :3210, writes screenshots to `e2e/screenshots/` |
| `npm run audit:prod` | `npm audit` for production dependencies only (the release gate) |

If the Playwright browser download is blocked, use an installed browser: `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` (or `msedge`).

## Layout

- `src/styles/` — `tokens.css` (app font/motion overrides + semantic layer; primitives come from `design/tokens.css`, imported first by `globals.css`), Tailwind theme, typography, global utilities
- `src/design-system/` — reusable visual language: token metadata, surfaces, feedback, motion
- `src/components/ui/` — accessible primitives on Radix (forms, overlays, menus, toast, calendar/date picker, display)
- `src/components/feedback/` — inline alerts and empty / loading / error / no-results / unavailable states
- `src/components/navigation/` — rail, context switcher, chips, mobile bottom nav, breadcrumbs (rendering only)
- `src/components/shell/` — app shell frame and composition (top bar islands, schedule island, palette, menus, mobile chrome)
- `src/features/navigation/` — declarative context + nav config; active state derived from the URL
- `src/app/(app)/` — shell route group; context overview pages are Step 3 placeholders
- `src/fixtures/` — clearly marked sample data (shell schedule, workspaces)
- `src/features/` — domain UI (`preferences`, `styleguide`; product modules arrive in later steps). Display preferences live in the `mp-preferences` cookie and are resolved on the server (`request-preferences.ts`); theme stays in next-themes' localStorage.
- `src/lib/` — pure utilities: dates (Jalali/Gregorian, Iranian week), digits, money, direction
- `src/messages/` — next-intl catalogues (`en`, `fa`); `src/i18n/request.ts` resolves the locale from the cookie (no locale routing)
