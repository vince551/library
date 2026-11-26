import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  listPublicEbooks,
  listManageEbooks,
  uploadEbook,
  streamEbook,
  streamEbookCover,
  deleteEbook
} from "../controllers/ebook.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = Router();
const librarianAccess = [authenticate, authorize("librarian", "admin")];

const ebookDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many e-book downloads. Please try again later." }
});

const ebookUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "The upload limit has been reached. Please try again later." }
});

router.get("/", listPublicEbooks);
router.get("/manage", ...librarianAccess, listManageEbooks);
router.post("/", ...librarianAccess, ebookUploadLimiter, uploadEbook);
router.get("/:id/cover", streamEbookCover);
router.get("/:id/file", authenticate, authorize("member", "librarian", "admin"), ebookDownloadLimiter, streamEbook);
router.delete("/:id", ...librarianAccess, deleteEbook);

export default router;
