/** Application IDs and provider IDs are distinct; every persistence call is scoped. */
export interface Mailbox {
  id: string;
  workspace_id: string;
  address: string;
  status: 'connected' | 'disconnected' | 'error';
  generation: number;
  credential: string | null;
  checkpoint?: string | null;
  import_cursor?: string | null;
  import_anchor?: string | null;
  import_after?: string | null;
}
export interface ProviderCapabilities {
  reply: boolean;
  replyAll: boolean;
  incomingAttachments: boolean;
  sendAttachments: boolean;
  compose: boolean;
  forward: boolean;
  deliveryConfirmation: boolean;
  sendIdempotency: boolean;
  readStateMutation: boolean;
}
export interface NormalizedMessage {
  providerId: string;
  threadId: string;
  subject: string;
  snippet: string;
  date: string;
  from: string[];
  to: string[];
  cc: string[];
  replyTo: string[];
  messageId: string;
  references: string;
  /** Plain text only. Never insert into an HTML sink. */
  body: string;
  truncated: boolean;
  inInbox: boolean;
  sent: boolean;
  attachments: Array<{id: string; providerId: string; name: string; size: number; mimeType: string}>;
}
export interface SubmittedReply {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  threadId: string;
  inReplyTo: string;
  references: string;
  /** Stable per immutable outgoing operation; reconciliation hint, not provider idempotency. */
  messageId: string;
}
export interface SyncResult {
  messages?: NormalizedMessage[];
  deleted?: string[];
  checkpoint: string | null;
  cursor: string | null;
  anchor: string | null;
  after: string;
  continue: boolean;
  importVersion?: string;
  importComplete?: boolean;
  issue?: string;
}
export interface MailProvider {
  sync(): Promise<SyncResult>;
  watch(): Promise<{watchExpires: string}>;
  stop(): Promise<void>;
  /** Resolve authorization before the irreversible send boundary. */
  prepareSend(): Promise<void>;
  /** Provider acceptance only, never an assertion of recipient delivery. */
  send(payload: Readonly<SubmittedReply>): Promise<{id: string}>;
  reconcile(payload: Readonly<SubmittedReply>): Promise<string | null>;
  attachment(providerMessageId: string, providerAttachmentId: string): Promise<{data: string; size: number}>;
}
export interface MailStore {
  query(table: string, filters: Record<string, string | number>): Promise<Record<string, any>[]>;
  one(table: string, filters: Record<string, string | number>): Promise<Record<string, any> | undefined>;
  write(table: string, data: object, method?: string, filters?: object): Promise<unknown>;
  upsert(table: string, data: object, conflict: string): Promise<unknown>;
  /** Named operations with documented transaction/lease guarantees; not arbitrary SQL. */
  rpc(name: string, arguments_: object): Promise<any>;
}
export type CredentialReader = (ciphertext: string, environment: object, mailboxContext: string) => Promise<{refreshToken: string}>;
export type AdapterFactory = (mailbox: Mailbox) => MailProvider;
