import "dotenv/config";
import app from "./app.js";
import { pool } from "./config/database.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Verify PostgreSQL connectivity. The existing Neon schema is managed
    // separately; startup must never create or mutate application tables.
    const result = await pool.query("SELECT NOW() AS database_time");

    const storageConfigured = Boolean(
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_BUCKET
    );

    console.log("PostgreSQL connected.");
    console.log("Supabase Storage:", storageConfigured ? "configured" : "not configured");
    console.log("Database time:", result.rows[0].database_time);

    app.listen(PORT, () => {
      console.log(`AMG API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("API startup validation failed:", error.message);
    process.exit(1);
  }
}

startServer();
