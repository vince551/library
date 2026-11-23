const PREFIXES = Object.freeze({
  M: "AMG-M-",
  B: "AMG-B-",
  C: "AMG-C-",
  E: "AMG-E-",
  L: "AMG-L-",
  R: "AMG-R-",
  A: "AMG-A-"
});

/** Format a positive sequential value with a four-digit minimum width. */
export function formatAmgNumber(type, value) {
  const prefix = PREFIXES[type];
  const sequence = Number(value);
  if (!prefix) throw new TypeError(`Unsupported AMG number type: ${type}`);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new TypeError("AMG sequence values must be positive safe integers.");
  }
  return prefix + String(sequence).padStart(4, "0");
}

/**
 * Allocate an identifier inside the caller's transaction (or a pool query).
 * PostgreSQL's ON CONFLICT counter update is atomic across concurrent requests.
 */
export async function nextAmgNumber(client, type) {
  if (!PREFIXES[type]) {
    throw new TypeError(`Unsupported AMG number type: ${type}`);
  }
  const result = await client.query("SELECT next_amg_number($1) AS number", [type]);
  return result.rows[0].number;
}
