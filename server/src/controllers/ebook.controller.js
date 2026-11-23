import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../config/database.js";

const MAX_EBOOK_BYTES = 30 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const allowedEbookTypes = new Map([
  [".pdf", { format: "pdf", mime: "application/pdf" }],
  [".epub", { format: "epub", mime: "application/epub+zip" }]
]);
const allowedCoverTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  author: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(""),
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(100),
  fileData: z.string().min(1),
  coverType: z.string().optional().default(""),
  coverData: z.string().optional().default("")
});

function storageConfig() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_BUCKET) {
    const error = new Error("File storage is not configured on the API server.");
    error.status = 503;
    throw error;
  }
  return {
    // Accept the project URL even if the environment variable was pasted with an API path suffix.
    baseUrl: SUPABASE_URL.trim().replace(/\/+$/, "").replace(/\/(?:rest|storage)\/v1$/i, ""),
    key: SUPABASE_SERVICE_ROLE_KEY,
    bucket: SUPABASE_BUCKET
  };
}

function storageObjectPath(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function storageRequest(path, options = {}) {
  const config = storageConfig();
  let response;
  try {
    response = await fetch(`${config.baseUrl}/storage/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        ...(options.body && !(options.body instanceof Buffer) ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
  } catch (error) {
    console.error("Supabase Storage network request failed:", error.message);
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Supabase Storage rejected request:", {
      status: response.status,
      statusText: response.statusText,
      detail: detail.slice(0, 1000),
      path
    });
    const error = new Error("File storage request failed" + (detail ? `: ${detail.slice(0, 300)}` : "."));
    error.storageDetail = detail.slice(0, 500);
    error.storageStatus = response.status;
    error.status = response.status === 413 ? 413 : 502;
    throw error;
  }
  return response;
}

async function uploadObject(key, buffer, contentType) {
  const config = storageConfig();
  await storageRequest(`object/${encodeURIComponent(config.bucket)}/${storageObjectPath(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "x-upsert": "false"
    },
    body: buffer
  });
}

async function removeObjects(keys) {
  const validKeys = keys.filter(Boolean);
  if (!validKeys.length) return;
  const config = storageConfig();
  await storageRequest(`object/${encodeURIComponent(config.bucket)}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: validKeys })
  });
}

async function signedObjectUrl(key, expiresIn = 90) {
  const config = storageConfig();
  const response = await storageRequest(`object/sign/${encodeURIComponent(config.bucket)}/${storageObjectPath(key)}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn })
  });
  const data = await response.json();
  const signed = data.signedURL || data.signedUrl;
  if (!signed) throw new Error("Storage did not return a signed file URL.");
  return signed.startsWith("http") ? signed : `${config.baseUrl}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
}

function decodeBase64(value, maxBytes, label) {
  const normalized = String(value || "").replace(/^data:[^;]+;base64,/, "");
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`The ${label} file data is invalid.`);
  }
  const estimatedBytes = Math.floor(normalized.length * 3 / 4);
  if (estimatedBytes > maxBytes) throw new Error(`The ${label} exceeds the allowed file size.`);
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length || buffer.length > maxBytes) throw new Error(`The ${label} exceeds the allowed file size.`);
  return buffer;
}

function publicEbook(row) {
  const format = String(row.file_format || "").toLowerCase();
  const extension = format === "epub" || format === "application/epub+zip" ? "epub" : "pdf";
  return {
    id: row.id,
    ebookNumber: row.ebook_number,
    catalogueNumber: row.catalogue_number,
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    category: row.category || "General",
    description: row.description || "",
    fileName: `${row.title}.${extension}`,
    fileType: extension === "epub" ? "application/epub+zip" : "application/pdf",
    fileSize: Number(row.file_size_bytes),
    coverUrl: row.cover_image_key ? `/api/ebooks/${row.id}/cover` : "",
    createdAt: row.created_at
  };
}

const ebookSelect = `
  SELECT e.id, e.book_id, e.file_format, e.file_size_bytes, e.created_at,
         e.ebook_number, b.catalogue_number, b.title, b.author, b.description, b.cover_image_key,
         c.name AS category, e.is_published
  FROM ebooks e
  JOIN books b ON b.id = e.book_id
  LEFT JOIN categories c ON c.id = b.category_id
