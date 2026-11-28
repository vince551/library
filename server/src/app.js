import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import bookRoutes from "./routes/book.routes.js";
import ebookRoutes from "./routes/ebook.routes.js";
import copyRoutes from "./routes/copy.routes.js";
import loanRoutes from "./routes/loan.routes.js";
import memberRoutes from "./routes/member.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import requestRoutes from "./routes/request.routes.js";
import contentRoutes from "./routes/content.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { pool } from "./config/database.js";

const app = express();

// Render terminates TLS at its edge proxy and forwards one trusted hop.
app.set("trust proxy", 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please wait a few minutes and try again." }
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://amg.free.je",
  "https://libra-dusky.vercel.app",
  "https://amg-library-frontend.vercel.app",
  "https://amg-library-frontend-6xsrkpkns-v667225s-projects.vercel.app",
  "https://amg-library-frontend-r6egscyd3-v667225s-projects.vercel.app",
  "https://amg-library-frontend-m221wcgcs-v667225s-projects.vercel.app",
  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
]);

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("This origin is not allowed by AMG Library CORS."));
  }
}));

// Cookie-authenticated mutations must come from an explicitly allowed web origin
// and carry a non-simple custom header. This blocks cross-site form submissions.
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin || !allowedOrigins.has(origin) || req.get("x-amg-request") !== "1") {
    return res.status(403).json({ success: false, message: "This request could not be verified. Refresh the page and try again." });
  }
  return next();
});

// Apply a general API request limit before parsing potentially large bodies.
app.use("/api", apiLimiter);

// Base64 file uploads are JSON-encoded. Keep the limit just above the
// 30 MB e-book + 5 MB cover allowance after base64 expansion.
app.use(express.json({ limit: "55mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      success: true,
      status: "ok",
      message: "AMG Library API and database are responding.",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Keep internal database diagnostics out of the public health response.
    console.error("Health check database query failed:", error.message);
    return res.status(503).json({
      success: false,
      status: "unavailable",
      message: "The library service is temporarily unavailable.",
      timestamp: new Date().toISOString()
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/ebooks", ebookRoutes);
app.use("/api/copies", copyRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/notifications", notificationRoutes);

app.use((err, req, res, next) => {
  console.error("API error:", err);

  if (err.message?.includes("CORS")) {
    return res.status(403).json({
      success: false,
      message: "This website is not allowed to access the AMG Library API."
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "The upload is too large. E-books are limited to 30 MB and cover images to 5 MB."
    });
  }

  res.status(500).json({
    success: false,
    message: "An unexpected server error occurred."
  });
});

export default app;
