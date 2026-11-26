
import { z } from "zod";
import { pool } from "../config/database.js";
import { nextAmgNumber } from "../domain/amg-numbering.js";

const createCopySchema = z.object({
  bookId: z.string().uuid(),
  barcode: z.string().trim().min(3).max(100).optional(),
  shelfLocation: z.string().trim().max(100).nullable().optional(),
  condition: z.enum(["new", "good", "worn", "damaged"]).default("good")
});

const updateCopySchema = z.object({
  shelfLocation: z.string().trim().max(100).nullable().optional(),
  condition: z.enum(["new", "good", "worn", "damaged"]).optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Provide at least one field to update." }
);

function handleDatabaseError(error, res, next) {
  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      message: "That barcode is already assigned to another copy."
    });
  }

  if (error.code === "23503") {
    return res.status(409).json({
      success: false,
      message: "This record is linked to another database record and cannot be changed or deleted."
    });
  }

  if (error.code === "23514") {
    return res.status(400).json({
      success: false,
      message: "The supplied inventory details violate a database constraint."
    });
  }

  return next(error);
}

// List physical copies belonging to a book
export async function getBookCopies(req, res, next) {
  try {
    const bookId = z.string().uuid().safeParse(req.params.bookId);

    if (!bookId.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID."
      });
    }

    const result = await pool.query(
      `SELECT
        id,
        book_id,
        barcode,
        shelf_location,
        condition,
        status,
        created_at
       FROM book_copies
       WHERE book_id = $1
       ORDER BY created_at DESC`,
      [bookId.data]
    );

    return res.json({
      success: true,
      count: result.rowCount,
      copies: result.rows
    });
  } catch (error) {
    next(error);
  }
}


/**
 * Adjust a title's total physical copy count without changing existing barcodes.
 * When reducing stock, only unused, available copies with no loan history may be removed.
 */
export async function setBookCopyQuantity(req, res, next) {
  const parsedId = z.string().uuid().safeParse(req.params.bookId);
  const parsedQuantity = z.number().int().min(1).max(400).safeParse(req.body?.quantity);
  if (!parsedId.success) return res.status(400).json({ success: false, message: "Invalid book ID." });
  if (!parsedQuantity.success) return res.status(400).json({ success: false, message: "Total copies must be a whole number between 1 and 400." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const book = await client.query("SELECT id FROM books WHERE id = $1 FOR UPDATE", [parsedId.data]);
    if (!book.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Physical book not found." });
    }

    const current = await client.query(
      "SELECT COUNT(*)::int AS quantity FROM book_copies WHERE book_id = $1",
      [parsedId.data]
    );
    const currentQuantity = Number(current.rows[0].quantity);
    const targetQuantity = parsedQuantity.data;

    if (targetQuantity > currentQuantity) {
      for (let index = currentQuantity; index < targetQuantity; index += 1) {
        const barcode = await nextAmgNumber(client, "C");
        await client.query(
          "INSERT INTO book_copies (book_id, barcode, condition, status) VALUES ($1, $2, 'good', 'available')",
          [parsedId.data, barcode]
        );
      }
    } else if (targetQuantity < currentQuantity) {
      const removeCount = currentQuantity - targetQuantity;
      const [availableResult, approvedResult] = await Promise.all([
        client.query(
          "SELECT COUNT(*)::int AS total FROM book_copies WHERE book_id = $1 AND status = 'available'",
          [parsedId.data]
        ),
        client.query(
          "SELECT COUNT(*)::int AS total FROM borrow_requests WHERE book_id = $1 AND status = 'approved'",
          [parsedId.data]
        )
      ]);
      const availableCount = Number(availableResult.rows[0].total);
      const approvedRequestCount = Number(approvedResult.rows[0].total);

      // Approved requests represent expected handovers. Do not remove stock
      // that is needed to fulfil those requests.
      if (availableCount - removeCount < approvedRequestCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "The total cannot be reduced because approved borrowing requests still need available copies. Fulfil or decline those requests first."
        });
      }

      const removable = await client.query(
        `SELECT bc.id
         FROM book_copies bc
         WHERE bc.book_id = $1
           AND bc.status = 'available'
           AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = bc.id)
         ORDER BY bc.created_at DESC
         LIMIT $2
         FOR UPDATE OF bc`,
        [parsedId.data, removeCount]
      );
      if (removable.rowCount < removeCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "The total cannot be reduced that far. Some copies are borrowed, unavailable, or have loan history. Return them or choose a higher total."
        });
      }
      await client.query(
        "DELETE FROM book_copies WHERE id = ANY($1::uuid[])",
        [removable.rows.map(row => row.id)]
      );
    }

    const totals = await client.query(
      `SELECT COUNT(*)::int AS quantity,
              COUNT(*) FILTER (WHERE status = 'available')::int AS available
       FROM book_copies WHERE book_id = $1`,
      [parsedId.data]
    );
    await client.query("COMMIT");
    return res.json({
      success: true,
      message: "Physical copy total updated. Existing copy barcodes and loan history were preserved.",
      ...totals.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    handleDatabaseError(error, res, next);
  } finally {
    client.release();
  }
}

