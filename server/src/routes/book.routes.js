
import { Router } from "express";

import {
  getBooks,
  getManageBooks,
  createBook,
  registerPhysicalBook,
  updateBook,
  deleteBook,
  streamBookCover
} from "../controllers/book.controller.js";

import {
  authenticate,
  authorize
} from "../middleware/auth.middleware.js";

const router = Router();

const librarianAccess = [
  authenticate,
  authorize("librarian", "admin")
];

// Public catalogue
router.get("/", getBooks);

// Librarian management
router.get("/manage", ...librarianAccess, getManageBooks);
router.get("/:id/cover", streamBookCover);
router.post("/", ...librarianAccess, createBook);
router.post("/register", ...librarianAccess, registerPhysicalBook);
router.patch("/:id", ...librarianAccess, updateBook);
router.delete("/:id", ...librarianAccess, deleteBook);

export default router;
