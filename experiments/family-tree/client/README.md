# Roots family tree

A starter family-tree application for the Bahadalapur Mohanty family, built with Angular, Node.js, Express, and MongoDB. People are stored independently from parent-child relationships, so the tree can grow to any number of generations. Siblings are derived from shared parents.

## Requirements

- Node.js 20 or newer
- MongoDB running locally, or a MongoDB connection string

## Run locally

1. Start MongoDB. The default connection is `mongodb://127.0.0.1:27017/family_tree`.
2. In a terminal, install API dependencies and start the API:

   ```powershell
   cd server
   Copy-Item .env.example .env
   npm install
   npm run dev
   ```

3. In a second terminal, install the Angular dependencies and start the frontend:

   ```powershell
   npm install
   npm start
   ```

4. Open [http://localhost:4200](http://localhost:4200). The landing page displays a fictional, read-only family showcase. Sign up or sign in before creating your own private family tree. Photos accept JPEG, PNG, or WebP up to 5 MB.

The API listens on port `3000`. To use MongoDB Atlas or another database, set `MONGODB_URI` in `server/.env`. `CLIENT_ORIGIN`, `PORT`, `UPLOAD_DIR`, and `AUTH_TOKEN_SECRET` can also be configured there. Use a long random `AUTH_TOKEN_SECRET` for persistent sessions; without one, sessions expire when the API restarts. Uploaded photos are stored locally under `server/uploads` by default; this is suitable for development, not multi-instance production deployment.

## Features

- Create a family tree, then add a father, mother, siblings, or children for anyone in it, with an optional photo for each new person.
- See the whole family in the **Family graph** view: one row per generation, partners side by side, and lines from each couple to their children. Zoom in or out, or fit it to the screen; click anyone to open their branch.
- Add a wife or husband ("spouse" if gender is not set). Married couples are joined by a green line in the graph, even before they have children. When adding a child to a married person, the spouse is offered as the other parent; adding a mother when the father is known marks them as married.
- Connect two people who are already in the tree (for example, link an existing person as someone's parent).
- Find anyone quickly with the member search, including people not yet connected to anyone.
- Edit a person's name, birth year, and gender, upload a photo, remove a parent/child link, or remove a person.

## Accounts and privacy

Each account can only list and access its own family trees. The public showcase tree contains fictional data and is read-only. Passwords are stored as scrypt hashes, and account sessions use expiring bearer tokens. Email verification and password recovery are not configured in this local starter.

Family trees created before accounts were added are deliberately left unassigned and hidden; they are not automatically exposed or assigned to the first new account. Assigning/importing that data requires a deliberate owner migration.

Profile photos are the only supported media upload today. Future voice or video memories should be stored as private media assets attached to a family member and use the same owner access checks.

## API

Account routes are under `/api/v1/auth`. Sign up with `POST /signup` or sign in with `POST /login`, both using `{ email, password }`; include the returned token as `Authorization: Bearer <token>` for private tree routes. `GET /session` reports the signed-in account. Tree routes are under `/api/v1/trees`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/signup` | Create an account with an email and password |
| POST | `/api/v1/auth/login` | Sign in and receive a session token |
| GET | `/api/v1/auth/session` | Check the current account session |
| GET / POST | `/` | List or create family trees |
| PATCH / DELETE | `/:treeId` | Rename or delete an owned family tree (deleting removes its people and links) |
| GET / POST | `/:treeId/people` | List or add people |
| PATCH / DELETE | `/:treeId/people/:personId` | Edit or remove a person in an owned family tree |
| GET | `/:treeId/people/:personId/relatives` | Parents, siblings, and children of a person |
| POST | `/:treeId/people/:personId/photo` | Upload a photo (`multipart/form-data`, field `photo`); returned photo links are signed and expire |
| GET / POST | `/:treeId/partnerships` | List marriages, or marry `{ personId, partnerId }` |
| DELETE | `/:treeId/partnerships/:personId/:partnerId` | Remove a marriage (either order) |
| GET | `/:treeId/relationships` | All parent-child links in the tree (used by the graph) |
| POST | `/:treeId/relationships` | Link `{ parentId, childId }` |
| DELETE | `/:treeId/relationships/:parentId/:childId` | Remove a parent-child link |

## Keeping your data safe

If MongoDB is not installed, run a local database that keeps its data permanently in `server/data/db`:

```powershell
cd server
npm run db        # leave this window open; Ctrl+C stops it safely
```

Back up and restore everything (families, people, links, marriages) as JSON files in `server/backups/`:

```powershell
cd server
npm run backup                                   # saves to backups/<date-time>/
npm run restore -- backups/<folder> --replace    # loads a backup back in
```

`server/data/`, `server/backups/`, `server/uploads/` (photos) and `server/.env` are git-ignored, so family data and passwords are never pushed. Back them up separately.

## Design

- `FamilyTree` stores the family name, surname, and where the family comes from: village, district, state, and country.
- `Person` stores each family member and optional profile details.
- `Partnership` stores marriages between two people in the same tree.
- `Relationship` stores directed parent-to-child links. The API checks that linked people belong to the same tree and rejects cycles. Sibling lists are derived from shared parents.
- Angular uses the versioned `/api/v1` REST API. The API and frontend are separate deployable applications.

This is a local-development starter, not a production-ready public service: email verification, password recovery, family invitations, cloud photo storage, and production deployment still need to be added before sharing private family data online.

## Checks

```powershell
npm run build
npx ng test --watch=false --browsers=ChromeHeadless
cd server
npm test
```

The API tests start a temporary in-memory MongoDB (`mongodb-memory-server`), so they don't need a running database. The first run downloads a MongoDB binary.
