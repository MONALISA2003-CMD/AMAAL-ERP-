# Amaal web application

The web app uses Neon Auth for sign-in and the Render API for all Amaal business operations. The browser never receives database credentials and never becomes the authority for roles, inventory, sales or approvals.

CEO/Admin access uses an additional Amaal TOTP verification layer. The MFA assertion is held only in the current browser session and is sent to the API as `x-amaal-mfa-assertion`.
