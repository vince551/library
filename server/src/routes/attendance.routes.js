import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { getAttendanceRecords, getAttendanceSummary, recordAttendanceScan } from "../controllers/attendance.controller.js";

const router = Router();
router.use(authenticate, authorize("librarian", "admin"));
router.get("/", getAttendanceRecords);
router.get("/summary", getAttendanceSummary);
router.post("/scan", recordAttendanceScan);
export default router;
