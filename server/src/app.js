import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import bookRoutes from "./routes/book.routes.js";
import ebookRoutes from "./routes/ebook.routes.js";
import copyRoutes from "./routes/copy.routes.js";
import loanRoutes from "./routes/loan.routes.js";
import memberRoutes from "./routes/member.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));

// Base64 file uploads are JSON-encoded. Keep the limit just above the
// 30 MB e-book + 5 MB cover allowance after base64 expansion.
app.use(express.json({ limit: "55mb" }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "AMG Library API is running",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/ebooks", ebookRoutes);
app.use("/api/copies", copyRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/attendance", attendanceRoutes);

app.use((err, req, res, next) => {
  console.error("API error:", err);

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
