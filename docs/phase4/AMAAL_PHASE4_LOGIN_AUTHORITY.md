# Amaal ERP — Phase 4 Login Authority

The identity-creation hierarchy is a hard security boundary, not a UI convention.

| Actor | May create/invite |
|---|---|
| CEO | Admins only |
| Admin | Regional Managers, Managers, Team Leaders, Agents, Shop Owners |
| Regional Manager | Managers, Recovery Officers within the assigned region |
| Manager | Team Leaders within managed teams |
| Team Leader | Agents and Shop Owners within the assigned team |

Admins may not directly recruit Recovery Officers.

The backend enforces the hierarchy in both the application authorization layer and the database invitation-authority trigger. UI restrictions are supplemental only.

Admin invitations require an approved Admin profile key. Organizational scope must not be attached to a CEO-created Admin identity.
