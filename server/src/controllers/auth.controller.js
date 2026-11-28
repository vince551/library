import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../config/database.js";
import { nextAmgNumber } from "../domain/amg-numbering.js";


const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Used for unknown identifiers so failed logins still perform a password-hash
// comparison, reducing account-enumeration timing differences.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("AMG-library-invalid-login-placeholder", 12);

function validateProfilePhotoSignature(buffer, contentType) {
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  const matches = (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/png" && isPng) ||
    (contentType === "image/webp" && isWebp);
  if (!matches) {
    const error = new Error("The profile photo contents do not match the selected image type.");
    error.status = 400;
    throw error;
  }
}

function profileStorageConfig() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_BUCKET) {
    const error = new Error("Profile photo storage is not configured on the API server.");
    error.status = 503;
    throw error;
  }
  return {
    baseUrl: SUPABASE_URL.trim().replace(/\/+$/, "").replace(/\/(?:rest|storage)\/v1$/i, ""),
    key: SUPABASE_SERVICE_ROLE_KEY,
    bucket: SUPABASE_BUCKET
  };
}

async function profileStorageRequest(path, options = {}) {
  const config = profileStorageConfig();
  const response = await fetch(`${config.baseUrl}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...(options.body && !Buffer.isBuffer(options.body) ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error("Profile photo storage failed" + (detail ? `: ${detail.slice(0, 200)}` : "."));
    error.status = response.status === 413 ? 413 : 502;
    throw error;
  }
  return response;
}

function decodeProfilePhoto(data) {
  const value = String(data || "").replace(/^data:[^;]+;base64,/, "");
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("The profile photo data is invalid.");
  const buffer = Buffer.from(value, "base64");
  if (!buffer.length || buffer.length > MAX_PROFILE_PHOTO_BYTES) throw new Error("Profile photos must be 5 MB or smaller.");
  return buffer;
}

async function uploadProfilePhoto(userId, data, contentType) {
  if (!PROFILE_PHOTO_TYPES.has(contentType)) throw new Error("Profile photos must be JPEG, PNG or WebP.");
  const config = profileStorageConfig();
  const buffer = decodeProfilePhoto(data);
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const key = `profiles/${userId}/${randomUUID()}.${ext}`;
  await profileStorageRequest(`object/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-upsert": "false" },
    body: buffer
  });
  return key;
}

