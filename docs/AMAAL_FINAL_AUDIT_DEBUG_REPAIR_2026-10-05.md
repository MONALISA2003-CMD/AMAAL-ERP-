# Amaal final audit, debug and repair — 2026-10-05

## Live failures found

1. Password recovery was calling an obsolete recovery endpoint. The current production flow now uses the email-code recovery methods, and the user's reset was confirmed successful.
2. Sign-in accepted the credentials but failed immediately afterward when Amaal loaded the account record. The affected request was `GET /api/amaal/v1/me`, returning HTTP 500. The old server code queried the managed authentication schema and also depended on a database enum aggregation. The repaired server now uses the already-authenticated business roles plus business-owned account tables.
3. A Finance page imported loan-partner functions that did not exist. It now uses the available loan-provider functions.
4. A Sales page had an accidental product field rename. It has been restored to the correct product variant field.
5. Several employee-facing screens contained internal development or infrastructure wording. The visible copy has been reviewed and translated into ordinary business language.

## Release rule

The ZIP contains source only. Business products and records are not removed. Password data is never edited directly in the application database.
