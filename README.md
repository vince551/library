# AMG Library — Frontend

This repository contains the AMG Library React + Vite frontend and its Node.js + Express API. The production frontend is hosted on Vercel, the API on Render, PostgreSQL metadata on Neon, and private e-book files in Supabase Storage.

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
- E-books are retrieved through short-lived signed URLs from the private Supabase Storage bucket.

## Production data architecture

The backend uses the existing Neon schema. E-book title, author, description, category and cover key live in `books`; `ebooks` stores `book_id`, `file_key`, `file_format`, `file_size_bytes`, publication status and creation time. The API uploads files to the private `amg-library-files` Supabase Storage bucket and issues temporary signed URLs for access. The Supabase secret key belongs only in Render environment variables, never in frontend code or GitHub.

The frontend data model maps to resources such as:

- `books`: title, author, ISBN, category, description, cover key, publication metadata.
- `book_copies`: book ID, barcode, copy number, availability/status.
- `ebooks`: book ID, file key, file format, file size, publication status. Title, author, category, description and cover key are stored in the related `books` row.
- `members`, `borrow_requests`, `loans`, `attendance`, and `news_posts`.

The Express API authorizes librarian-only mutations and uses its private Supabase service credential to upload objects to the private `amg-library-files` bucket. It issues short-lived signed URLs for file access. Keep the Supabase secret key on the Render backend only; never expose it in Vercel frontend variables or source control.

No Firebase, Firestore, Laravel or production backend integration is included.
