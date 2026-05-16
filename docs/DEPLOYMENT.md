# Development Deployment Strategy

## Goal

Deploy the application during development on free or low-friction platforms while preserving the same architecture shape we will later use in production:

- React frontend
- Django REST backend
- PostgreSQL
- Redis-compatible cache/queue
- Celery-ready background jobs
- Docker-ready services

Free platforms are appropriate for development, demos, internal testing, and stakeholder previews. They should not be treated as production infrastructure for paying hotel or restaurant tenants.

## Recommended Free Development Setup

### Option A: Render All-In-One Preview

Best for the simplest dev preview.

Use Render for:

- Frontend static site
- Django backend web service
- Free PostgreSQL database
- Free Redis-compatible Key Value instance

Pros:

- Simple dashboard.
- Supports Python web services.
- Supports static frontend deploys.
- Supports Postgres and Redis-compatible Key Value.
- Good fit for preview deployments.

Important limits:

- Free Postgres expires after 30 days.
- Free Redis-compatible Key Value is in-memory only and can lose data on restart.
- Free web services can spin down and restart.
- Not suitable for production tenant data.

Recommended use:

- Demo branches.
- Short-lived previews.
- Early stakeholder testing.

### Option B: Vercel + Render/Neon + Upstash

Best developer experience for frontend-heavy iteration.

Use:

- Vercel for React frontend.
- Render free web service for Django backend, or another free Python host.
- Neon or Supabase for free PostgreSQL.
- Upstash Redis for Redis-compatible caching/light queue use.

Pros:

- Excellent frontend deployments.
- Easy preview URLs per branch.
- Managed Postgres can survive better than short-lived preview databases, depending on provider limits.
- Upstash works well for lightweight Redis-style development workloads.

Important limits:

- Cross-provider networking adds configuration complexity.
- Free database/storage limits are small.
- Celery workers may need a backend host that supports background workers, or we run worker behavior locally until paid infrastructure.

Recommended use:

- Frontend preview workflows.
- API demos.
- Lightweight tenant onboarding tests.

### Option C: Railway Trial

Best for a quick integrated trial, not long-term free hosting.

Use Railway for:

- Backend
- Frontend
- PostgreSQL
- Redis

Important limits:

- Free trial includes limited credits and is time/usage constrained.
- After trial, free monthly credit is small.
- Not ideal for long-running development environments with multiple services.

Recommended use:

- Short experiments.
- Quick demo environments.

## Recommended Choice For This Project

Use this path:

1. Local development: Docker Compose.
2. Free shared dev preview: Render.
3. Frontend preview optimization later: Vercel.
4. Database alternative if Render Postgres expiry becomes annoying: Neon or Supabase.
5. Redis alternative if Render Key Value resets are painful: Upstash.

## Suggested Development Environments

### Local

Current local development uses the installed Windows PostgreSQL service and helper scripts. Docker Compose remains available as a future/containerized option, but the current low-friction path is:

```powershell
.\scripts\bootstrap-local.cmd
.\scripts\start-local-all.cmd
```

Local app URLs:

- Frontend: `http://127.0.0.1:5173/`
- Backend health: `http://127.0.0.1:8000/healthz/`

Demo login:

- Email: `admin@local.test`
- Password: `AdminPass12345`
- Tenant domain: `local.hotel.test`

Purpose:

- Daily development.
- Migration testing.
- Tenant schema testing.
- Integration tests.

### Cloud Dev

- Render web service for backend.
- Render static site for frontend.
- Render Postgres.
- Render Key Value.

Purpose:

- Shareable demo URL.
- Super Admin tenant onboarding demos.
- UI review.
- API smoke tests.

### Cloud Preview With Longer-Lived Database

- Vercel frontend.
- Render backend.
- Neon or Supabase Postgres.
- Upstash Redis.

Purpose:

- Better frontend previews.
- Longer-lived database experimentation.
- Public demos without local setup.

## Free-Tier Caveats

Do not store important tenant data on free development infrastructure.

Expect:

- Sleep/cold starts.
- Limited storage.
- Limited bandwidth.
- No production SLA.
- Possible database expiration or pausing.
- Redis/cache data loss.
- Limited logs and observability.
- Limited background worker support.

## Production Migration Path

When ready for real customers:

1. Move PostgreSQL to a managed production database.
2. Move Redis to managed persistent Redis/Valkey.
3. Run Django backend as a paid web service or container service.
4. Run Celery workers separately.
5. Add object storage for media.
6. Add Sentry and structured logging.
7. Add backups and restore testing.
8. Add custom domains and HTTPS.

Recommended production V1:

- AWS ECS/Fargate or DigitalOcean App Platform.
- Managed PostgreSQL.
- Managed Redis/Valkey.
- S3-compatible object storage.
- NGINX or platform-managed routing.
