
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool } from "../config/database.js";
import { nextAmgNumber } from "../domain/amg-numbering.js";


const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
function storageConfig() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_BUCKET) {
    const error = new Error("Book cover storage is not configured on the API server.");
    error.status = 503; throw error;
  }
  return { baseUrl: SUPABASE_URL.trim().replace(/\/+$/, "").replace(/\/(?:rest|storage)\/v1$/i, ""), key: SUPABASE_SERVICE_ROLE_KEY, bucket: SUPABASE_BUCKET };
}
function storagePath(key) { return key.split("/").map(encodeURIComponent).join("/"); }
async function storageCall(path, options = {}) {
  const config = storageConfig();
  const response = await fetch(`${config.baseUrl}/storage/v1/${path}`, {
    ...options,
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`,
      ...(options.body && !Buffer.isBuffer(options.body) ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error("Book cover storage request failed" + (detail ? `: ${detail.slice(0, 250)}` : "."));
    error.status = response.status === 413 ? 413 : 502; throw error;
  }
  return response;
}
function decodeCover(data) {
  const value = String(data || "").replace(/^data:[^;]+;base64,/, "");
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("The book cover image data is invalid.");
  const buffer = Buffer.from(value, "base64");
  if (!buffer.length || buffer.length > MAX_COVER_BYTES) throw new Error("Book cover images must be 5 MB or smaller.");
  return buffer;
}
async function uploadBookCover(bookId, data, contentType) {
  if (!COVER_TYPES.has(contentType)) throw new Error("Book covers must be JPEG, PNG or WebP.");
  const buffer = decodeCover(data);
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const key = `covers/physical/${bookId}/${randomUUID()}.${ext}`;
  const config = storageConfig();
  await storageCall(`object/${encodeURIComponent(config.bucket)}/${storagePath(key)}`, {
    method: "POST", headers: { "Content-Type": contentType, "x-upsert": "false" }, body: buffer
  });
  return key;
}
async function removeBookCover(key) {
  if (!key) return;
  const config = storageConfig();
  await storageCall(`object/${encodeURIComponent(config.bucket)}`, { method: "DELETE", body: JSON.stringify({ prefixes: [key] }) });
}
async function signedBookCover(key) {
  const config = storageConfig();
  const response = await storageCall(`object/sign/${encodeURIComponent(config.bucket)}/${storagePath(key)}`, {
    method: "POST", body: JSON.stringify({ expiresIn: 3600 })
  });
  const data = await response.json();
  const signed = data.signedURL || data.signedUrl;
  if (!signed) throw new Error("Storage did not return a signed cover URL.");
  return signed.startsWith("http") ? signed : `${config.baseUrl}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
}
function withCoverUrl(row) {
  // Each replacement gets a new URL so browsers cannot keep showing the previous cover.
  const coverRevision = row.cover_image_key ? row.cover_image_key.split("/").pop() : "";
  return { ...row, coverUrl: row.cover_image_key ? `/api/books/${row.id}/cover?v=${encodeURIComponent(coverRevision)}` : "" };
}

const bookSchema = z.object({
  title: z.string().trim().min(1).max(255),
  author: z.string().trim().min(1).max(255),
  isbn: z.string().trim().max(20).nullable().optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  publicationYear: z.number().int().min(1000).max(2100).nullable().optional(),
  publisher: z.string().trim().max(255).nullable().optional(),
  coverImageKey: z.string().max(1000).nullable().optional(),
  isPublished: z.boolean().optional()
});

const updateSchema = bookSchema.partial();

function handleDatabaseError(error, res, next) {
  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      message: "A book with this ISBN already exists."
    });
  }

  if (error.code === "23503") {
    return res.status(400).json({
      success: false,
      message: "The selected category or related record is invalid."
    });
  }

  if (error.code === "23514") {
    return res.status(400).json({
      success: false,
      message: "One or more book details violate a database constraint."
    });
  }

  return next(error);
}

