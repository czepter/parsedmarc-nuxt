import { ImapFlow } from 'imapflow'
import type { FetchMessageObject } from 'imapflow'

export interface ImapClientConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export interface FetchedMessage {
  uid: number
  source: Buffer
}

/**
 * Thin wrapper around ImapFlow that exposes only the operations
 * the DMARC ingestion pipeline needs. Lifecycle: connect → work → disconnect.
 */
export class ImapClient {
  private client: ImapFlow

  constructor(config: ImapClientConfig) {
    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass, loginMethod: 'LOGIN' },
      // Suppress imapflow's internal verbose logging — ingest.ts logs at the appropriate level.
      logger: false,
    })
  }

  /** Connect and authenticate. Throws if the server is unreachable or credentials are wrong. */
  async connect(): Promise<void> {
    await this.client.connect()
  }

  /**
   * Return UIDs of all unseen messages in the given mailbox.
   * The lock is acquired and released internally.
   */
  async getUnseenUids(mailbox = 'INBOX'): Promise<number[]> {
    const lock = await this.client.getMailboxLock(mailbox)
    try {
      const uids = await this.client.search({ seen: false }, { uid: true })
      return (uids as number[]) ?? []
    }
    finally {
      lock.release()
    }
  }

  /**
   * Fetch the raw source (RFC 822 bytes) for a list of UIDs.
   * All UIDs must be from the same mailbox. Acquires and releases the mailbox lock.
   */
  async fetchByUids(uids: number[], mailbox = 'INBOX'): Promise<FetchedMessage[]> {
    if (uids.length === 0) return []
    const lock = await this.client.getMailboxLock(mailbox)
    try {
      const messages = await this.client.fetchAll(
        uids as unknown as string,
        { source: true, uid: true },
        { uid: true },
      )
      return (messages as FetchMessageObject[]).map(m => ({
        uid: m.uid!,
        source: m.source as unknown as Buffer,
      }))
    }
    finally {
      lock.release()
    }
  }

  /**
   * Mark a list of UIDs as \Seen (read). Acquires and releases the mailbox lock.
   */
  async markSeen(uids: number[], mailbox = 'INBOX'): Promise<void> {
    if (uids.length === 0) return
    const lock = await this.client.getMailboxLock(mailbox)
    try {
      await this.client.messageFlagsAdd(
        uids as unknown as string,
        ['\\Seen'],
        { uid: true },
      )
    }
    finally {
      lock.release()
    }
  }

  /**
   * Move a list of UIDs from `sourceMailbox` to `destinationMailbox`.
   * Acquires and releases the source mailbox lock.
   */
  async moveToFolder(uids: number[], destination: string, sourceMailbox = 'INBOX'): Promise<void> {
    if (uids.length === 0) return
    const lock = await this.client.getMailboxLock(sourceMailbox)
    try {
      await this.client.messageMove(
        uids as unknown as string,
        destination,
        { uid: true },
      )
    }
    finally {
      lock.release()
    }
  }

  /** Graceful IMAP logout and connection teardown. Safe to call even if connect() failed. */
  async disconnect(): Promise<void> {
    try {
      await this.client.logout()
    }
    catch {
      // Ignore errors during disconnect — server may have already closed the connection.
    }
  }
}
