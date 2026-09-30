# Amaal Release Manifest

This package preserves the approved source specifications and all project Markdown/documentation files.

The ZIP synchronization workflow treats the ZIP as an input package and deletes it after extraction. Documentation already present in the repository is preserved when a future ZIP omits a Markdown/Word documentation file; a newer file in the ZIP replaces the older same-path version.

Current infrastructure state: Supabase core schema applied; RLS pending explicit approval; Vercel and Render not provisioned yet.
