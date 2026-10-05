# Amaal final repair manifest — 2026-10-05

## Included
- Current password recovery using the email-code recovery methods supported by the installed authentication library.
- `/forgot-password`, `/reset-password`, and `/password-reset`.
- Friendly recovery messages, resend control, and inbox/spam guidance.
- Employee-facing screens reviewed to remove development and infrastructure terminology.
- Repository validator updated for the GitHub → Vercel source-of-truth architecture.
- CI checks for password recovery, user-facing language, deployment architecture, and accidental committed ZIP files.

## Not included
- No application products or business data are deleted.
- No password hashes are edited directly in the database.
- No authentication secret is placed in source control.

## Email delivery
The app can request a recovery code and receives a successful response from the managed authentication service. Actual delivery still depends on the email service configured for that account. The recovery screen guides the user to check spam/junk and request a fresh code.
