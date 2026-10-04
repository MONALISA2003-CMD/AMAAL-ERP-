# Vercel infrastructure status — Stage 9.5 baseline

Vercel is the browser/presentation boundary for Amaal:

- Next.js / React / TypeScript
- authenticated PWA client
- SEO/static/catalog presentation where appropriate
- report, AI and intelligence UI
- no direct authoritative database writes

## Runtime boundary

```text
Vercel / Next.js
      ↓
Amaal authentication/session
      ↓
Render API
      ↓
Amaal authorization + business services
      ↓
Neon PostgreSQL
```

The AI and Python intelligence services are not public browser endpoints.

The current `amaal-erp` Vercel project targets Node 24. The release gate requires a committed lockfile, frozen installation and a successful Next.js build/typecheck before production promotion.
