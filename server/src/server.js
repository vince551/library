
import "dotenv/config";
import app from "./app.js";
import { pool } from "./config/database.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Verify Neon database connectivity
    const result = await pool.query("SELECT NOW() AS database_time");

    console.log("Neon PostgreSQL connected successfully.");
    console.log("Database time:", result.rows[0].database_time);

    app.listen(PORT, () => {
      console.log(`AMG API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