// List all physical inventory
export async function getAllCopies(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
        bc.id,
        bc.book_id,
        b.title,
        b.author,
        bc.barcode,
        bc.shelf_location,
        bc.condition,
        bc.status,
        bc.created_at
       FROM book_copies bc
       JOIN books b ON b.id = bc.book_id
       ORDER BY bc.created_at DESC`
    );

    return res.json({
      success: true,
      count: result.rowCount,
      copies: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// Add a physical copy
export async function createCopy(req, res, next) {
  try {
    const parsed = createCopySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid physical copy details.",
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const copy = parsed.data;
    const barcode = copy.barcode || await nextAmgNumber(pool, "C");

    const result = await pool.query(
      `INSERT INTO book_copies (
        book_id,
        barcode,
        shelf_location,
        condition,
        status
      )
      VALUES ($1, $2, $3, $4, 'available')
      RETURNING *`,
      [
        copy.bookId,
        barcode,
        copy.shelfLocation || null,
        copy.condition
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Physical book copy added successfully.",
      copy: result.rows[0]
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

// Update shelf location or physical condition
export async function updateCopy(req, res, next) {
  try {
    const parsedId = z.string().uuid().safeParse(req.params.id);

    if (!parsedId.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid copy ID."
      });
    }

    const parsed = updateCopySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory update.",
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const columns = {
      shelfLocation: "shelf_location",
      condition: "condition"
    };

    const values = [];
    const assignments = [];

    for (const [key, value] of Object.entries(parsed.data)) {
      values.push(value);
      assignments.push(`${columns[key]} = $${values.length}`);
    }

    values.push(parsedId.data);

    const result = await pool.query(
      `UPDATE book_copies
       SET ${assignments.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Physical copy not found."
      });
    }

    return res.json({
      success: true,
      message: "Physical copy updated successfully.",
      copy: result.rows[0]
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

// Delete a physical copy
export async function deleteCopy(req, res, next) {
  const parsedId = z.string().uuid().safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ success: false, message: "Invalid copy ID." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id, status FROM book_copies WHERE id = $1 FOR UPDATE", [parsedId.data]);
    if (!existing.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Physical copy not found." }); }
    const history = await client.query("SELECT COUNT(*)::int AS count FROM loans WHERE copy_id = $1", [parsedId.data]);
    if (Number(history.rows[0].count) > 0 || existing.rows[0].status !== "available") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This copy has circulation history or is not available. Its barcode and loan history are protected." });
    }
    await client.query("DELETE FROM book_copies WHERE id = $1", [parsedId.data]);
    await client.query("COMMIT");
    return res.json({ success: true, message: "Unused physical copy deleted successfully." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    handleDatabaseError(error, res, next);
  } finally { client.release(); }
}
