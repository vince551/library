export async function createNotification(db, {
  userId, type, title, message, link = null, entityType = null, entityId = null
}) {
  if (!userId) return null;
  const result = await db.query(
    `INSERT INTO member_notifications
      (user_id, type, title, message, link, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, type, title, message, link, read_at, created_at`,
    [userId, type, title, message, link, entityType, entityId]
  );
  return result.rows[0];
}

export async function notifyActiveMembers(db, {
  type, title, message, link = null, entityType = null, entityId = null
}) {
  const result = await db.query(
    `INSERT INTO member_notifications
      (user_id, type, title, message, link, entity_type, entity_id)
     SELECT id, $1, $2, $3, $4, $5, $6
     FROM users
     WHERE role = 'member' AND status = 'active'
     RETURNING id`,
    [type, title, message, link, entityType, entityId]
  );
  return result.rowCount;
}
