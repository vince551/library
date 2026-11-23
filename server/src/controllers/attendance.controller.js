import { z } from "zod";
import { pool } from "../config/database.js";

const scanSchema = z.object({
  code: z.string().trim().min(3).max(100),
  action: z.enum(["check-in", "check-out"])
});

export async function recordAttendanceScan(req, res, next) {
  const parsed = scanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Provide a valid membership barcode and attendance action." });

  const client = await pool.connect();
  try {
    const { code, action } = parsed.data;
    await client.query("BEGIN");
    const memberResult = await client.query(
      `SELECT u.id, u.full_name, u.email, u.status, mp.membership_number
       FROM users u JOIN member_profiles mp ON mp.user_id = u.id
       WHERE u.role = 'member'
         AND regexp_replace(UPPER(COALESCE(mp.membership_number, '')), '[^A-Z0-9]', '', 'g')
             = regexp_replace(UPPER($1), '[^A-Z0-9]', '', 'g')
       LIMIT 1 FOR UPDATE OF u`,
      [code]
    );
    if (!memberResult.rowCount || memberResult.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "No active approved member matches that membership barcode." });
    }

    const member = memberResult.rows[0];
    if (action === "check-in") await client.query("SELECT pg_advisory_xact_lock(hashtext('amg-library-capacity'))");

    const latest = await client.query(
      "SELECT action FROM attendance_records WHERE member_id = $1 ORDER BY scanned_at DESC LIMIT 1",
      [member.id]
    );
    if (action === "check-in" && latest.rows[0]?.action === "check-in") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This member is already checked in." });
    }
    if (action === "check-out" && latest.rows[0]?.action !== "check-in") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This member is not currently checked in." });
    }

    if (action === "check-in") {
      const occupancy = await client.query(
        `SELECT COUNT(*)::int AS total FROM (
           SELECT DISTINCT ON (member_id) member_id, action
           FROM attendance_records ORDER BY member_id, scanned_at DESC
         ) latest_visits WHERE action = 'check-in'`
      );
      const setting = await client.query("SELECT setting_value FROM library_settings WHERE setting_key = 'capacity' LIMIT 1");
      const capacity = Number(setting.rows[0]?.setting_value) || 100;
      if (occupancy.rows[0].total >= capacity) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: `The library has reached its capacity of ${capacity}. Record a check-out before another member checks in.` });
      }
    }

    const inserted = await client.query(
      `INSERT INTO attendance_records (member_id, action, scanned_code, scanned_by)
       VALUES ($1, $2, $3, $4) RETURNING id, action, scanned_at`,
      [member.id, action, code, req.user.id]
    );
    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: action === "check-in" ? "Member checked in successfully." : "Member checked out successfully.",
      attendance: {
        id: inserted.rows[0].id, memberName: member.full_name,
        libraryNumber: member.membership_number, action: inserted.rows[0].action,
        checkInAt: action === "check-in" ? inserted.rows[0].scanned_at : null,
        checkOutAt: action === "check-out" ? inserted.rows[0].scanned_at : null,
        status: action === "check-in" ? "In library" : "Checked out",
        scannedAt: inserted.rows[0].scanned_at
      }
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    client.release();
  }
}

export async function getAttendanceRecords(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT ar.id, u.full_name AS "memberName", mp.membership_number AS "libraryNumber",
              ar.action,
              CASE WHEN ar.action = 'check-in' THEN ar.scanned_at END AS "checkInAt",
              CASE WHEN ar.action = 'check-out' THEN ar.scanned_at END AS "checkOutAt",
              CASE WHEN ar.action = 'check-in' THEN 'In library' ELSE 'Checked out' END AS status,
              ar.scanned_at AS "scannedAt"
       FROM (SELECT DISTINCT ON (member_id) * FROM attendance_records ORDER BY member_id, scanned_at DESC) ar
       JOIN users u ON u.id = ar.member_id
       JOIN member_profiles mp ON mp.user_id = u.id
       ORDER BY ar.scanned_at DESC LIMIT 200`
    );
    return res.json({ success: true, count: result.rowCount, attendance: result.rows });
  } catch (error) { return next(error); }
}

export async function getAttendanceSummary(req, res, next) {
  try {
    const [days, totals] = await Promise.all([
      pool.query(
        `WITH local_today AS (SELECT (NOW() AT TIME ZONE 'Africa/Nairobi')::date AS today),
         days AS (SELECT generate_series(today - 6, today, interval '1 day')::date AS day FROM local_today)
         SELECT to_char(days.day, 'Dy DD Mon') AS label, COUNT(ar.id)::int AS visits
         FROM days LEFT JOIN attendance_records ar
           ON ar.action = 'check-in'
          AND (ar.scanned_at AT TIME ZONE 'Africa/Nairobi')::date = days.day
         GROUP BY days.day ORDER BY days.day`
      ),
      pool.query(
        `SELECT (SELECT COUNT(*)::int FROM attendance_records) AS "totalRecords",
         (SELECT COUNT(*)::int FROM (
           SELECT DISTINCT ON (member_id) member_id, action
           FROM attendance_records ORDER BY member_id, scanned_at DESC
         ) latest WHERE action = 'check-in') AS "currentlyInside"`
      )
    ]);
    return res.json({
      success: true,
      summary: {
        days: days.rows,
        totalRecords: Number(totals.rows[0].totalRecords) || 0,
        currentlyInside: Number(totals.rows[0].currentlyInside) || 0
      }
    });
  } catch (error) { return next(error); }
}
