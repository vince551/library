
import { Router } from "express";

import {
  searchMembers,
  issueBook,
  getLoans,
  returnBook,
  getMemberLoans,
  getMyLoans,
  getActiveLoanByBarcode
} from "../controllers/loan.controller.js";


import {
  authenticate,
  authorize
} from "../middleware/auth.middleware.js";

const router = Router();

router.get("/mine", authenticate, authorize("member"), getMyLoans);

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
router.get("/copy/:barcode/active", getActiveLoanByBarcode);

export default router;
