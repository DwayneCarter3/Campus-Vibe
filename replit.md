# CampusX

## Overview

CampusX is a full-stack campus community app for LASU Ojo students. It features a vibrant dark theme with hot-pink/orange gradients and glassmorphism. Students can post campus gist in the Feed, browse and list student services in the "Earn Legally" marketplace, and manage their academic profile with privacy controls.

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

## Key Features

- **Auth**: Clerk auth with session persistence; personal emails (Gmail/Yahoo)
- **Onboarding**: Profile form with Full Name, Level (100L–500L), Faculty, Enrollment Status, Campus (default: LASU Ojo), and Matriculation Number (private)
- **Privacy**: Matriculation number is private — only visible on the user's own profile (/profile)
- **Feed**: Campus gist posts with likes; all students can post and interact
- **Earn Legally**: Marketplace for student services (tutoring, design, coding, etc.) with categories
- **Profile**: Avatar in nav links to /profile which shows all private details including Matric number
- **Logout**: Sign Out button on the /profile page

## Campus Data

- Default campus: LASU Ojo
- Faculties: Arts, Science, Law, Social Sciences, Education, Engineering, Management Sciences, Communication & Media Studies
- Levels: 100L–500L

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec (note: fix lib/api-zod/src/index.ts to only export from `./generated/api` after running)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## DB Schema

- `users` — student profiles (includes private matric_number)
- `posts` — feed posts
- `post_likes` — like join table
- `services` — Earn Legally marketplace listings

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
- `GET /users/:userId` — public profile (no matric number)
- `GET/POST /posts` — feed
- `POST /posts/:postId/like` — toggle like
- `GET/POST /services` — marketplace
- `PATCH/DELETE /services/:serviceId` — manage own services
- `GET /stats/feed` — feed stats by faculty
- `GET /stats/marketplace` — marketplace stats by category

## Notes

- Orval generates `lib/api-zod/src/index.ts` with stale references after each codegen run — manually fix it to only contain `export * from "./generated/api"` after running codegen.
