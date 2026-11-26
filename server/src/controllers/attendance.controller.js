import { z } from "zod";
import { pool } from "../config/database.js";
import { canTransitionAttendance, hasAvailableCapacity } from "../domain/library-rules.js";

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
    if (!canTransitionAttendance(latest.rows[0]?.action ?? null, action)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: action === "check-in"
          ? "This member is already checked in."
          : "This member is not currently checked in."
      });
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
      if (!hasAvailableCapacity(occupancy.rows[0].total, capacity)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: `The library has reached its capacity of ${capacity}. Record a check-out before another member checks in.` });
      }
    }

    const inserted = await client.query(
      `INSERT INTO attendance_records (member_id, action, scanned_code, scanned_by, attendance_number)
       VALUES ($1, $2, $3, $4, next_amg_number('A')) RETURNING id, attendance_number, action, scanned_at`,
      [member.id, action, code, req.user.id]
    );
    await client.query("COMMIT");
    return res.status(201).json({
      success: true,
      message: action === "check-in" ? "Member checked in successfully." : "Member checked out successfully.",
      attendance: {
        id: inserted.rows[0].id, attendanceNumber: inserted.rows[0].attendance_number, memberName: member.full_name,
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
      `WITH ordered_events AS (
         SELECT ar.*,
                LEAD(ar.action) OVER (PARTITION BY ar.member_id ORDER BY ar.scanned_at, ar.id) AS next_action,
                LEAD(ar.scanned_at) OVER (PARTITION BY ar.member_id ORDER BY ar.scanned_at, ar.id) AS next_scanned_at
         FROM attendance_records ar
       )
       SELECT event.id, event.attendance_number AS "attendanceNumber",
              u.full_name AS "memberName", mp.membership_number AS "libraryNumber",
              event.scanned_at AS "checkInAt",
              CASE WHEN event.next_action = 'check-out' THEN event.next_scanned_at END AS "checkOutAt",
              CASE WHEN event.next_action = 'check-out' THEN 'Checked out' ELSE 'In library' END AS status,
              event.scanned_at AS "scannedAt"
       FROM ordered_events event
       JOIN users u ON u.id = event.member_id
       JOIN member_profiles mp ON mp.user_id = u.id
       WHERE event.action = 'check-in'
       ORDER BY event.scanned_at DESC, event.id DESC
       LIMIT 200`
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
