# AMG Library — Frontend

This repository contains the AMG Library React + Vite frontend. It preserves the original AMG visual identity and page structure while preparing the catalogue and librarian workflows for a future API.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Catalogue workflows

- Librarians can add physical books, ISBN details, cover images, descriptions and copy quantities.
- Physical copies receive local demo barcode/QR labels for preview and printing.
- Librarians can add PDF and EPUB e-books with optional cover art and descriptions.
- Published physical books and e-books appear in the same **Find Your Next Read** catalogue.
- Members can search by title, author, ISBN or description; filter by category and format; save favourites; inspect resource details; and request available physical books.
- E-books open from a temporary browser object URL during the demo session.

## Frontend-only demo

There is no production authentication, database or permanent file storage in this repository. Demo records are held in React state and reset when the page is reloaded. Selected files are previewed locally in the browser; they are not uploaded to a server.

To preview the Librarian Desk, use the demo login form with an email address containing `librarian` or `admin` and any non-empty password. This is only a UI demonstration. Never use this email-based role shortcut in production.

## Planned backend contract

The planned backend is Node.js + Express, PostgreSQL on Neon, and Cloudflare R2 for file objects. The frontend data model is intended to map to resources such as:

- `books`: title, author, ISBN, category, description, cover key, publication metadata.
- `book_copies`: book ID, barcode, copy number, availability/status.
- `ebooks`: title, category, description, file key, file type, file size, cover key, publication status.
- `members`, `borrow_requests`, `loans`, `attendance`, and `news_posts`.

The Express API should authorize librarian-only mutations and issue short-lived signed upload/download URLs for private R2 objects. The browser should upload large e-book files directly to R2 using signed URLs rather than proxying file bytes through Express.

No Firebase, Firestore, Laravel or production backend integration is included.
