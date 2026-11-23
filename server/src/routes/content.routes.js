import { Router } from "express";
import { createPost, deletePost, listPublishedPosts } from "../controllers/content.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", listPublishedPosts);
router.post("/", authenticate, authorize("librarian", "admin"), createPost);
router.delete("/:id", authenticate, authorize("librarian", "admin"), deletePost);

export default router;
