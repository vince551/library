
import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";

async function createLibrarian() {
  const email = process.env.BOOTSTRAP_LIBRARIAN_EMAIL;
  const password = process.env.BOOTSTRAP_LIBRARIAN_PASSWORD;

  if (!email || !password) {
    throw new Error("Librarian email and password are required.");
  }

  if (password.length < 12) {
    throw new Error("Use a temporary password of at least 12 characters.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await pool.query(
      "SELECT id, role FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      throw new Error(
        `An account already exists for this email with role: ${existing.rows[0].role}. No changes made.`
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'librarian', 'active')
       RETURNING id, full_name, email, role, status, created_at`,
      ["Edwin Muga", normalizedEmail, passwordHash]
    );

    console.log("Librarian account created successfully:");
    console.table(result.rows);
  } finally {
    await pool.end();
  }
}

createLibrarian().catch((error) => {
  console.error("Librarian setup failed:", error.message);
  process.exitCode = 1;
});
