# Amaal ERP — Frontend Runtime Fix (2026-10-03)

## Issue

The production Vercel build completed successfully, but `/` rendered the fallback message:

> Amaal is taking a moment to load. Please try again.

The API setup-status endpoint was healthy and returned `stage=ACTIVATED`.

## Root cause

`apps/web/app/page.tsx` called Next.js `redirect()` inside a `try/catch` block. Next.js implements `redirect()` by throwing an internal redirect signal. The catch block intercepted that signal and rendered the loading/error fallback instead of allowing the redirect to `/login` or `/setup` to complete.

## Fix

The setup-status request remains inside `try/catch`, while `redirect()` now executes only after a successful request and outside the catch block.

## Expected behavior

- `GET /` + setup stage `ACTIVATED` → redirect to `/login`
- `GET /` + setup stage other than `ACTIVATED` → redirect to `/setup`
- setup-status request failure → render the retry fallback

## Validation basis

The Vercel production deployment inspected on 2026-10-03 showed:

- build completed successfully;
- `/api/amaal/v1/setup/status` returned HTTP 200 with `stage=ACTIVATED`;
- `/api/amaal/health` returned HTTP 200;
- `/api/amaal/ready` returned HTTP 200 with the database check `ok`;
- `/api/auth/get-session` returned HTTP 200.

The runtime issue was isolated to the homepage redirect/catch control flow.
