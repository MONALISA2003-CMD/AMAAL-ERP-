# Amaal ERP — Frontend Runtime / Build Fixes (2026-10-03)

## Issue 1 — Root page redirect fallback

The production Vercel build completed successfully, but `/` rendered the fallback message:

> Amaal is taking a moment to load. Please try again.

The API setup-status endpoint was healthy and returned `stage=ACTIVATED`.

## Root cause

`apps/web/app/page.tsx` called Next.js `redirect()` inside a `try/catch` block. Next.js implements `redirect()` by throwing an internal redirect signal. The catch block intercepted that signal and rendered the loading/error fallback instead of allowing the redirect to `/login` or `/setup` to complete.

## Fix

The setup-status request remains inside `try/catch`, while `redirect()` executes only after a successful request and outside the catch block.

## Expected behavior

- `GET /` + setup stage `ACTIVATED` → redirect to `/login`
- `GET /` + setup stage other than `ACTIVATED` → redirect to `/setup`
- setup-status request failure → render the retry fallback

## Issue 2 — Next.js prerender failure from `useSearchParams()`

A subsequent Vercel build failed during prerendering of `/access-pending` with:

`useSearchParams() should be wrapped in a suspense boundary at page "/access-pending"`

## Root cause

`apps/web/app/access-pending/page.tsx` was a client page that directly called `useSearchParams()`. Next.js production prerendering requires a Suspense boundary for this client-side URL search-parameter bailout.

## Fix

The page is now a server component that renders a `<Suspense>` boundary around `apps/web/app/access-pending/content.tsx`, where `useSearchParams()` remains isolated to the client component.

The same pattern was proactively applied to `/signup`, which also uses `useSearchParams()`, preventing the same production-build failure from surfacing on the next route after `/access-pending`.

## Validation basis

- Vercel build log identified the `/access-pending` Suspense requirement at prerender time.
- All active `useSearchParams()` usages are now contained in client content components rendered beneath explicit Suspense boundaries.