// Public catalogue: published books only
export async function getBooks(req, res, next) {
  try {
    const search = String(req.query.search || "").trim();
    const categoryId = req.query.categoryId || null;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 12)
    );
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT
        b.id,
        b.catalogue_number,
        b.title,
        b.author,
        b.isbn,
        b.description,
        b.category_id,
        c.name AS category_name,
        c.name AS category,
        b.publication_year,
        b.publisher,
        b.cover_image_key,
        b.is_published,
        b.created_at,
        COALESCE(copy_stats.quantity, 0)::int AS quantity,
        COALESCE(copy_stats.available, 0)::int AS available,
        first_copy.barcode
       FROM books b
       LEFT JOIN categories c ON c.id = b.category_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS quantity,
                COUNT(*) FILTER (WHERE status = 'available') AS available
         FROM book_copies
         WHERE book_id = b.id
       ) copy_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT barcode
         FROM book_copies
         WHERE book_id = b.id
         ORDER BY created_at ASC
         LIMIT 1
       ) first_copy ON TRUE
       WHERE b.is_published = TRUE
         AND ($1 = '' OR b.title ILIKE $1 OR b.author ILIKE $1)
         AND ($2::uuid IS NULL OR b.category_id = $2)
         AND NOT EXISTS (SELECT 1 FROM ebooks e WHERE e.book_id = b.id)
       ORDER BY b.created_at DESC
       LIMIT $3 OFFSET $4`,
      [`%${search}%`, categoryId, limit, offset]
    );

    return res.json({
      success: true,
      page,
      limit,
      books: result.rows.map(withCoverUrl)
    });
  } catch (error) {
    next(error);
  }
}

// Librarian catalogue: includes unpublished books
export async function getManageBooks(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
        b.*,
        c.name AS category_name,
        c.name AS category,
        COALESCE(copy_stats.quantity, 0)::int AS quantity,
        COALESCE(copy_stats.available, 0)::int AS available,
        first_copy.barcode
       FROM books b
       LEFT JOIN categories c ON c.id = b.category_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS quantity,
                COUNT(*) FILTER (WHERE status = 'available') AS available
         FROM book_copies
         WHERE book_id = b.id
       ) copy_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT barcode
         FROM book_copies
         WHERE book_id = b.id
         ORDER BY created_at ASC
         LIMIT 1
       ) first_copy ON TRUE
       WHERE NOT EXISTS (SELECT 1 FROM ebooks e WHERE e.book_id = b.id)
       ORDER BY b.created_at DESC`
    );

    return res.json({
      success: true,
      count: result.rowCount,
      books: result.rows.map(withCoverUrl)
    });
  } catch (error) {
    next(error);
  }
}

