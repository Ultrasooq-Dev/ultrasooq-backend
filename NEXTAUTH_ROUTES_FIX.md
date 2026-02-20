# NextAuth Routes Backend Fix

## Issue
The backend was receiving and logging 404 errors for NextAuth routes (`/api/auth/*`) that should be handled by the Next.js frontend.

## Changes Made

### 1. Added Route Handlers (`src/app.controller.ts`)
Added specific route handlers for NextAuth endpoints:
- `/api/auth/error` - Handles NextAuth error redirects
- `/api/auth/callback/:provider` - Handles OAuth callbacks

These routes now return a proper 404 response instead of throwing exceptions.

### 2. Updated Logging Interceptor (`src/common/interceptors/logging.interceptor.ts`)
Added `/api/auth` to the list of paths to skip logging, preventing these routes from being logged to the database.

### 3. Updated Exception Filter (`src/common/filters/http-exception.filter.ts`)
Modified the exception filter to skip error logging for NextAuth routes, preventing error logs from cluttering the system.

## Result
- NextAuth routes that accidentally hit the backend are now handled gracefully
- No more error logs for these routes
- Cleaner backend logs
- Proper 404 responses returned

## Note
These routes should ideally never hit the backend - they should be handled by the Next.js frontend server. However, if they do (due to misconfiguration or network issues), they're now handled gracefully without causing log noise.

## Testing
After restarting the backend, try accessing:
- `http://localhost:3000/api/auth/error` - Should return 404 JSON response
- `http://localhost:3000/api/auth/callback/google` - Should return 404 JSON response

These should no longer appear as errors in the backend logs.
