
import { Router } from "express";

import {
  searchMembers,
  issueBook,
  getLoans,
  returnBook,
  getMemberLoans
} from "../controllers/loan.controller.js";


import {
  authenticate,
  authorize
} from "../middleware/auth.middleware.js";

const router = Router();

const librarianAccess = [
  authenticate,
  authorize("librarian", "admin")
];

router.use(...librarianAccess);

router.get("/members/search", searchMembers);
router.get("/", getLoans);
router.post("/issue", issueBook);
router.post("/return", returnBook);
router.get("/member/:memberId", getMemberLoans);

export default router;
