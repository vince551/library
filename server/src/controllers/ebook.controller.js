import { z } from "zod";
import { pool } from "../config/database.js";

const MAX_EBOOK_BYTES = 30 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const allowedEbookTypes = new Map([
  [".pdf", "application/pdf"],
  [".epub", "application/epub+zip"]
]);
const allowedCoverTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(""),
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(100),
  fileData: z.string().min(1),
  coverType: z.string().optional().default(""),
  coverData: z.string().optional().default("")
});

function decodeBase64(value, maxBytes, label) {
  const normalized = String(value || "").replace(/^data:[^;]+;base64,/, "");
  if (!normalized || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`The ${label} file data is invalid.`);
  }
  const estimatedBytes = Math.floor(normalized.length * 3 / 4);
  if (estimatedBytes > maxBytes) {
    throw new Error(`The ${label} exceeds the allowed file size.`);
  }
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length || buffer.length > maxBytes) {
    throw new Error(`The ${label} exceeds the allowed file size.`);
  }
  return buffer;
}

function publicEbook(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description || "",
    fileName: row.file_name,
    fileType: row.file_mime_type,
    fileSize: Number(row.file_size),
    coverUrl: row.has_cover ? `/api/ebooks/${row.id}/cover` : "",
    createdAt: row.created_at
  };
}

export async function listPublicEbooks(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, title, category, description, file_name, file_mime_type,
              file_size, (cover_data IS NOT NULL) AS has_cover, created_at
       FROM ebooks
       WHERE is_published = TRUE
       ORDER BY created_at DESC`
    );
    return res.json({ success: true, ebooks: result.rows.map(publicEbook) });
  } catch (error) {
    next(error);
  }
}

export async function listManageEbooks(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, title, category, description, file_name, file_mime_type,
              file_size, (cover_data IS NOT NULL) AS has_cover, created_at
       FROM ebooks
       ORDER BY created_at DESC`
    );
    return res.json({ success: true, ebooks: result.rows.map(publicEbook) });
  } catch (error) {
    next(error);
  }
}

export async function uploadEbook(req, res, next) {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Complete the title, category and e-book file fields."
      });
    }

    const input = parsed.data;
    const extension = input.fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    const expectedType = allowedEbookTypes.get(extension);
    if (!expectedType || (input.fileType !== expectedType && input.fileType !== "application/octet-stream")) {
      return res.status(400).json({ success: false, message: "Only PDF and EPUB e-books are supported." });
    }

    const fileBuffer = decodeBase64(input.fileData, MAX_EBOOK_BYTES, "E-book");
    let coverBuffer = null;
    let coverType = null;

    if (input.coverData) {
      if (!allowedCoverTypes.has(input.coverType)) {
        return res.status(400).json({ success: false, message: "Cover images must be JPEG, PNG or WebP." });
      }
      coverBuffer = decodeBase64(input.coverData, MAX_COVER_BYTES, "Cover image");
      coverType = input.coverType;
    }

    const result = await pool.query(
      `INSERT INTO ebooks (
        title, category, description, file_name, file_mime_type,
        file_size, file_data, cover_mime_type, cover_data, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, title, category, description, file_name, file_mime_type,
                file_size, (cover_data IS NOT NULL) AS has_cover, created_at`,
      [
        input.title,
        input.category,
        input.description || null,
        input.fileName.replace(/[\\/\\0]/g, "_"),
        expectedType,
        fileBuffer.length,
        fileBuffer,
        coverType,
        coverBuffer,
        req.user.id
      ]
    );

    return res.status(201).json({
      success: true,
      message: "E-book uploaded and saved to the AMG Library database.",
      ebook: publicEbook(result.rows[0])
    });
  } catch (error) {
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
      `SELECT file_name, file_mime_type, file_data
       FROM ebooks
       WHERE id = $1 AND is_published = TRUE`,
      [id.data]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "E-book not found." });

    const ebook = result.rows[0];
    const safeName = ebook.file_name.replace(/[\r\n"]/g, "_");
    res.setHeader("Content-Type", ebook.file_mime_type);
    res.setHeader("Content-Length", ebook.file_data.length);
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(ebook.file_data);
  } catch (error) {
    next(error);
  }
}

export async function streamEbookCover(req, res, next) {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).end();

    const result = await pool.query(
      `SELECT cover_mime_type, cover_data
       FROM ebooks
       WHERE id = $1 AND is_published = TRUE`,
      [id.data]
    );
    if (!result.rowCount || !result.rows[0].cover_data) return res.status(404).end();

    res.setHeader("Content-Type", result.rows[0].cover_mime_type);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(result.rows[0].cover_data);
  } catch (error) {
    next(error);
  }
}

export async function deleteEbook(req, res, next) {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ success: false, message: "Invalid e-book ID." });

    const result = await pool.query("DELETE FROM ebooks WHERE id = $1 RETURNING id", [id.data]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "E-book not found." });

    return res.json({ success: true, message: "E-book permanently removed from the catalogue." });
  } catch (error) {
    next(error);
  }
}
