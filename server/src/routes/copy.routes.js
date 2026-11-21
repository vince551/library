
import { Router } from "express";

import {
  getBookCopies,
  getAllCopies,
  createCopy,
  updateCopy,
  deleteCopy
} from "../controllers/copy.controller.js";

import {
  authenticate,
  authorize
} from "../middleware/auth.middleware.js";

const router = Router();

const librarianAccess = [
  authenticate,
  authorize("librarian", "admin")
];

// All physical inventory
router.get("/", ...librarianAccess, getAllCopies);

// Copies belonging to a particular book
router.get("/book/:bookId", ...librarianAccess, getBookCopies);

// Add a physical copy
router.post("/", ...librarianAccess, createCopy);

// Update copy details
router.patch("/:id", ...librarianAccess, updateCopy);

// Delete a copy
router.delete("/:id", ...librarianAccess, deleteCopy);

export default router;
