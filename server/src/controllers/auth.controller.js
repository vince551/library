import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../config/database.js";
import { nextAmgNumber } from "../domain/amg-numbering.js";

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(255),
  // Keep this aligned with the registration form's visible 8-character rule.
  password: z.string().min(8, "Password must contain at least 8 characters.").max(128),
  gender: z.string().trim().max(40).optional().default(""),
  school: z.string().trim().min(1).max(160),
  studyLevel: z.string().trim().min(1).max(80),
  eduLevel: z.string().trim().max(80).optional().default(""),
  guardianName: z.string().trim().min(1).max(120),
  guardianRelation: z.string().trim().max(40).optional().default(""),
  guardianPhone: z.string().trim().min(5).max(30)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128)
});

function createToken(user) {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

export async function register(req, res, next) {
  const client = await pool.connect();

  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = String(firstIssue?.path?.[0] || "");
      const fieldMessages = {
        fullName: "Enter your full name (at least 2 characters).",
        email: "Enter a valid email address.",
        password: "Password must contain at least 8 characters."
      };

      return res.status(400).json({
        success: false,
        message: fieldMessages[field] || "Please check your registration details.",
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const { fullName, email, password, gender, school, studyLevel, eduLevel, guardianName, guardianRelation, guardianPhone } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await client.query(
      `INSERT INTO users
        (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'member', 'pending')
       RETURNING id, full_name, email, role, status`,
      [fullName, normalizedEmail, passwordHash]
    );

    const user = userResult.rows[0];

    const membershipNumber = await nextAmgNumber(client, "M");

    await client.query(
      `INSERT INTO member_profiles
        (user_id, membership_number, gender, school, study_level, edu_level,
         guardian_name, guardian_relation, guardian_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.id, membershipNumber, gender || null, school, studyLevel, eduLevel || null,
       guardianName, guardianRelation || null, guardianPhone]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Registration submitted. Your account is awaiting approval.",
      user
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email and password."
      });
    }

    const { email, password } = parsed.data;

    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.status,
              mp.membership_number, mp.approved_at, mp.phone, mp.address,
              mp.gender, mp.school, mp.study_level, mp.edu_level,
              mp.guardian_name, mp.guardian_relation, mp.guardian_phone
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: user.status === "pending"
          ? "Your account is awaiting librarian approval."
          : "Your account is not currently active."
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        status: user.status,
        membership_number: user.membership_number,
        approved_at: user.approved_at,
        phone: user.phone,
        address: user.address,
        gender: user.gender,
        school: user.school,
        study_level: user.study_level,
        edu_level: user.edu_level,
        guardian_name: user.guardian_name,
        guardian_relation: user.guardian_relation,
        guardian_phone: user.guardian_phone
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res) {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user.id,
      fullName: req.user.full_name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      membership_number: req.user.membership_number,
      approved_at: req.user.approved_at,
      phone: req.user.phone,
      address: req.user.address,
      gender: req.user.gender,
      school: req.user.school,
      study_level: req.user.study_level,
      edu_level: req.user.edu_level,
      guardian_name: req.user.guardian_name,
      guardian_relation: req.user.guardian_relation,
      guardian_phone: req.user.guardian_phone
    }
  });
}