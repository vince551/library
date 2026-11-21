import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";

async function resetPassword() {
  const email = process.env.RESET_USER_EMAIL;
  const password = process.env.RESET_USER_PASSWORD;

  if (!email || !password || password.length < 12) {
    throw new Error("Provide an email and a password of at least 12 characters.");
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE email = $2 AND role = 'librarian'
       RETURNING email`,
      [passwordHash, email.trim().toLowerCase()]
    );

    if (result.rowCount === 0) {
      throw new Error("No matching librarian account was found.");
    }

    console.log("Librarian password updated successfully.");
  } finally {
    await pool.end();
  }
}

resetPassword().catch((error) => {
  console.error("Password reset failed:", error.message);
  process.exitCode = 1;
});