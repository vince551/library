import { Router } from "express";
import { getLibrarySettings, updateLibraryCapacity } from "../controllers/settings.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = Router();
router.use(authenticate, authorize("librarian", "admin"));
router.get("/", getLibrarySettings);
router.patch("/capacity", updateLibraryCapacity);

export default router;
