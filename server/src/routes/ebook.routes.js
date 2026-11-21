import { Router } from "express";
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

router.get("/", listPublicEbooks);
router.get("/manage", ...librarianAccess, listManageEbooks);
router.post("/", ...librarianAccess, uploadEbook);
router.get("/:id/cover", streamEbookCover);
router.get("/:id/file", authenticate, streamEbook);
router.delete("/:id", ...librarianAccess, deleteEbook);

export default router;
