import { z } from "zod";
import { pool } from "../config/database.js";

export async function listMyNotifications(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, type, title, message, link, read_at, created_at
       FROM member_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    const unread = await pool.query(
      "SELECT COUNT(*)::int AS count FROM member_notifications WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );
    return res.json({
      success: true,
      notifications: result.rows,
      unreadCount: unread.rows[0].count
    });
  } catch (error) { return next(error); }
}

export async function markNotificationRead(req, res, next) {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid notification ID." });
  try {
    const result = await pool.query(
      `UPDATE member_notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id, read_at`,
      [parsed.data, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Notification not found." });
    return res.json({ success: true, notification: result.rows[0] });
  } catch (error) { return next(error); }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    const result = await pool.query(
      `UPDATE member_notifications SET read_at = NOW()
       WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    return res.json({ success: true, updated: result.rowCount, message: "All notifications marked as read." });
  } catch (error) { return next(error); }
}
