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

## Backend Production Environment

Required backend variables:

- `DJANGO_SECRET_KEY`: strong generated secret.
- `DJANGO_DEBUG`: `False`.
- `DJANGO_ALLOWED_HOSTS`: backend hostnames, comma-separated.
- `DATABASE_URL`: managed PostgreSQL connection string.
- `DJANGO_STATICFILES_STORAGE`: `whitenoise.storage.CompressedManifestStaticFilesStorage`.
- `DJANGO_SERVE_LOCAL_STATIC`: `False`.
- `CSRF_TRUSTED_ORIGINS`: HTTPS backend origins, comma-separated.
- `CORS_ALLOW_ALL_ORIGINS`: `True` for early previews, then replace with explicit origins.

Tenant bootstrap variables for first deploy/demo data:

- `BOOTSTRAP_TENANT_NAME`
- `BOOTSTRAP_TENANT_DOMAIN`
- `BOOTSTRAP_TENANT_ADMIN_EMAIL`
- `BOOTSTRAP_TENANT_ADMIN_PASSWORD`
- `BOOTSTRAP_TENANT_CURRENCY`

Frontend variables:

- `VITE_API_BASE_URL`: deployed backend API root, for example `https://hotelmgmt-backend.onrender.com/api/v1`.

## Vercel Frontend Setup

The repository includes `vercel.json` for the React/Vite frontend.

1. Push the latest commit to GitHub.
2. In Vercel, import the GitHub repository.
3. Keep the project root as the repository root. The `vercel.json` file handles the `frontend/` build path.
4. Set the environment variable:

   ```text
   VITE_API_BASE_URL=https://<render-backend-host>/api/v1
   ```

5. Deploy the frontend.
6. Open the Vercel URL and log in with the Render bootstrap admin.

Vercel build behavior:

- Install command: `npm ci --prefix frontend`
- Build command: `npm run build --prefix frontend`
- Output directory: `frontend/dist`
- SPA routing is handled by rewriting all routes to `index.html`.

## Render Backend Setup

The repository includes `render.yaml` for the backend web service. Use this for the first cloud preview.

1. Push the latest commit to GitHub.
2. In Render, create a PostgreSQL database.
3. Copy the database internal connection string.
4. Create a new Blueprint from this repository, or create a Web Service using `render.yaml`.
5. Set the backend environment variables:

   ```text
   DATABASE_URL=<render-postgres-internal-url>
   BOOTSTRAP_TENANT_NAME=<demo hotel name>
   BOOTSTRAP_TENANT_DOMAIN=<backend-host-or-demo-domain>
   BOOTSTRAP_TENANT_ADMIN_EMAIL=<admin email>
   BOOTSTRAP_TENANT_ADMIN_PASSWORD=<strong admin password>
   BOOTSTRAP_TENANT_CURRENCY=NPR
   ```

6. Confirm these production variables remain set:

   ```text
   DJANGO_DEBUG=False
   DJANGO_STATICFILES_STORAGE=whitenoise.storage.CompressedManifestStaticFilesStorage
   DJANGO_SERVE_LOCAL_STATIC=False
   CORS_ALLOW_ALL_ORIGINS=True
   ```

7. Deploy the backend.
8. Run the production smoke checklist below.

Notes:

- The Render build command installs dependencies and runs `collectstatic`.
- The Render start command applies tenant migrations, bootstraps the public tenant, bootstraps the demo tenant, and starts Gunicorn.
- Keep `BOOTSTRAP_TENANT_ADMIN_PASSWORD` in Render secrets only. Do not commit real credentials.

## Production Smoke Checklist

Run these checks after every first deploy or config change:

1. Backend health returns `200`:

   ```text
   https://<backend-host>/healthz/
   ```

2. Django admin login page loads without a `500`:

   ```text
   https://<backend-host>/admin/login/?next=/admin/
   ```

3. API documentation loads:

   ```text
   https://<backend-host>/api/v1/docs/
   ```

4. Login API returns tokens for the bootstrap admin:

   ```http
   POST https://<backend-host>/api/v1/auth/login/
   {
     "email": "<bootstrap-admin-email>",
     "password": "<bootstrap-admin-password>"
   }
   ```

5. Tenant-scoped API returns data when called with the tenant domain header:

   ```text
   GET https://<backend-host>/api/v1/bookings/rooms/
   Authorization: Bearer <access-token>
   X-Tenant-Domain: <bootstrap-tenant-domain>
   ```

6. Frontend loads and reaches the deployed backend:

   ```text
   https://<frontend-host>/
   ```

7. Frontend login succeeds and dashboard requests return `200`.

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
