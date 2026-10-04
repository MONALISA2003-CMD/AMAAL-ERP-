# Amaal dependency locking policy

Production and CI builds must use:

- Node 24.x
- pnpm 12.7.x
- committed `pnpm-lock.yaml`
- `pnpm install --frozen-lockfile`

The Python intelligence service must use:

- Python 3.13 for the current deployment image
- exact top-level versions recorded in `services/intelligence/requirements.lock`
- a committed `uv.lock` once network-capable dependency resolution is available

The current offline implementation intentionally does not fabricate a pnpm or uv lockfile. CI fails closed until the real lockfiles are committed. This avoids giving a false sense of reproducibility.
