# Bot Automation App

A React application for managing automation tasks with user authentication and form submissions.

## Features
- User authentication system with role-based access (ADMIN, AVSEC, PK-PPK, BANGLAND, LISTRIK)
- Form management for action plans and submissions
- Bootstrap UI with responsive design
- Environment variable configuration for user credentials

## Tech Stack
- **Frontend**: React 18 with Vite
- **UI Framework**: Bootstrap 5.3.8
- **Styling**: Custom CSS + Bootstrap classes
- **State Management**: React hooks
- **Build Tool**: Vite with HMR
- **Linting**: ESLint

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
4. Fill in the application login and E-Kinerja credentials in `.env`
5. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Configuration

Environment variables prefixed with `VITE_` are available to browser code.

### Application Login

- The frontend checks `VITE_LOGIN_USERNAME` and `VITE_LOGIN_PASSWORD` from the project-root `.env` file.
- This is a client-side check, not a security boundary: these values are included in the browser bundle and can be discovered by users. Do not use it to protect sensitive data or operations.
- The backend can be selected as either the existing PHP endpoints or the Node.js API with `VITE_API_BACKEND=php|node`. PHP remains available as a fallback.

### E-Kinerja Account Configuration

The frontend uses account identifiers to populate the Unit/Kategori/Pengguna selectors. Keep identifiers in the `VITE_USER_{UNIT}_{CATEGORY}_{NAME}_USERNAME` format.

Store passwords in the project-root `.env` using the server-only `BOT_USER_{UNIT}_{CATEGORY}_{NAME}_PASSWORD` format. Replace the sample entry and add matching identifiers/passwords for each account configured in `src/data/userData.js`. Existing `VITE_USER_*_PASSWORD` values are still read server-side during migration, but should be renamed and must never be referenced from frontend code.

After adding, saving, or submitting an action plan, the active user's action-plan page is refreshed using the existing server-side E-Kinerja session and cookies, without another login. Changing accounts logs out the previous E-Kinerja session before a fresh login. If logout returns HTTP 500, the local E-Kinerja session and cookies are cleared and mapping continues; the remote session might remain active until it expires. Other logout failures stop mapping so the user can retry. If the active session expires, refresh reports an error instead of silently logging in again. PHP mode still requires PHP to write to its configured temporary directory. Nginx should disable `fastcgi_intercept_errors` for PHP API requests so JSON errors are not replaced by an error page.

Mapping loads in stages: the selected backend logs in and returns the raw `dataList` assignment and server date, JavaScript selects the SKP whose period includes that date, and the backend fetches its action-plan page. If no SKP or multiple SKPs are active, mapping stops with an error. The dashboard and month selectors show only months within the selected period, and additions begin at its first month. JavaScript parses and validates the page data before the session is ready for submissions. Session cookies and CSRF tokens are kept server-side rather than included in the mapping protocol. The selected numeric ID is checked against the current session's SKP source; access to the requested SKP also depends on E-Kinerja's authorization. Deploy the frontend and the selected API backend together because the mapping endpoint uses this staged protocol.

Preview compares each displayed indicator's action-plan text with the same indicator in the previous calendar month of the selected SKP period. Empty or missing plans and conflicting previous-month entries are reported as unavailable rather than identical. The first month of a period has no comparison reference. Whitespace differences, zero-width spaces, and canonically equivalent Unicode characters are ignored; other text differences remain significant.

The mapping response also includes the raw `skp` and `pegawai` objects for the progress dashboard. These objects may contain personal information beyond the fields displayed, and are accessible in the browser; the frontend login is not an access-control boundary.

Example:
```env
VITE_LOGIN_USERNAME=change-this
VITE_LOGIN_PASSWORD=change-this
VITE_USER_ADMIN_PNS_EXAMPLE_USERNAME=example
BOT_USER_ADMIN_PNS_EXAMPLE_PASSWORD=change-this
```

### User Structure

The application supports 5 organizational units:
- **ADMIN** (7 users: 6 PNS, 1 PPPK)
- **AVSEC** (14 users: 5 PNS, 9 PPPK)  
- **PK-PPK** (15 users: 9 PNS, 6 PPPK)
- **BANGLAND** (7 users: 5 PNS, 2 PPPK)
- **LISTRIK** (11 users: 4 PNS, 7 PPPK)

## Security

- Application login is checked in the frontend and must not be treated as secure access control.
- E-Kinerja passwords are read by the selected backend from server environment variables or the project-root `.env`; they are not sent in browser requests.
- Keep `.env` outside the web document root and never commit it. The checked-in `.env.example` contains placeholders only.

## Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Commit local changes and push to GitHub
npm run push
```

## Project Structure

```
src/
├── components/          # React components
├── data/               # Data configuration (now using env vars)
├── config/             # API configuration
├── assets/             # Static assets
├── App.jsx             # Main application component
└── main.jsx            # Application entry point
server/                  # Node.js API and E-Kinerja client
```

## API Integration

### Selecting the backend

Set `VITE_API_BACKEND` in the project-root `.env`:

- `php` (default): use the existing endpoints in `public/`.
- `node`: use the Node API routes under `/api/` (for example, `/api/get_mapping`) and keep the PHP files intact.

For Node mode, `VITE_NODE_API_BASE_URL` defaults to `/api`. During development, run the API and frontend in separate terminals:

```bash
npm run api
npm run dev
```

Vite proxies `/api` requests to `http://127.0.0.1:4001`. The Node API defaults to port `4001` and can be configured with `NODE_API_PORT`; update the Vite proxy and production reverse proxy if a different port is used. It uses the same server-side `BOT_USER_*_PASSWORD` environment variables as PHP and requires the Tesseract OCR executable to be installed and available on `PATH` (or configured with `TESSERACT_PATH`) for E-Kinerja captcha recognition.

For production, route `/api/` to the Node API and serve the frontend from the configured origin. Set `NODE_API_CORS_ORIGINS` to the exact frontend origin(s), set a long random `SESSION_SECRET`, and enable secure cookies behind HTTPS (`COOKIE_SECURE=true`; set `TRUST_PROXY=true` when TLS terminates at a trusted reverse proxy). The default Express in-memory session store is intended for testing or a single Node process; use a persistent shared session store before running multiple instances or relying on sessions across restarts.

Setting `NODE_API_CORS_ORIGINS=*` allows every origin. The API reflects the request origin instead of returning a literal `*` so credentialed browser requests can work. This is unsafe: untrusted sites may be able to access the API using a user's session. Prefer an explicit origin allowlist.

Node mode can also use a separate API origin by setting `VITE_NODE_API_BASE_URL` to that origin's `/api` base URL and adding the frontend origin to `NODE_API_CORS_ORIGINS`. The frontend sends credentials only when Node mode is selected.

For Isi Rencana Aksi, the selected month's RHK entries each produce three parallel requests. Both backends report success only when all `RHK × 3` requests receive an HTTP 2xx response with JSON `status: true`. Network errors and HTTP 5xx responses are retried up to five times after the initial attempt; other failures are reported without automatic retry. The result shows the final success count and each retry attempt. A successful response confirms the remote API response, not an independent read-back of the saved data.

Run `npm test` for the JavaScript test suite and `php -n tests/ekinLogout.test.php` for the retained PHP logout test.
