# CampusX

## Overview

CampusX is a full-stack campus community app for LASU Ojo students. It features a vibrant dark theme with hot-pink/orange gradients and glassmorphism. Students can post campus gist in the Feed, browse and list student services in the "Earn Legally" marketplace, manage their academic profile with privacy controls, and receive real-time push notifications.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/campusx)
- **API framework**: Express 5 (artifacts/api-server)
- **Auth**: Clerk (managed by Replit) — email/password + Google/GitHub
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Real-time**: Server-Sent Events (SSE) via in-memory `sse-manager.ts`

## Key Features

- **Auth**: Clerk auth with session persistence; personal emails (Gmail/Yahoo)
- **Onboarding**: Profile form with Full Name, Level (100L–500L), Faculty, Enrollment Status, Campus (default: LASU Ojo), and Matriculation Number (private)
- **Privacy**: Matriculation number is private — only visible on the user's own profile (/profile)
- **Feed**: Campus gist posts with 🔥 Fire / 🧢 NoCap reactions; all students can post and interact
- **Earn Legally**: Marketplace for student services (tutoring, design, coding, etc.) with categories + WhatsApp CTA
- **Profile**: Own profile (/profile) — dual tabs (Gist History / Active Hustles), private section (matric + enrollment), Edit Profile modal, Sign Out. Public profile (/profile/:userId) — Verified Student badge, same dual tabs, no private data.
- **Notifications**: Real-time SSE toast + bell dropdown. Triggers: 🔥 fire reaction, 🧢 nocap reaction, 💰 WhatsApp interest click. Persisted in `notifications` table — survives logout/login. Pop sound on arrival.

## Campus Data

- Default campus: LASU Ojo
- Faculties: Arts, Science, Law, Social Sciences, Education, Engineering, Management Sciences, Communication & Media Studies
- Levels: 100L–500L

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- After codegen: fix `lib/api-zod/src/index.ts` → `export * from "./generated/api"` and `lib/api-client-react/src/index.ts` → export both generated files + custom-fetch exports
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run typecheck:libs` — rebuild composite libs after codegen (required before leaf typechecks)

## DB Schema

- `users` — student profiles (includes private matric_number)
- `posts` — feed posts
- `post_likes` — like (🔥) join table
- `post_nocaps` — no cap (🧢) join table
- `services` — Earn Legally marketplace listings
- `notifications` — persisted notification history (userId, type, actorName, message, isRead, createdAt)

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page (signed-out hero) or redirect to /feed |
| `/sign-in` | Clerk sign-in (branded) |
| `/sign-up` | Clerk sign-up (branded) |
| `/onboarding` | Profile completion after first sign-up |
| `/feed` | Campus gist feed (auth required) |
| `/earn` | Earn Legally marketplace (auth required) |
| `/profile` | Current user's private profile + logout |
| `/profile/:userId` | Another student's public profile |

## API Endpoints

All under `/api`:
- `GET/PUT /users/me` — current user profile (includes private matric number)
- `GET /users/:userId` — public profile (no matric, includes isVerified)
- `GET /users/:userId/posts` — user's post history
- `GET /users/:userId/services` — user's active services
- `GET/POST /posts` — feed
- `POST /posts/:postId/like` — toggle 🔥 fire reaction + notify author
- `POST /posts/:postId/nocap` — toggle 🧢 nocap reaction + notify author
- `GET/POST /services` — marketplace
- `PATCH/DELETE /services/:serviceId` — manage own services
- `POST /services/:serviceId/whatsapp-click` — track WhatsApp interest, notify provider
- `GET /notifications` — list current user's notifications
- `PATCH /notifications/read` — mark all as read
- `GET /notifications/stream` — SSE stream for real-time push (cookie auth)
- `GET /stats/feed` — feed stats by faculty
- `GET /stats/marketplace` — marketplace stats by category

## Architecture Decisions

- SSE uses cookie-based Clerk auth (EventSource sends cookies automatically); in-memory `sse-manager.ts` maps clerkUserId → Set<Response>
- Notification triggers are fire-and-forget (`.catch(() => {})`) so they never block reaction responses
- `providerIsVerified` and `isVerified` are computed server-side from `matricNumber` presence — the actual matric number is never sent to public API callers
- Zod cannot be imported as `zod/v4` in api-server (no direct dep) — use plain JS parsing or import from @workspace/api-zod

## Notes

- Orval generates stale barrel references after each codegen run — always re-fix both barrels manually after running codegen.
- After fixing barrels, run `pnpm run typecheck:libs` to rebuild composite libs before checking leaf artifacts.
