/**
 * Extract a human-readable message from an ImapFlow error.
 *
 * ImapFlow errors thrown by `client.connect()` or IMAP commands carry extra
 * properties beyond the standard `Error.message`:
 *   - `response`  — the raw IMAP server response line, e.g.
 *                   "2 NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)"
 *   - `code`      — Node.js network error code, e.g. "ECONNREFUSED"
 *
 * `Error.message` is always the generic "Command failed" for IMAP-level errors,
 * so we prefer `response` when present and fall back to `message` for network errors.
 *
 * The raw IMAP response starts with a command tag and status token (e.g. "2 NO ").
 * These are protocol artefacts not useful to end users, so we strip them.
 */
export function imapErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.response === 'string' && e.response.length > 0) {
      // Strip leading IMAP tag + status: "2 NO " / "A1 BAD " → keep the rest
      return e.response.replace(/^\S+\s+(NO|BAD|OK)\s+/i, '').trim() || e.response
    }
    if (typeof e.message === 'string' && e.message.length > 0) return e.message
  }
  return 'Unknown error'
}
