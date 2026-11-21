import { z } from "zod";
import { pool } from "../config/database.js";

const scanSchema = z.object({
  code: z.string().trim().min(3).max(100),
  action: z.enum(["check-in", "check-out"])
});

export async function recordAttendanceScan(req, res, next) {
  const parsed = scanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Provide a valid membership barcode and attendance action." });
  }

  try {
    const { code, action } = parsed.data;
    const memberResult = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.status, mp.membership_number
       FROM users u
       JOIN member_profiles mp ON mp.user_id = u.id
       WHERE u.role = 'member'
         AND UPPER(mp.membership_number) = UPPER($1)
       LIMIT 1`,
      [code]
    );

    if (!memberResult.rowCount || memberResult.rows[0].status !== "active") {
      return res.status(404).json({ success: false, message: "No active approved member matches that membership barcode." });
    }

    const member = memberResult.rows[0];
    const latest = await pool.query(
      `SELECT action
       FROM attendance_records
       WHERE member_id = $1
       ORDER BY scanned_at DESC
       LIMIT 1`,
      [member.id]
    );

    if (action === "check-in" && latest.rows[0]?.action === "check-in") {
      return res.status(409).json({ success: false, message: "This member is already checked in." });
    }
    if (action === "check-out" && latest.rows[0]?.action !== "check-in") {
      return res.status(409).json({ success: false, message: "This member is not currently checked in." });
    }

    const inserted = await pool.query(
      `INSERT INTO attendance_records (member_id, action, scanned_code, scanned_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, action, scanned_at`,
      [member.id, action, code, req.user.id]
    );

    return res.status(201).json({
      success: true,
      message: action === "check-in" ? "Member checked in successfully." : "Member checked out successfully.",
      attendance: {
        id: inserted.rows[0].id,
        memberName: member.full_name,
        libraryNumber: member.membership_number,
        action: inserted.rows[0].action,
        checkInAt: action === "check-in" ? inserted.rows[0].scanned_at : null,
        checkOutAt: action === "check-out" ? inserted.rows[0].scanned_at : null,
        status: action === "check-in" ? "In library" : "Checked out",
        scannedAt: inserted.rows[0].scanned_at
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getAttendanceRecords(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
         ar.id,
         u.full_name AS "memberName",
         mp.membership_number AS "libraryNumber",
         ar.action,
         CASE WHEN ar.action = 'check-in' THEN ar.scanned_at END AS "checkInAt",
         CASE WHEN ar.action = 'check-out' THEN ar.scanned_at END AS "checkOutAt",
         CASE WHEN ar.action = 'check-in' THEN 'In library' ELSE 'Checked out' END AS status,
         ar.scanned_at AS "scannedAt"
       FROM attendance_records ar
       JOIN users u ON u.id = ar.member_id
       JOIN member_profiles mp ON mp.user_id = u.id
       ORDER BY ar.scanned_at DESC
       LIMIT 200`
    );
    return res.json({ success: true, count: result.rowCount, attendance: result.rows });
  } catch (error) {
    next(error);
  }
}
