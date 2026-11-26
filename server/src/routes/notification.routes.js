import { Router } from "express";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from "../controllers/notification.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = Router();
router.use(authenticate, authorize("member"));
router.get("/", listMyNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);
export default router;
