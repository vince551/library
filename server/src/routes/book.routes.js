
import { Router } from "express";

import {
  getBooks,
  getManageBooks,
  createBook,
  updateBook,
  deleteBook
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
router.post("/", ...librarianAccess, createBook);
router.patch("/:id", ...librarianAccess, updateBook);
router.delete("/:id", ...librarianAccess, deleteBook);

export default router;
