import { z } from "zod";
import { pool } from "../config/database.js";

const validDate = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const postSchema = z.object({
  type: z.enum(["announcement", "event"]),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(3000),
  date: z.union([validDate, z.null()]).optional()
});

function mapPost(row) {
  return { id: row.id, type: row.type, title: row.title, body: row.body,
    date: row.event_date || row.published_at, createdAt: row.created_at, publishedAt: row.published_at };
}

export async function listPublishedPosts(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, type, title, body, event_date, published_at, created_at
       FROM library_posts WHERE status = 'published'
       ORDER BY published_at DESC LIMIT 100`
    );
    return res.json({ success: true, count: result.rowCount, posts: result.rows.map(mapPost) });
  } catch (error) { return next(error); }
}

export async function createPost(req, res, next) {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Provide a valid update type, title, message and event date." });

  try {
    const { type, title, body, date } = parsed.data;
    const result = await pool.query(
      `INSERT INTO library_posts (type, title, body, event_date, created_by)
       VALUES ($1, $2, $3, $4::date, $5)
       RETURNING id, type, title, body, event_date, published_at, created_at`,
      [type, title, body, type === "event" ? date || null : null, req.user.id]
    );
    return res.status(201).json({
      success: true,
      message: type === "event" ? "Event published successfully." : "Announcement published successfully.",
      post: mapPost(result.rows[0])
    });
  } catch (error) { return next(error); }
}

export async function deletePost(req, res, next) {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ success: false, message: "Invalid update ID." });
  try {
    const result = await pool.query("DELETE FROM library_posts WHERE id = $1 RETURNING id", [id.data]);
    if (!result.rowCount) return res.status(404).json({ success: false, message: "This update no longer exists." });
    return res.json({ success: true, message: "Library update deleted." });
  } catch (error) { return next(error); }
}
