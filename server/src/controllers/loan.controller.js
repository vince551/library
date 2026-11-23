
import { z } from "zod";
import { pool } from "../config/database.js";

const issueSchema = z.object({
  barcode: z.string().trim().min(3).max(100),
  memberId: z.string().uuid(),
  dueDays: z.number().int().min(1).max(30).default(14)
});

const returnSchema = z.object({
  loanId: z.string().uuid()
});

// Find members for the librarian's circulation desk
export async function searchMembers(req, res, next) {
  try {
    const search = String(req.query.search || "").trim();

    if (search.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Enter at least two characters to search."
      });
    }

    const result = await pool.query(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.status,
        mp.membership_number
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       WHERE u.role = 'member'
         AND (
           u.full_name ILIKE $1
           OR u.email ILIKE $1
           OR mp.membership_number ILIKE $1
         )
       ORDER BY u.full_name
       LIMIT 20`,
      [`%${search}%`]
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

// Issue a physical book
export async function issueBook(req, res, next) {
  const parsed = issueSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid issue details.",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  const { barcode, memberId, dueDays } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the physical copy to prevent simultaneous issuing.
    const copyResult = await client.query(
      `SELECT
        bc.id,
        bc.barcode,
        bc.status,
        bc.condition,
        b.id AS book_id,
        b.title,
        b.author
       FROM book_copies bc
       JOIN books b ON b.id = bc.book_id
       WHERE bc.barcode = $1
       FOR UPDATE OF bc`,
      [barcode]
    );

    if (copyResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "No physical book was found with that barcode."
      });
    }

    const copy = copyResult.rows[0];

    if (copy.status !== "available") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: `This copy cannot be issued. Current status: ${copy.status}.`
      });
    }

    // An approved borrowing request is required before a physical handover.
    // Lock it in the same transaction so it cannot be fulfilled twice.
    const requestResult = await client.query(
      `SELECT id FROM borrow_requests
       WHERE member_id = $1 AND book_id = $2 AND status = 'approved'
       ORDER BY created_at ASC
       LIMIT 1 FOR UPDATE`,
      [memberId, copy.book_id]
    );
    if (!requestResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "This learner has no approved borrowing request for this book. Approve the request before issuing the copy."
      });
    }
    const approvedRequestId = requestResult.rows[0].id;

    // Verify the member is active.
    const memberResult = await client.query(
      `SELECT id, full_name, email, role, status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [memberId]
    );

    if (
      memberResult.rowCount === 0 ||
      memberResult.rows[0].role !== "member" ||
      memberResult.rows[0].status !== "active"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "The member does not exist or is not an active approved member."
      });
    }


    // Enforce the member borrowing limit.
const activeLoans = await client.query(
  `SELECT COUNT(*)::int AS total
   FROM loans
   WHERE member_id = $1
     AND status IN ('active', 'overdue')`,
  [memberId]
);

