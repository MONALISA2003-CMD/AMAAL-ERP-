# Amaal MFA Implementation Status

## Requirement source

The approved Amaal specifications require MFA for CEO and Admin accounts only. Other operational roles use secure authentication/session controls unless Amaal later changes the policy.

## Implemented

- Supabase Auth TOTP MFA is the factor provider.
- Server authentication verifies the user through Supabase Auth and reads the verified JWT `aal` claim.
- `/v1/me` exposes current assurance level and whether the caller is a privileged role.
- CEO/Admin ERP operations are rejected at the API boundary unless `aal2` is present.
- The Next.js client routes privileged users at `aal1` to the MFA screen before rendering ERP operations.
- The MFA screen supports TOTP enrollment and challenge/verification using the current Supabase Auth MFA APIs.

## Security boundary

Client routing is only a user-experience layer. The Render API remains the authoritative privileged-operation gate. A CEO/Admin cannot bypass the requirement by navigating directly to an ERP route.

## Source policy preserved

No MFA requirement has been added to Agents, Shop Owners, Team Leaders, Managers, Regional Managers or Recovery Officers beyond the approved baseline.
