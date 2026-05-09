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

1. Install backend and frontend dependencies:

   ```bash
   cd backend
   python -m pip install -r requirements.txt
   cd ../frontend
   npm install
   ```

2. Start Docker services:

   ```bash
   docker compose up --build
   ```

3. Open:

   - Backend API: `http://localhost:8000/api/v1/`
   - Swagger docs: `http://localhost:8000/api/v1/docs/`
   - Frontend: `http://localhost:5173/`

## VS Code Tasks

Use the workspace tasks defined in `.vscode/tasks.json` to start the backend and frontend services.

## Notes

- PostgreSQL is required for `django-tenants`.
- For local development on Windows, install the Visual C++ build tools if package installation fails.
- Update `.env.example` values or use a dedicated `.env` file for local configuration.
