
import { z } from "zod";
import { pool } from "../config/database.js";

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
        b.title,
        b.author,
        b.isbn,
        b.description,
        b.category_id,
        c.name AS category_name,
        b.publication_year,
        b.publisher,
        b.cover_image_key,
        b.is_published,
        b.created_at
       FROM books b
       LEFT JOIN categories c ON c.id = b.category_id
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
      books: result.rows
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
        c.name AS category_name
       FROM books b
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE NOT EXISTS (SELECT 1 FROM ebooks e WHERE e.book_id = b.id)
       ORDER BY b.created_at DESC`
    );

    return res.json({
      success: true,
      count: result.rowCount,
      books: result.rows
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
        is_published
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
  try {
    const parsedId = z.string().uuid().safeParse(req.params.id);

    if (!parsedId.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID."
      });
    }

    const parsed = updateSchema.safeParse(req.body);

    if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one valid field to update.",
        errors: parsed.error?.flatten().fieldErrors
      });
    }

    const columns = {
      title: "title",
      author: "author",
      isbn: "isbn",
      description: "description",
      categoryId: "category_id",
      publicationYear: "publication_year",
      publisher: "publisher",
      coverImageKey: "cover_image_key",
      isPublished: "is_published"
    };

    const values = [];
    const assignments = [];

    for (const [key, value] of Object.entries(parsed.data)) {
      values.push(value);
      assignments.push(`${columns[key]} = $${values.length}`);
    }

    values.push(parsedId.data);

    const result = await pool.query(
      `UPDATE books
       SET ${assignments.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found."
      });
    }

    return res.json({
      success: true,
      message: "Book updated successfully.",
      book: result.rows[0]
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

// Delete a book
export async function deleteBook(req, res, next) {
  try {
    const parsedId = z.string().uuid().safeParse(req.params.id);

    if (!parsedId.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID."
      });
    }

    const result = await pool.query(
      "DELETE FROM books WHERE id = $1 RETURNING id",
      [parsedId.data]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found."
      });
    }

    return res.json({
      success: true,
      message: "Book deleted successfully."
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}
