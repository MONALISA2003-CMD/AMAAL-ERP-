# Amaal access recovery and user-language repair — 2026-10-05

The password-recovery flow uses the current email-code recovery methods, keeps the recovery URL compatible, and translates technical failures into plain-language messages.

The application interface was reviewed for developer-facing terminology. Business users see simple language about their work, access, security, records, approvals, and reports. Technical implementation details remain in source code and diagnostics rather than normal screens.

Email delivery remains dependent on the active account-email service used by the managed authentication service. The application now guides users to check their inbox and spam/junk folder and can request a fresh code with a short resend delay.
