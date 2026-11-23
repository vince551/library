import { z } from "zod";
import { pool } from "../config/database.js";

const createSchema = z.object({ bookId: z.string().uuid() });
const decisionSchema = z.object({ decision: z.enum(["approved", "declined"]) });

export async function createBorrowRequest(req, res, next) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success:false, message:"Select a valid physical book." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bookResult = await client.query(
      "SELECT id, title, is_published FROM books WHERE id = $1 FOR SHARE",
      [parsed.data.bookId]
    );
    if (!bookResult.rowCount || !bookResult.rows[0].is_published) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success:false, message:"This book is no longer available in the catalogue." });
    }
    const stock = await client.query(
      "SELECT COUNT(*)::int AS available FROM book_copies WHERE book_id = $1 AND status = 'available'",
      [parsed.data.bookId]
    );
    if (stock.rows[0].available < 1) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success:false, message:"There are currently no available copies of this book." });
    }
    const existing = await client.query(
      "SELECT id, status FROM borrow_requests WHERE member_id = $1 AND book_id = $2 AND status IN ('pending','approved') FOR UPDATE",
      [req.user.id, parsed.data.bookId]
    );
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success:false, message:"You already have an open request for this book." });
    }
    const inserted = await client.query(
      "INSERT INTO borrow_requests (member_id, book_id, status) VALUES ($1, $2, 'pending') RETURNING id, member_id, book_id, status, created_at, updated_at",
      [req.user.id, parsed.data.bookId]
    );
    await client.query("COMMIT");
    return res.status(201).json({ success:true, message:"Your borrowing request has been submitted.", request:{ ...inserted.rows[0], book_title:bookResult.rows[0].title } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ success:false, message:"You already have an open request for this book." });
    return next(error);
  } finally {
    client.release();
  }
}

export async function getMyBorrowRequests(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT r.id, r.book_id, r.status, r.created_at, r.updated_at,
              r.loan_id, b.title AS book_title, b.author, c.name AS book_category
       FROM borrow_requests r
       JOIN books b ON b.id = r.book_id
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE r.member_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    return res.json({ success:true, count:result.rowCount, requests:result.rows });
  } catch (error) { return next(error); }
}

export async function getBorrowRequests(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT r.id, r.member_id, r.book_id, r.status, r.created_at, r.updated_at, r.loan_id,
              u.full_name AS user_name, u.email AS user_email, u.status AS member_status,
              mp.membership_number, b.title AS book_title, b.author, c.name AS book_category,
              COALESCE(stock.available, 0)::int AS available_copies
       FROM borrow_requests r
       JOIN users u ON u.id = r.member_id
       JOIN books b ON b.id = r.book_id
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       LEFT JOIN categories c ON c.id = b.category_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS available FROM book_copies
         WHERE book_id = b.id AND status = 'available'
       ) stock ON TRUE
       ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.created_at DESC
       LIMIT 300`
    );
    return res.json({ success:true, count:result.rowCount, requests:result.rows });
  } catch (error) { return next(error); }
}

export async function decideBorrowRequest(req, res, next) {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = decisionSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ success:false, message:"Provide a valid request and decision." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT r.*, u.status AS member_status, b.title
       FROM borrow_requests r
       JOIN users u ON u.id = r.member_id
       JOIN books b ON b.id = r.book_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [id.data]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success:false, message:"Borrowing request not found." });
    }
    const request = result.rows[0];
    if (request.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success:false, message:"This request has already been processed." });
    }
    if (parsed.data.decision === "approved") {
      if (request.member_status !== "active") {
        await client.query("ROLLBACK");
        return res.status(409).json({ success:false, message:"Only active, approved members can borrow books." });
      }
      const activeLoans = await client.query(
        "SELECT COUNT(*)::int AS total FROM loans WHERE member_id = $1 AND status IN ('active', 'overdue')",
        [request.member_id]
      );
      if (activeLoans.rows[0].total >= 3) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success:false, message:"This member has reached the maximum borrowing limit of 3 books." });
      }
      const stock = await client.query(
        "SELECT COUNT(*)::int AS available FROM book_copies WHERE book_id = $1 AND status = 'available'",
        [request.book_id]
      );
      if (stock.rows[0].available < 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success:false, message:"No copies are currently available. The request has not been approved." });
      }
    }
    const updated = await client.query(
      "UPDATE borrow_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [parsed.data.decision, id.data]
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'borrow_request', $3, $4::jsonb)`,
      [req.user.id, parsed.data.decision === "approved" ? "BORROW_REQUEST_APPROVED" : "BORROW_REQUEST_DECLINED", id.data, JSON.stringify({ memberId:request.member_id, bookId:request.book_id, title:request.title })]
    );
    await client.query("COMMIT");
    return res.json({ success:true, message:parsed.data.decision === "approved" ? "Borrowing request approved. Scan the member card and book copy when handing over the book." : "Borrowing request declined.", request:updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
}
