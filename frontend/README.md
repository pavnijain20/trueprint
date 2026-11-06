# TruePrint frontend

## Run locally

From this directory, install dependencies and start the development server:

```sh
npm install
npm run dev
```

Vite prints the local URL when the server is ready.

Set `VITE_API_URL` in a frontend `.env` file to the backend base URL (for example, copy `.env.example`). The review button sends drafts to `${VITE_API_URL}/review`.

## Build and preview

```sh
npm run lint
npm run build
npm run preview
```

The production build is written to `dist/`. Deploy the contents of that folder to any static web host configured to serve the SPA entry point (`index.html`) for client-side routes.

## Demo roles

Choose a role at login, or switch roles from the top bar without logging out.

- **Author** — review findings, compare draft changes, and comment for the reviewer.
- **Reviewer** — review findings, comment, and request changes.
- **Approver** — resolve high-severity findings, review changes, comment, and approve or request changes.
- **Admin** — use the full review flow, plus the Knowledge Base and Insights pages.

## Demo data and storage

Users, drafts, comments, decisions, and guidelines are mock data bundled with the frontend. Draft AI review can optionally use the backend configured with `VITE_API_URL`; seeded findings remain available if it is not configured. Draft edits, finding decisions, comments, and approvals are local to the current page session. The selected demo role and Quick start dismissal are stored in browser `localStorage`.