`;

export async function listPublicEbooks(req, res, next) {
  try {
    const result = await pool.query(
      `${ebookSelect}
       WHERE e.is_published = TRUE AND b.is_published = TRUE
       ORDER BY e.created_at DESC`
    );
    return res.json({ success: true, ebooks: result.rows.map(publicEbook) });
  } catch (error) {
    next(error);
  }
}

export async function listManageEbooks(req, res, next) {
  try {
    const result = await pool.query(`${ebookSelect} ORDER BY e.created_at DESC`);
    return res.json({ success: true, ebooks: result.rows.map(publicEbook) });
  } catch (error) {
    next(error);
  }
}

export async function uploadEbook(req, res, next) {
  const uploadedKeys = [];
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Complete the title, author, category and e-book file fields.",
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const input = parsed.data;
    const extension = input.fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    const fileType = allowedEbookTypes.get(extension);
    if (!fileType || (input.fileType !== fileType.mime && input.fileType !== "application/octet-stream")) {
      return res.status(400).json({ success: false, message: "Only PDF and EPUB e-books are supported." });
    }

    const fileBuffer = decodeBase64(input.fileData, MAX_EBOOK_BYTES, "E-book");
    let coverBuffer = null;
    if (input.coverData) {
      if (!allowedCoverTypes.has(input.coverType)) {
        return res.status(400).json({ success: false, message: "Cover images must be JPEG, PNG or WebP." });
      }
      coverBuffer = decodeBase64(input.coverData, MAX_COVER_BYTES, "Cover image");
    }

    const id = randomUUID();
    const safeFileName = input.fileName.replace(/[\\/\0]/g, "_");
    const fileKey = `ebooks/${id}/${safeFileName}`;
    const coverExtension = input.coverType === "image/png" ? "png" : input.coverType === "image/webp" ? "webp" : "jpg";
    const coverKey = coverBuffer ? `covers/${id}/cover.${coverExtension}` : null;

    await uploadObject(fileKey, fileBuffer, fileType.mime);
    uploadedKeys.push(fileKey);
    if (coverBuffer && coverKey) {
      await uploadObject(coverKey, coverBuffer, input.coverType);
      uploadedKeys.push(coverKey);
    }

    const client = await pool.connect();
    let created;
    try {
      await client.query("BEGIN");
      const slug = input.category.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "general";
      const categoryResult = await client.query(
        `INSERT INTO categories (name, slug)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [input.category, slug]
      );
      const bookResult = await client.query(
        `INSERT INTO books (title, author, description, category_id, cover_image_key, created_by, is_published, catalogue_number)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, next_amg_number('B'))
         RETURNING id, catalogue_number`,
        [input.title, input.author, input.description || null, categoryResult.rows[0].id, coverKey, req.user.id]
      );
      const ebookResult = await client.query(
        `INSERT INTO ebooks (book_id, file_key, file_format, file_size_bytes, is_published, ebook_number)
         VALUES ($1, $2, $3, $4, TRUE, next_amg_number('E'))
         RETURNING id, book_id, ebook_number, file_format, file_size_bytes, created_at`,
        [bookResult.rows[0].id, fileKey, fileType.format, fileBuffer.length]
      );
      created = {
        ...ebookResult.rows[0],
        catalogue_number: bookResult.rows[0].catalogue_number,
        title: input.title,
        author: input.author,
        description: input.description,
        category: input.category,
        cover_image_key: coverKey
      };
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    return res.status(201).json({
      success: true,
      message: "E-book uploaded to private storage and added to the AMG Library catalogue.",
      ebook: publicEbook(created)
    });
  } catch (error) {
    if (uploadedKeys.length) {
      await removeObjects(uploadedKeys).catch(cleanupError => {
        console.error("Storage cleanup failed:", cleanupError.message);
      });
    }
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.status === 503 ? error.message : "The file storage service could not complete the request.",
        ...(error.storageStatus ? { storageStatus: error.storageStatus } : {}),
        ...(error.storageDetail ? { storageDetail: error.storageDetail } : {})
      });
    }
    if (error.message?.includes("file") || error.message?.includes("image")) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
}

export async function streamEbook(req, res, next) {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ success: false, message: "Invalid e-book ID." });

    const result = await pool.query(
      `SELECT e.file_key FROM ebooks e
       JOIN books b ON b.id = e.book_id
       WHERE e.id = $1 AND e.is_published = TRUE AND b.is_published = TRUE`,
      [id.data]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "E-book not found." });
    return res.redirect(302, await signedObjectUrl(result.rows[0].file_key));
  } catch (error) {
    next(error);
  }
}

export async function streamEbookCover(req, res, next) {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).end();

    const result = await pool.query(
      `SELECT b.cover_image_key FROM ebooks e
       JOIN books b ON b.id = e.book_id
       WHERE e.id = $1 AND e.is_published = TRUE AND b.is_published = TRUE`,
      [id.data]
    );
    if (!result.rowCount || !result.rows[0].cover_image_key) return res.status(404).end();
    return res.redirect(302, await signedObjectUrl(result.rows[0].cover_image_key, 300));
  } catch (error) {
    next(error);
  }
}

export async function deleteEbook(req, res, next) {
  let deleted;
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ success: false, message: "Invalid e-book ID." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT e.id, e.book_id, e.file_key, b.cover_image_key
         FROM ebooks e
         JOIN books b ON b.id = e.book_id
         WHERE e.id = $1
         FOR UPDATE OF e, b`,
        [id.data]
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "E-book not found." });
      }

      deleted = result.rows[0];
      await client.query("DELETE FROM ebooks WHERE id = $1", [id.data]);
      // Each uploaded e-book creates its own catalogue metadata row.
      // Remove that row too, so it cannot reappear as a physical print book.
      await client.query("DELETE FROM books WHERE id = $1", [deleted.book_id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    await removeObjects([deleted.file_key, deleted.cover_image_key].filter(Boolean))
      .catch(error => console.error("E-book storage cleanup failed:", error.message));

    return res.json({ success: true, message: "E-book file removed from the catalogue." });
  } catch (error) {
    next(error);
  }
}
