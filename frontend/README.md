# TruePrint frontend

## Run locally

From this directory, install dependencies and start the development server:

```sh
npm install
npm run dev
```

Vite prints the local URL when the server is ready.

The frontend defaults to the live API at `https://trueprint-api-iciu.onrender.com`. Set `VITE_API_URL` in a frontend `.env` file to override it.

Drafts and review workflows use these backend endpoints:

- `GET /api/drafts` and `GET /api/drafts/{id}` load drafts and detail data.
- `POST /api/drafts/{id}/review` runs an AI review.
- `PATCH /api/drafts/{id}` saves draft content.
- `PATCH /api/findings/{id}` updates one finding's status and reviewer attribution; dismissal requests include a required `reason`.
- `POST /api/drafts/{id}/submit` submits a draft.
- `POST /api/drafts/{id}/decision` records an approval or change request in Decision History.
- `POST /api/drafts/{id}/comments` adds a comment.
- `GET /api/audit` loads workspace activity, including accepted and dismissed findings.

Draft listing accepts the API's `{ "value": [...], "Count": n }` response and the bare array currently returned by the live service. Draft details use the `draft`, `findings`, `comments`, `decisions`, and `versions` fields.

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

## Live and mock data

Draft listing, draft details, findings, comments, decisions, draft edits, submissions, AI reviews, and the Activity Feed are loaded from or sent to the backend. The Changes view uses version history returned by the backend and reports when no previous version is available.

Insights intentionally uses bundled sample records; it is not live backend reporting. Demo login roles and the Knowledge Base also use frontend sample data. The selected demo role and Quick start dismissal are stored in browser `localStorage`.
