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
- `ebooks`: book ID, file key, file format, file size, publication status. Title, author, category, description and cover key are stored in the related `books` row.
- `members`, `borrow_requests`, `loans`, `attendance`, and `news_posts`.

The Express API authorizes librarian-only mutations and uses its private Supabase service credential to upload objects to the private `amg-library-files` bucket. It issues short-lived signed URLs for file access. Keep the Supabase secret key on the Render backend only; never expose it in Vercel frontend variables or source control.

No Firebase, Firestore, Laravel or production backend integration is included.
