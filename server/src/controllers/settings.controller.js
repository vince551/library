import { z } from "zod";
import { pool } from "../config/database.js";

const capacitySchema = z.object({ capacity: z.number().int().min(1).max(10000) });

export async function getLibrarySettings(req, res, next) {
  try {
    const result = await pool.query("SELECT setting_value FROM library_settings WHERE setting_key = 'capacity' LIMIT 1");
    return res.json({ success: true, settings: { capacity: Number(result.rows[0]?.setting_value) || 100 } });
  } catch (error) { return next(error); }
}

export async function updateLibraryCapacity(req, res, next) {
  const parsed = capacitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Capacity must be a whole number between 1 and 10,000." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('amg-library-capacity'))");
    const occupancy = await client.query(
      `SELECT COUNT(*)::int AS total FROM (
         SELECT DISTINCT ON (member_id) member_id, action
         FROM attendance_records ORDER BY member_id, scanned_at DESC
       ) latest_visits WHERE action = 'check-in'`
    );
    if (parsed.data.capacity < occupancy.rows[0].total) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: `Capacity cannot be lower than the current occupancy of ${occupancy.rows[0].total}.` });
    }

    const result = await client.query(
      `INSERT INTO library_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ('capacity', $1, $2, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET
         setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING setting_value`,
      [parsed.data.capacity, req.user.id]
    );
    await client.query("COMMIT");
    return res.json({ success: true, message: "Library capacity saved.", settings: { capacity: Number(result.rows[0].setting_value) } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
}
