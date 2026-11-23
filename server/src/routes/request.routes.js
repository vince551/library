import { Router } from "express";
import {
  createBorrowRequest,
  getMyBorrowRequests,
  getBorrowRequests,
  decideBorrowRequest
} from "../controllers/request.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/mine", authenticate, authorize("member"), getMyBorrowRequests);
router.post("/", authenticate, authorize("member"), createBorrowRequest);
router.get("/", authenticate, authorize("librarian", "admin"), getBorrowRequests);
router.patch("/:id", authenticate, authorize("librarian", "admin"), decideBorrowRequest);

export default router;
