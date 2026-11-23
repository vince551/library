const NUMBER_TYPES = new Set(["M", "B", "C", "E", "L", "R", "A"]);

/**
 * Allocate an identifier inside the caller's transaction.
 * PostgreSQL's ON CONFLICT counter update is atomic across concurrent requests.
 */
export async function nextAmgNumber(client, type) {
  if (!NUMBER_TYPES.has(type)) {
    throw new TypeError(`Unsupported AMG number type: ${type}`);
  }
  const result = await client.query("SELECT next_amg_number($1) AS number", [type]);
  return result.rows[0].number;
}
