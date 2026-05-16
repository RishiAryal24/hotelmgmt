# Hotel Management ERP (Multi-Tenant)

A production-ready starter architecture for a cloud-ready multi-tenant Hotel Management ERP with integrated accounting workflows.

## Architecture

- Backend: Django + Django REST Framework
- Multi-tenancy: PostgreSQL schema-based isolation via `django-tenants`
- Authentication: JWT via `djangorestframework-simplejwt`
- Task queue: Celery + Redis (scaffolded)
- Frontend: React + TypeScript + Vite
- DevOps: Docker and Docker Compose

## Project Structure

- `backend/` - Django project and modular service apps
- `frontend/` - React application scaffold
- `docker-compose.yml` - local Docker development stack

## Backend Features Implemented

- Schema-based tenant registry and workspace creation
- Shared tenant registry with `Tenant` and `Domain`
- Platform user and RBAC skeleton
- Tenant onboarding API endpoint
- Swagger OpenAPI docs under `/api/v1/docs/`

## Frontend Features Implemented

- React + TypeScript starter app
- Basic login and dashboard pages
- Tailwind CSS styling
- React Router and React Query support

## Local Development

### Native Windows scripts with Docker Postgres

These scripts run Django and Vite directly on Windows while using Docker for
Postgres and Redis.

1. Install backend and frontend dependencies:

   ```bash
   cd backend
   python -m pip install -r requirements.txt
   cd ../frontend
   npm install
   ```

2. Start local Postgres and Redis:

   ```cmd
   scripts\start-local-db.cmd
   ```

   If Docker is installed, this starts the `db` and `redis` Compose services.
   If Docker is not installed, the script checks for an existing PostgreSQL
   instance on `127.0.0.1:5432`.

   Postgres is exposed on `127.0.0.1:5432` with:

   - Database: `hotelmgmt`
   - User: `hotelmgmt_user`
   - Password: `hotelmgmt_pass`

   To create that local database/user on a fresh PostgreSQL install:

   ```cmd
   scripts\setup-local-postgres.cmd
   ```

3. Bootstrap schemas and demo data:

   ```cmd
   scripts\bootstrap-local.cmd
   ```

   Local tenant login:

   - Tenant domain: `local.hotel.test`
   - Email: `admin@local.test`
   - Password: `AdminPass12345`

4. Start the backend and frontend:

   ```cmd
   scripts\start-local-all.cmd
   ```

   You can also start them separately with:

   ```cmd
   scripts\start-local-backend.cmd
   scripts\start-local-frontend.cmd
   ```

5. Open:

   - Backend health check: `http://127.0.0.1:8000/healthz/`
   - Swagger docs: `http://127.0.0.1:8000/api/v1/docs/`
   - Frontend: `http://127.0.0.1:5173/`

6. Verify the local checkpoint before starting new work:

   ```cmd
   scripts\verify-local.cmd
   ```

   To skip the frontend production build:

   ```cmd
   scripts\verify-local.cmd -SkipFrontendBuild
   ```

### Full Docker stack

Start all services in Docker:

   ```bash
   docker compose up --build
   ```

## Deployment (Free Tier Options)

### Frontend (Cloudflare Pages)
1. Connect your GitHub repo to Cloudflare Pages
2. Set build settings:
   - Build command: `cd frontend && npm install && npm run build`
   - Build output directory: `frontend/dist`
3. Set environment variable: `VITE_API_BASE_URL=https://your-backend-url.fly.dev/api/v1`

### Backend (Fly.io)
1. Install Fly CLI:
   - macOS/Linux: `curl -L https://fly.io/install.sh | sh`
   - Windows PowerShell: `iwr https://fly.io/install.ps1 -useb | iex`
2. Login: `fly auth login`
3. Create the Fly app if it does not exist yet: `fly apps create hotelmgmt-backend`
4. Create or attach a Postgres database, then set secrets:
   - `fly postgres create --name hotelmgmt-db`
   - `fly postgres attach hotelmgmt-db --app hotelmgmt-backend`
   - `fly secrets set DJANGO_SECRET_KEY=your-secret-key`
5. Deploy from the repository root: `fly deploy`
6. Optional first-run setup:
   - `fly ssh console -C "python manage.py bootstrap_public_tenant --domain hotelmgmt-backend.fly.dev"`
   - `fly ssh console -C "python manage.py seed_rbac"`

### Database (Supabase)
1. Create a free Supabase project
2. Get the connection string from Project Settings > Database
3. Use it as `DATABASE_URL` in Fly.io secrets

### Alternative Database (Neon)
1. Create a free Neon project
2. Get the connection string
3. Use as `DATABASE_URL`

## Environment Variables

- `DJANGO_SECRET_KEY`: Secure random key
- `DATABASE_URL`: Postgres connection string
- `DJANGO_DEBUG`: True for dev, False for prod
- `DJANGO_ALLOWED_HOSTS`: Comma-separated host list
- `VITE_API_BASE_URL`: Frontend API base URL

## VS Code Tasks

Use the workspace tasks defined in `.vscode/tasks.json` to start the backend and frontend services.

## Notes

- PostgreSQL is required for `django-tenants`.
- For local development on Windows, install the Visual C++ build tools if package installation fails.
- Update `.env.example` values or use a dedicated `.env` file for local configuration.
