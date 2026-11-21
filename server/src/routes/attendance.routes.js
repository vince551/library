import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { getAttendanceRecords, recordAttendanceScan } from "../controllers/attendance.controller.js";

const router = Router();
router.use(authenticate, authorize("librarian", "admin"));
router.get("/", getAttendanceRecords);
router.post("/scan", recordAttendanceScan);
export default router;
