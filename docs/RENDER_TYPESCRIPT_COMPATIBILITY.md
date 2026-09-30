# Render TypeScript compatibility

The workspace keeps TypeScript 6 under the `typescript` package name because Next.js and other tooling may consume the JavaScript compiler API. TypeScript's official 6/7 transition package is `@typescript/typescript6`.

The native TypeScript 7 compiler is installed separately as `@typescript/native`, which provides the `tsc` executable for direct command-line type checking.

This separation avoids pinning the nonexistent `typescript@6.0.0` release and avoids relying on prereleases.
