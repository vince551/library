
import { z } from "zod";
import { pool } from "../config/database.js";
import { nextAmgNumber } from "../domain/amg-numbering.js";
import { createNotification } from "../services/notification.service.js";

// List and search members.
export async function getMembers(req, res, next) {
  try {
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();

    const result = await pool.query(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.status,
        u.created_at,
        mp.membership_number,
        mp.phone,
        mp.address,
        mp.gender,
        mp.school,
        mp.study_level,
        mp.edu_level,
        mp.guardian_name,
        mp.guardian_relation,
        mp.guardian_phone,
        mp.avatar_choice,
        mp.photo_storage_key,
        mp.approved_at
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       WHERE u.role = 'member'
         AND ($1 = '' OR u.status = $1)
         AND (
           $2 = ''
           OR u.full_name ILIKE $2
           OR u.email ILIKE $2
           OR mp.membership_number ILIKE $2
         )
       ORDER BY u.created_at DESC
`,
      [status, search ? `%${search}%` : ""]
    );

    return res.json({
      success: true,
      count: result.rowCount,
      members: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// Approve a pending membership application.
export async function approveMember(req, res, next) {
  const parsed = z.string().uuid().safeParse(req.params.memberId);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid member ID."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const memberResult = await client.query(
      `SELECT u.id, u.full_name, u.email, u.status, mp.membership_number
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1 AND u.role = 'member'
       FOR UPDATE OF u`,
      [parsed.data]
    );

    if (memberResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Member application not found."
      });
    }

    const member = memberResult.rows[0];

    if (member.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `This application cannot be approved because its status is ${member.status}.`
      });
    }

    // Keep the number assigned at registration so an already-issued card remains scannable.
    const membershipNumber = member.membership_number || await nextAmgNumber(client, "M");

    await client.query(
      `UPDATE users
       SET status = 'active',
           updated_at = NOW()
       WHERE id = $1`,
      [member.id]
    );

    await client.query(
      `UPDATE member_profiles
       SET membership_number = $1,
           approved_at = NOW()
       WHERE user_id = $2`,
      [membershipNumber, member.id]
    );

    await client.query(
      `INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, details
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.id,
        "MEMBER_APPROVED",
        "user",
        member.id,
        JSON.stringify({ membershipNumber })
      ]
    );

    await createNotification(client, {
      userId: member.id, type: "membership_approved",
      title: "Membership approved",
      message: "Your AMG Library membership is active. Your membership number is " + membershipNumber + ".",
      link: "profileSection", entityType: "user", entityId: member.id
    });

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Membership approved successfully.",
      member: {
        id: member.id,
        full_name: member.full_name,
        email: member.email,
        status: "active",
        membership_number: membershipNumber
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

// Reject a pending membership application.
export async function rejectMember(req, res, next) {
  const parsed = z.string().uuid().safeParse(req.params.memberId);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid member ID."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE users
       SET status = 'rejected',
           updated_at = NOW()
       WHERE id = $1
         AND role = 'member'
         AND status = 'pending'
       RETURNING id, full_name, email, status`,
      [parsed.data]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Pending member application not found."
      });
    }

    const member = result.rows[0];

    await client.query(
      `INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, details
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.id,
        "MEMBER_REJECTED",
        "user",
        member.id,
        JSON.stringify({ email: member.email })
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Membership application rejected.",
      member
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}


// Suspend an active member.
export async function suspendMember(req, res, next) {
  const parsed = z.string().uuid().safeParse(req.params.memberId);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid member ID."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE users
       SET status = 'suspended',
           updated_at = NOW()
       WHERE id = $1
         AND role = 'member'
         AND status = 'active'
       RETURNING id, full_name, email, status`,
      [parsed.data]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Member not found or is not currently active."
      });
    }

    const member = result.rows[0];

    await client.query(
      `INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, details
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.id,
        "MEMBER_SUSPENDED",
        "user",
        member.id,
        JSON.stringify({ email: member.email })
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Member suspended successfully.",
      member
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

// Reactivate a suspended member.
export async function reactivateMember(req, res, next) {
  const parsed = z.string().uuid().safeParse(req.params.memberId);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid member ID."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE users
       SET status = 'active',
           updated_at = NOW()
       WHERE id = $1
         AND role = 'member'
         AND status = 'suspended'
       RETURNING id, full_name, email, status`,
      [parsed.data]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Member not found or is not currently suspended."
      });
    }

    const member = result.rows[0];

    await client.query(
      `INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, details
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.id,
        "MEMBER_REACTIVATED",
        "user",
        member.id,
        JSON.stringify({ email: member.email })
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Member reactivated successfully.",
      member
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}
