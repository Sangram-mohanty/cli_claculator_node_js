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

4. Open [http://localhost:4200](http://localhost:4200). Create the family tree, then add people and connect parents, siblings, and children. Photos accept JPEG, PNG, or WebP up to 5 MB.

The API listens on port `3000`. To use MongoDB Atlas or another database, set `MONGODB_URI` in `server/.env`. `CLIENT_ORIGIN`, `PORT`, and `UPLOAD_DIR` can also be configured there. Uploaded photos are stored locally under `server/uploads` by default; this is suitable for development, not multi-instance production deployment.

## Features

- Create a family tree, then add people as parents, siblings, or children of anyone in it.
- Connect two people who are already in the tree (for example, link an existing person as someone's parent).
- Find anyone quickly with the member search, including people not yet connected to anyone.
- Edit a person's name, birth year, and gender, upload a photo, remove a parent/child link, or remove a person.

## API

All routes are under `/api/v1/trees`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/` | List or create family trees |
| PATCH / DELETE | `/:treeId` | Rename or delete a tree (deletes its people and links) |
| GET / POST | `/:treeId/people` | List or add people |
| PATCH / DELETE | `/:treeId/people/:personId` | Edit or remove a person (removes their links and photo) |
| GET | `/:treeId/people/:personId/relatives` | Parents, siblings, and children of a person |
| POST | `/:treeId/people/:personId/photo` | Upload a photo (`multipart/form-data`, field `photo`) |
| POST | `/:treeId/relationships` | Link `{ parentId, childId }` |
| DELETE | `/:treeId/relationships/:parentId/:childId` | Remove a parent-child link |

## Design

- `FamilyTree` stores the family name, village, and surname.
- `Person` stores each family member and optional profile details.
- `Relationship` stores directed parent-to-child links. The API checks that linked people belong to the same tree and rejects cycles. Sibling lists are derived from shared parents.
- Angular uses the versioned `/api/v1` REST API. The API and frontend are separate deployable applications.

This is a local-development starter, not a production-ready public service: authentication, family invitations, access controls, cloud photo storage, and production deployment still need to be added before sharing private family data online.

## Checks

```powershell
npm run build
npx ng test --watch=false --browsers=ChromeHeadless
cd server
npm test
```

The API tests start a temporary in-memory MongoDB (`mongodb-memory-server`), so they don't need a running database. The first run downloads a MongoDB binary.
