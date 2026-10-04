# Restricted Neon identity for Python intelligence

The Python intelligence service should use a separate database principal from `amaal-api`.

Required access:

- read Stage 7 reporting read models
- write only Stage 9/9.5 ML-derived tables
- no write access to products, IMEI units, inventory movements, sales, payments, commissions, recovery, approvals, users or authorization tables

An operator template is provided in `database/operations/amaal_intelligence_role.sql`. The template deliberately does not create a password-bearing login in a migration because the secret must be supplied through the deployment secret manager.

The privilege boundary should be verified with negative SQL tests before production activation.
