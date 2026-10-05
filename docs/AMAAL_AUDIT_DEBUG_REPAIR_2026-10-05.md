# Amaal audit, debug and repair — 2026-10-05

This release fixes the production issues found during live debugging:

- Password recovery uses the current email-code flow and the reset was confirmed successful.
- Sign-in is repaired by removing the account-access database query that could fail after authentication.
- Finance imports now match the available payment-provider functions.
- Sales uses the correct product variant field.
- Employee screens use simple business language instead of implementation terminology.
- Automated checks cover recovery, imports, user-facing wording, sales field integrity and account-access queries.

No products or business records are removed by this repair.