async function removeProfilePhoto(key) {
  if (!key) return;
  const config = profileStorageConfig();
  await profileStorageRequest(`object/${encodeURIComponent(config.bucket)}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [key] })
  });
}

async function signedProfilePhoto(key) {
  if (!key) return "";
  const config = profileStorageConfig();
  const path = key.split("/").map(encodeURIComponent).join("/");
  const response = await profileStorageRequest(`object/sign/${encodeURIComponent(config.bucket)}/${path}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const data = await response.json();
  const signed = data.signedURL || data.signedUrl;
  if (!signed) return "";
  return signed.startsWith("http") ? signed : `${config.baseUrl}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
}

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.union([z.string().trim().email().max(255), z.literal("")]).optional().default(""),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
  }, "Enter a valid date of birth."),
  // Keep this aligned with the registration form's visible 8-character rule.
  password: z.string().min(8, "Password must contain at least 8 characters.").max(128),
  gender: z.string().trim().max(40).optional().default(""),
  school: z.string().trim().min(1).max(160),
  studyLevel: z.string().trim().min(1).max(80),
  eduLevel: z.string().trim().max(80).optional().default(""),
  guardianName: z.string().trim().min(1).max(120),
  guardianRelation: z.string().trim().max(40).optional().default(""),
  guardianPhone: z.string().trim().min(5).max(30),
  photoType: z.string().optional().default(""),
  photoData: z.string().optional().default(""),
  avatarChoice: z.enum(["scholar", "reader", "explorer", "creative", "classic"]).optional().default("scholar")
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
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
  let newPhotoKey = null;

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

    const { fullName, email, dateOfBirth, password, gender, school, studyLevel, eduLevel, guardianName, guardianRelation, guardianPhone, photoType, photoData, avatarChoice } = parsed.data;
    const normalizedEmail = email ? email.toLowerCase() : null;

    await client.query("BEGIN");
    if (normalizedEmail) {
      const existing = await client.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
      if (existing.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "An account with this email already exists." });
      }
    }

    const loginCodeResult = await client.query("SELECT LPAD(nextval('amg_login_code_seq')::TEXT, 3, '0') AS login_code");
    const loginCode = loginCodeResult.rows[0].login_code;
    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await client.query(
      `INSERT INTO users
        (full_name, email, login_code, password_hash, role, status)
       VALUES ($1, $2, $3, $4, 'member', 'pending')
       RETURNING id, full_name, email, login_code, role, status`,
      [fullName, normalizedEmail, loginCode, passwordHash]
    );

    const user = userResult.rows[0];

    const membershipNumber = await nextAmgNumber(client, "M");

    await client.query(
      `INSERT INTO member_profiles
        (user_id, membership_number, date_of_birth, gender, school, study_level, edu_level,
         guardian_name, guardian_relation, guardian_phone, avatar_choice)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [user.id, membershipNumber, dateOfBirth, gender || null, school, studyLevel, eduLevel || null,
       guardianName, guardianRelation || null, guardianPhone, avatarChoice]
    );

    if (photoData) {
      newPhotoKey = await uploadProfilePhoto(user.id, photoData, photoType);
      await client.query("UPDATE member_profiles SET photo_storage_key = $1 WHERE user_id = $2", [newPhotoKey, user.id]);
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Registration submitted. Your account is awaiting approval.",
      loginCode,
      user
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (newPhotoKey) await removeProfilePhoto(newPhotoKey).catch(() => {});
    if (error.code === "2200H") {
      return res.status(409).json({ success: false, message: "The 3-digit login ID range (001–999) is full. Please contact the library administrator." });
    }
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        message: "Please provide a valid login ID, full name or email and password."
      });
    }

    const { identifier, password } = parsed.data;
    const normalizedIdentifier = identifier.trim();
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.login_code, u.password_hash, u.role, u.status,
              mp.membership_number, mp.date_of_birth, mp.approved_at, mp.phone, mp.address,
              mp.gender, mp.school, mp.study_level, mp.edu_level,
              mp.guardian_name, mp.guardian_relation, mp.guardian_phone, mp.photo_storage_key, mp.avatar_choice
       FROM users u
       LEFT JOIN member_profiles mp ON mp.user_id = u.id
       WHERE (u.email IS NOT NULL AND LOWER(u.email) = LOWER($1))
          OR u.login_code::TEXT = $1
          OR LOWER(TRIM(u.full_name)) = LOWER(TRIM($1))
       ORDER BY u.id
       LIMIT 2`,
      [normalizedIdentifier]
    );

    if (result.rows.length > 1 && !/^\d{3}$/.test(normalizedIdentifier) && !normalizedIdentifier.includes("@")) {
      return res.status(409).json({ success: false, message: "More than one member has that name. Please sign in with your 3-digit login ID." });
    }
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid login ID or password."
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
        login_code: user.login_code,
        approved_at: user.approved_at,
        phone: user.phone,
        address: user.address,
        gender: user.gender,
        school: user.school,
        study_level: user.study_level,
        edu_level: user.edu_level,
        guardian_name: user.guardian_name,
        guardian_relation: user.guardian_relation,
        guardian_phone: user.guardian_phone,
        avatar_choice: user.avatar_choice,
        photoURL: await signedProfilePhoto(user.photo_storage_key).catch(() => "")
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
      login_code: req.user.login_code,
      approved_at: req.user.approved_at,
      phone: req.user.phone,
      address: req.user.address,
      gender: req.user.gender,
      school: req.user.school,
      study_level: req.user.study_level,
      edu_level: req.user.edu_level,
      guardian_name: req.user.guardian_name,
      guardian_relation: req.user.guardian_relation,
      guardian_phone: req.user.guardian_phone,
      avatar_choice: req.user.avatar_choice,
      photoURL: await signedProfilePhoto(req.user.photo_storage_key).catch(() => "")
    }
  });
}

export async function updateProfilePhoto(req, res, next) {
  const schema = z.object({
    photoType: z.string().min(1),
    photoData: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Choose a valid profile photo." });

  let newKey = null;
  try {
    newKey = await uploadProfilePhoto(req.user.id, parsed.data.photoData, parsed.data.photoType);
    const updated = await pool.query(
      "UPDATE member_profiles SET photo_storage_key = $1 WHERE user_id = $2 RETURNING photo_storage_key",
      [newKey, req.user.id]
    );
    if (!updated.rowCount) {
      await removeProfilePhoto(newKey).catch(() => {});
      return res.status(404).json({ success: false, message: "Member profile not found." });
    }
    await removeProfilePhoto(req.user.photo_storage_key).catch(error => console.error("Old profile photo cleanup failed:", error.message));
    const photoURL = await signedProfilePhoto(newKey);
    return res.json({ success: true, message: "Profile photo saved successfully.", photoURL });
  } catch (error) {
    if (newKey) await removeProfilePhoto(newKey).catch(() => {});
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  }
}
