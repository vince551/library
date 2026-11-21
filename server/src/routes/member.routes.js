
import { Router } from "express";

import {
  getMembers,
  approveMember,
  rejectMember,
  suspendMember,
  reactivateMember
} from "../controllers/member.controller.js";

import {
  authenticate,
  authorize
} from "../middleware/auth.middleware.js";

const router = Router();

router.use(
  authenticate,
  authorize("librarian", "admin")
);

router.get("/", getMembers);
router.patch("/:memberId/approve", approveMember);
router.patch("/:memberId/reject", rejectMember);
router.patch("/:memberId/suspend", suspendMember);
router.patch("/:memberId/reactivate", reactivateMember);

export default router;
