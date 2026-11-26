import jwt from "jsonwebtoken";
import { pool } from "../config/database.js";

export async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    const token = authorization.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.status,
              mp.membership_number, mp.approved_at, mp.phone, mp.address,
              mp.gender, mp.school, mp.study_level, mp.edu_level,
              mp.guardian_name, mp.guardian_relation, mp.guardian_phone
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
      error.name === "JsonWebTokenError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token."
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