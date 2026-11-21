import "dotenv/config";
import app from "./app.js";
import { pool } from "./config/database.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Verify PostgreSQL connectivity before accepting traffic.
    const result = await pool.query("SELECT NOW() AS database_time");

    // Render's local filesystem is ephemeral. Store uploaded e-books and
    // cover images in PostgreSQL so they survive deploys and restarts.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ebooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(160) NOT NULL,
        category VARCHAR(80) NOT NULL,
        description TEXT,
        file_name VARCHAR(255) NOT NULL,
        file_mime_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        file_data BYTEA NOT NULL,
        cover_mime_type VARCHAR(100),
        cover_data BYTEA,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS ebooks_published_created_idx
      ON ebooks (is_published, created_at DESC)
    `);

    console.log("PostgreSQL connected; e-book storage is ready.");
    console.log("Database time:", result.rows[0].database_time);

    app.listen(PORT, () => {
      console.log(`AMG API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
