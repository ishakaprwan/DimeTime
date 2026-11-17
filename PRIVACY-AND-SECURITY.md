## DimeTime privacy and security : development draft
DimeTime processes account email/name, password hashes, user-entered finance records, academic records, schedules and settings to provide budgeting and academic planning. It does not require bank account connections. Academic profiles are stored in PostgreSQL as JSONB, associated with an authenticated account. Browser data may exist locally until cleared.

## Access and security
Protected API endpoints use bearer-token authentication. Financial and academic data must be filtered by the authenticated account; this needs independent verification for every route. Passwords are hashed with bcrypt. Use HTTPS, strong JWT secrets, database TLS, minimal server logging, and production-grade distributed rate limiting before public deployment. Never commit .env files.

## Deletion and retention
DELETE /api/auth/me requires a valid token and password confirmation. Linked database records with foreign-key cascades are deleted. Database backups, infrastructure logs and provider snapshots may persist according to provider policies. **No backup deletion timeframe is promised or configured by this update.** Before launch, establish and publish specific retention schedules with your hosting providers, and verify all tables cascade correctly.

## UK privacy notice requirements before public launch
Identify the controller/contact; lawful bases; data categories and purposes; hosting locations and international transfers; processors; actual retention periods; user rights (access, correction, erasure, restriction, objection and portability as applicable); complaint route to the ICO; and whether automated decisions occur. This file is a developer draft, **not** a published or legally reviewed privacy notice.

## Migration
Browser academic data is imported only after account-specific confirmation. A legacy unscoped browser store must not be silently attributed to an account. Test with two separate accounts on the same browser before real-user use.

## Tests to perform
Attempt cross-account reads/updates/deletes on each API route; verify failed JWTs and expired sessions; check logout/login on shared browsers; test rejecting and accepting academic import; confirm account deletion removes linked rows; confirm API errors reveal no secrets. Automated coverage is not included in this update.