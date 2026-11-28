import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

export async function authenticate(req, res, next) {
  try {
    const cookieToken = req.headers.cookie
      ?.split(";")
      .map(part => part.trim())
      .find(part => part.startsWith("amg_session="))
      ?.slice("amg_session=".length);
    const token = cookieToken ? decodeURIComponent(cookieToken) : "";

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        success: false,
        message: "Authentication is temporarily unavailable."
      });
    }

    if (token.split(".").length !== 3) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session."
      });
    }

    // Tokens are issued with HS256. Pin verification to that algorithm.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication."
      });
    }

    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.login_code, u.role, u.status, u.session_version,
              mp.membership_number, mp.date_of_birth, mp.approved_at, mp.phone, mp.address,
              mp.gender, mp.school, mp.study_level, mp.edu_level,
              mp.guardian_name, mp.guardian_relation, mp.guardian_phone, mp.photo_storage_key, mp.avatar_choice
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication."
      });
    }

    const user = result.rows[0];

    if (Number(decoded.sessionVersion ?? 0) !== Number(user.session_version ?? 0)) {
      return res.status(401).json({
        success: false,
        message: "This session has been revoked. Please sign in again."
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "This account is not active."
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session."
      });
    }

    next(error);
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource."
      });
    }

    next();
  };
}
