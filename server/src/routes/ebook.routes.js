import { Router } from "express";
import {
  listPublicEbooks,
  listManageEbooks,
  uploadEbook,
  streamEbook,
  streamEbookCover,
  deleteEbook
} from "../controllers/ebook.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";\nimport rateLimit from "express-rate-limit";

const router = Router();
const librarianAccess = [authenticate, authorize("librarian", "admin")];\nconst ebookDownloadLimiter = rateLimit({\n  windowMs: 15 * 60 * 1000,\n  limit: 60,\n  standardHeaders: "draft-8",\n  legacyHeaders: false,\n  message: { success: false, message: "Too many e-book downloads. Please try again later." }\n});\nconst ebookUploadLimiter = rateLimit({\n  windowMs: 60 * 60 * 1000,\n  limit: 10,\n  standardHeaders: "draft-8",\n  legacyHeaders: false,\n  message: { success: false, message: "The upload limit has been reached. Please try again later." }\n});

router.get("/", listPublicEbooks);
router.get("/manage", ...librarianAccess, listManageEbooks);
router.post("/", ...librarianAccess, ebookUploadLimiter, uploadEbook);
router.get("/:id/cover", streamEbookCover);
router.get("/:id/file", authenticate, ebookDownloadLimiter, streamEbook);
router.delete("/:id", ...librarianAccess, deleteEbook);

export default router;