// Add a book
export async function createBook(req, res, next) {
  try {
    const parsed = bookSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid book details.",
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const book = parsed.data;

    const result = await pool.query(
      `INSERT INTO books (
        title,
        author,
        isbn,
        description,
        category_id,
        publication_year,
        publisher,
        cover_image_key,
        created_by,
        is_published,
        catalogue_number
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, next_amg_number('B'))
      RETURNING *`,
      [
        book.title,
        book.author,
        book.isbn || null,
        book.description || null,
        book.categoryId || null,
        book.publicationYear || null,
        book.publisher || null,
        book.coverImageKey || null,
        req.user.id,
        book.isPublished ?? false
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Book added successfully.",
      book: result.rows[0]
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

// Edit a book
export async function updateBook(req, res, next) {
  let newCoverKey = null;
  let oldCoverKey = null;
  const parsedId = z.string().uuid().safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ success: false, message: "Invalid book ID." });

  const schema = updateSchema.extend({
    coverType: z.string().optional(),
    coverData: z.string().optional(),
    category: z.string().trim().min(1).max(80).optional(),
    quantity: z.number().int().min(1).max(400).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
    return res.status(400).json({ success: false, message: "Provide valid book details to update.", errors: parsed.error?.flatten().fieldErrors });
  }

  const { coverType, coverData, category, quantity, ...bookInput } = parsed.data;
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const existing = await client.query(
      "SELECT id, cover_image_key FROM books WHERE id = $1 FOR UPDATE",
      [parsedId.data]
    );
    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Book not found." });
    }
    oldCoverKey = existing.rows[0].cover_image_key;

    if (coverData) newCoverKey = await uploadBookCover(parsedId.data, coverData, coverType);
    if (newCoverKey) bookInput.coverImageKey = newCoverKey;

    if (category) {
      const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "general";
      const categoryResult = await client.query(
        `INSERT INTO categories (name, slug) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [category, slug]
      );
      bookInput.categoryId = categoryResult.rows[0].id;
    }

    const columns = {
      title: "title", author: "author", isbn: "isbn", description: "description",
      categoryId: "category_id", publicationYear: "publication_year", publisher: "publisher",
      coverImageKey: "cover_image_key", isPublished: "is_published"
    };
    const values = [];
    const assignments = [];
    for (const [key, value] of Object.entries(bookInput)) {
      if (!columns[key]) continue;
      values.push(value);
      assignments.push(`${columns[key]} = $${values.length}`);
    }

    if (assignments.length) {
      values.push(parsedId.data);
      await client.query(
        `UPDATE books SET ${assignments.join(", ")} WHERE id = $${values.length}`,
        values
      );
    }

    if (Number.isInteger(quantity)) {
      const current = await client.query(
        "SELECT COUNT(*)::int AS quantity FROM book_copies WHERE book_id = $1",
        [parsedId.data]
      );
      const currentQuantity = Number(current.rows[0].quantity);
      if (quantity > currentQuantity) {
        for (let index = currentQuantity; index < quantity; index += 1) {
          const barcode = await nextAmgNumber(client, "C");
          await client.query(
            "INSERT INTO book_copies (book_id, barcode, condition, status) VALUES ($1, $2, 'good', 'available')",
            [parsedId.data, barcode]
          );
        }
      } else if (quantity < currentQuantity) {
        const removeCount = currentQuantity - quantity;
        const removable = await client.query(
          `SELECT bc.id
           FROM book_copies bc
           WHERE bc.book_id = $1
             AND bc.status = 'available'
             AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = bc.id)
           ORDER BY bc.created_at DESC
           LIMIT $2
           FOR UPDATE OF bc`,
          [parsedId.data, removeCount]
        );
        if (removable.rowCount < removeCount) {
          const error = new Error("The total cannot be reduced that far. Borrowed, unavailable, or historically used copies are protected.");
          error.status = 409;
          throw error;
        }
        await client.query(
          "DELETE FROM book_copies WHERE id = ANY($1::uuid[])",
          [removable.rows.map(row => row.id)]
        );
      }
    }

    const result = await client.query(
      `SELECT b.*, c.name AS category_name,
              COALESCE(stats.quantity, 0)::int AS quantity,
              COALESCE(stats.available, 0)::int AS available
       FROM books b
       LEFT JOIN categories c ON c.id = b.category_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS quantity,
                COUNT(*) FILTER (WHERE status = 'available') AS available
         FROM book_copies WHERE book_id = b.id
       ) stats ON TRUE
       WHERE b.id = $1`,
      [parsedId.data]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    if (newCoverKey && oldCoverKey && oldCoverKey !== newCoverKey) {
      await removeBookCover(oldCoverKey).catch(error => console.error("Old book cover cleanup failed:", error.message));
    }
    return res.json({
      success: true,
      message: "Book details and physical copy total updated successfully.",
      book: withCoverUrl(result.rows[0])
    });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    if (newCoverKey) await removeBookCover(newCoverKey).catch(() => {});
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    if (error.message?.toLowerCase().includes("cover")) return res.status(400).json({ success: false, message: error.message });
    handleDatabaseError(error, res, next);
  } finally {
    client.release();
  }
}

// Delete a physical book only when it has no circulation history.
// Loan and request records are retained; they are never cascaded away.
export async function deleteBook(req, res, next) {
  const parsedId = z.string().uuid().safeParse(req.params.id);
  if (!parsedId.success) {
    return res.status(400).json({ success: false, message: "Invalid book ID." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const bookResult = await client.query(
      `SELECT id, title, cover_image_key
       FROM books
       WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM ebooks WHERE ebooks.book_id = books.id)
       FOR UPDATE`,
      [parsedId.data]
    );

    if (!bookResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Physical book not found. E-books must be removed from the E-books section."
      });
    }

    const historyResult = await client.query(
      `SELECT
         (SELECT COUNT(*)::int
          FROM loans l
          JOIN book_copies bc ON bc.id = l.copy_id
          WHERE bc.book_id = $1) AS loan_count,
         (SELECT COUNT(*)::int
          FROM borrow_requests
          WHERE book_id = $1) AS request_count`,
      [parsedId.data]
    );

    const { loan_count: loanCount, request_count: requestCount } = historyResult.rows[0];
    if (loanCount > 0 || requestCount > 0) {
      await client.query("ROLLBACK");
      const reasons = [];
      if (loanCount > 0) reasons.push(`${loanCount} loan record(s)`);
      if (requestCount > 0) reasons.push(`${requestCount} borrowing request(s)`);
      return res.status(409).json({
        success: false,
        message: `This book cannot be deleted because it has ${reasons.join(" and ")}. Its circulation history is protected.`
      });
    }

    await client.query("DELETE FROM book_copies WHERE book_id = $1", [parsedId.data]);
    await client.query("DELETE FROM books WHERE id = $1", [parsedId.data]);
    await client.query("COMMIT");
    if (bookResult.rows[0].cover_image_key) {
      await removeBookCover(bookResult.rows[0].cover_image_key).catch(error => console.error("Deleted book cover cleanup failed:", error.message));
    }

    return res.json({
      success: true,
      message: "Book and its unused physical copies were permanently deleted."
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    handleDatabaseError(error, res, next);
  } finally {
    client.release();
  }
}


// Register a physical title and all its copies atomically.
export async function registerPhysicalBook(req, res, next) {
  let coverKey = null;
  try {
    const schema = z.object({
      title: z.string().trim().min(1).max(255), author: z.string().trim().min(1).max(255),
      isbn: z.string().trim().max(20).optional().default(""),
      description: z.string().trim().max(10000).optional().default(""),
      category: z.string().trim().min(1).max(80), quantity: z.number().int().min(1).max(400),
      coverType: z.string().optional().default(""), coverData: z.string().optional().default("")
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Complete the required physical book details.", errors: parsed.error.flatten().fieldErrors });
    const input = parsed.data;
    const id = randomUUID();
    if (input.coverData) coverKey = await uploadBookCover(id, input.coverData, input.coverType);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const slug = input.category.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "general";
      const categoryResult = await client.query(
        `INSERT INTO categories (name, slug) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [input.category, slug]);
      const bookResult = await client.query(
        `INSERT INTO books (id, title, author, isbn, description, category_id, cover_image_key, created_by, is_published, catalogue_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, next_amg_number('B'))
         RETURNING id, catalogue_number, title, author, isbn, description, category_id, cover_image_key, is_published, created_at`,
        [id, input.title, input.author, input.isbn || null, input.description || null, categoryResult.rows[0].id, coverKey, req.user.id]);
      const createdBook = bookResult.rows[0], copies = [];
      for (let index = 0; index < input.quantity; index += 1) {
        const barcode = await nextAmgNumber(client, "C");
        const copyResult = await client.query(
          `INSERT INTO book_copies (book_id, barcode, condition, status)
           VALUES ($1, $2, 'good', 'available')
           RETURNING id, book_id, barcode, shelf_location, condition, status, created_at`, [id, barcode]);
        copies.push({ ...copyResult.rows[0], copyNumber: index + 1 });
      }
      await client.query("COMMIT");
      return res.status(201).json({ success: true, message: "Physical book, cover and copies saved to the AMG Library database.",
        book: { ...createdBook, category: input.category, coverUrl: coverKey ? `/api/books/${id}/cover` : "",
          quantity: copies.length, available: copies.length, barcode: copies[0]?.barcode || "",
          libraryNumber: copies[0]?.barcode || "", copies } });
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (coverKey) await removeBookCover(coverKey).catch(() => {});
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    if (error.message?.includes("cover")) return res.status(400).json({ success: false, message: error.message });
    handleDatabaseError(error, res, next);
  }
}

export async function streamBookCover(req, res, next) {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).end();
    const result = await pool.query(
      `SELECT cover_image_key FROM books WHERE id = $1 AND is_published = TRUE
       AND NOT EXISTS (SELECT 1 FROM ebooks WHERE ebooks.book_id = books.id)`, [id.data]);
    if (!result.rowCount || !result.rows[0].cover_image_key) return res.status(404).end();
    // The underlying object changes when a cover is replaced; never cache this redirect.
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    return res.redirect(302, await signedBookCover(result.rows[0].cover_image_key));
  } catch (error) { next(error); }
}
