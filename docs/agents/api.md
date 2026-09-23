# Agent notes — API

## API

Base: `/api/v1/` · Pagination: `?skip=0&limit=20` · Sort: `?sort_by=created_at&sort_order=desc`

Roles: `admin` (full) · `seller` (products/orders) · `buyer` (browse/purchase)

Auth: POST `/api/v1/auth/login` → httpOnly cookies → auto on requests → `/auth/refresh` on expiry → `/auth/logout` clears