if (activeLoans.rows[0].total >= 3) {
  await client.query("ROLLBACK");

  return res.status(409).json({
    success: false,
    message: "This member has reached the maximum borrowing limit of 3 books."
  });
}

    // Create the loan.
    const loanResult = await client.query(
      `INSERT INTO loans (
        copy_id,
        member_id,
        issued_by,
        issued_at,
        due_at,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        NOW(),
        NOW() + ($4 * INTERVAL '1 day'),
        'active'
      )
      RETURNING *`,
      [copy.id, memberId, req.user.id, dueDays]
    );

    // Update the physical copy.
    await client.query(
      `UPDATE book_copies
       SET status = 'loaned'
       WHERE id = $1`,
      [copy.id]
    );

    // Mark the approved request fulfilled only after the loan and copy update succeed.
    await client.query(
      `UPDATE borrow_requests
       SET status = 'fulfilled', loan_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [loanResult.rows[0].id, approvedRequestId]
    );

    // Record the action.
    await client.query(
      `INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.id,
        "BOOK_ISSUED",
        "loan",
        loanResult.rows[0].id,
        JSON.stringify({
          barcode: copy.barcode,
          title: copy.title,
          memberId,
          dueDays
        })
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Book issued successfully.",
      loan: loanResult.rows[0],
      book: {
        id: copy.book_id,
        title: copy.title,
        author: copy.author,
        barcode: copy.barcode
      },
      member: memberResult.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

// List all loans
export async function getLoans(req, res, next) {
  try {
    await pool.query(
      `UPDATE loans
       SET status = 'overdue'
       WHERE status = 'active'
         AND due_at < NOW()`
    );

    const result = await pool.query(
      `SELECT
        l.id,
        l.issued_at,
        l.due_at,
        l.returned_at,
        l.status,
        u.full_name AS member_name,
        u.email AS member_email,
        mp.membership_number,
        b.title AS book_title,
        b.author,
        bc.barcode,
        bc.shelf_location,
        issuer.full_name AS issued_by_name
       FROM loans l
       JOIN users u ON u.id = l.member_id
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       JOIN book_copies bc ON bc.id = l.copy_id
       JOIN books b ON b.id = bc.book_id
       LEFT JOIN users issuer ON issuer.id = l.issued_by
       ORDER BY l.issued_at DESC
       LIMIT 200`
    );

    return res.json({
      success: true,
      count: result.rowCount,
      loans: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// Return a physical book
export async function returnBook(req, res, next) {
  const parsed = returnSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "A valid loan ID is required."
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const loanResult = await client.query(
      `SELECT
        l.*,
        bc.id AS physical_copy_id,
        bc.barcode,
        bc.condition,
        b.title
       FROM loans l
       JOIN book_copies bc ON bc.id = l.copy_id
       JOIN books b ON b.id = bc.book_id
       WHERE l.id = $1
       FOR UPDATE OF l, bc`,
      [parsed.data.loanId]
    );

    if (loanResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Loan record not found."
      });
    }

    const loan = loanResult.rows[0];

    if (!["active", "overdue"].includes(loan.status)) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "This loan has already been closed."
      });
    }

    const returnStatus =
      loan.condition === "damaged" ? "maintenance" : "available";

    const updatedLoan = await client.query(
      `UPDATE loans
       SET status = 'returned',
           returned_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [loan.id]
    );

    await client.query(
      `UPDATE book_copies
       SET status = $1
       WHERE id = $2`,
      [returnStatus, loan.physical_copy_id]
    );

    await client.query(
      `INSERT INTO audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        req.user.id,
        "BOOK_RETURNED",
        "loan",
        loan.id,
        JSON.stringify({
          barcode: loan.barcode,
          title: loan.title,
          previousStatus: loan.status,
          copyStatus: returnStatus
        })
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Book returned successfully.",
      loan: updatedLoan.rows[0],
      copyStatus: returnStatus
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

export async function getMyLoans(req, res, next) {
  try {
    await pool.query(
      `UPDATE loans SET status = 'overdue'
       WHERE member_id = $1 AND status = 'active' AND due_at < NOW()`,
      [req.user.id]
    );
    const result = await pool.query(
      `SELECT l.id, l.issued_at, l.issued_at AS created_at, l.due_at, l.returned_at, l.status,
              b.title, b.title AS book_title, b.author, bc.barcode
       FROM loans l
       JOIN book_copies bc ON bc.id = l.copy_id
       JOIN books b ON b.id = bc.book_id
       WHERE l.member_id = $1
       ORDER BY l.issued_at DESC`,
      [req.user.id]
    );
    return res.json({ success:true, count:result.rowCount, loans:result.rows });
  } catch (error) { return next(error); }
}

export async function getMemberLoans(req, res, next) {
  try {
    const parsed = z.string().uuid().safeParse(req.params.memberId);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid member ID."
      });
    }

    const result = await pool.query(
      `SELECT
        l.id,
        l.issued_at,
        l.due_at,
        l.returned_at,
        l.status,
        b.title,
        b.author,
        bc.barcode
       FROM loans l
       JOIN book_copies bc ON bc.id = l.copy_id
       JOIN books b ON b.id = bc.book_id
       WHERE l.member_id = $1
       ORDER BY l.issued_at DESC`,
      [parsed.data]
    );

    return res.json({
      success: true,
      count: result.rowCount,
      loans: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// Find the current open loan for a scanned physical-copy barcode.
export async function getActiveLoanByBarcode(req, res, next) {
  try {
    const barcode = String(req.params.barcode || "").trim();
    if (barcode.length < 3 || barcode.length > 100) {
      return res.status(400).json({ success: false, message: "Invalid book-copy barcode." });
    }
    const result = await pool.query(
      `SELECT l.id AS "loanId", l.status, bc.barcode, b.title AS "bookTitle",
              u.full_name AS "memberName", mp.membership_number AS "libraryNumber"
       FROM loans l
       JOIN book_copies bc ON bc.id = l.copy_id
       JOIN books b ON b.id = bc.book_id
       JOIN users u ON u.id = l.member_id
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       WHERE bc.barcode = $1 AND l.status IN ('active', 'overdue')
       ORDER BY l.issued_at DESC LIMIT 1`,
      [barcode]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: "No active loan was found for that book-copy barcode." });
    }
    return res.json({ success: true, loan: result.rows[0] });
  } catch (error) {
    next(error);
  }
}
