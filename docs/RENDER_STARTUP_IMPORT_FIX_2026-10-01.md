# Render startup import fix — 2026-10-01

## Incident
Render built the Phase 1 repository successfully but the API process exited during startup:

```text
SyntaxError: The requested module './index.ts' does not provide an export named 'SetupError'
```

## Root cause
`SetupError` is declared in `services/api/src/setup.ts` but `services/api/src/http.ts` imported it from `./index.ts`. The barrel module exports the setup functions, but not the `SetupError` class.

## Fix
`http.ts` now imports `SetupError` directly from `./setup.ts`. This removes the invalid named export dependency and avoids making the runtime error class part of the public barrel contract.

## Frontend cleanup
Public setup/error copy was also cleaned so ordinary users see product language rather than implementation-phase terminology.

## Verification
- `setup.ts` parses under Node's experimental TypeScript runtime.
- `http.ts` import wiring has been statically corrected to the module that actually exports `SetupError`.
- Full dependency installation/build was not run in this sandbox because the repository has no installed `node_modules` and external package download is unavailable here.
