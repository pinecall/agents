// The socket to the gateway: the key at the door, backoff on the way back, a ping while it is up.

import { decodeEntry, type Command, type Entry } from "@pinecall/protocol";
import WebSocket from "ws";
import { appsUrl } from "./endpoints.js";
import { PinecallError } from "./frames.js";
import { asError } from "./listeners.js";
import { signed, type World } from "./signed.js";

/** How long the client waits before trying again, and how fast that grows. */
export interface Backoff {
  firstMs: number;
  capMs: number;
  factor: number;
}

/** Where the gateway is, who we are to it, and how patient to be. */
export interface ConnectionOptions {
  url: string;
  apiKey: string;
  /** The world this socket holds its agents in; none is the sandbox. See `signed.ts`. */
  env?: World;
  pingMs?: number;
  backoff?: Partial<Backoff>;
}

/** What the client does with what the socket brings. */
export interface ConnectionHandlers {
  /** The socket is up: send everything that must be true again before anything else is sent. */
  onOpen: () => Promise<void>;
  /** One log entry, exactly as the gateway wrote it. */
  onEntry: (entry: Entry) => void;
  /** A frame we could not read, a listener that threw, a socket that failed. */
  onError: (error: Error) => void;
  /** Time to prove the socket is alive. */
  onHeartbeat: () => void;
}

const DEFAULT_BACKOFF: Backoff = { firstMs: 500, capMs: 30_000, factor: 2 };
const DEFAULT_PING_MS = 30_000;

/**
 * One connection over its whole life, reconnects included.
 *
 * The key travels as `Authorization: Bearer` on the upgrade, never in the URL, because a URL ends
 * up in an access log. A wrong key is closed with 1008 and no body, so a socket that never opens
 * is retried like any other: the gateway will not say more the second time either.
 */
// What the gateway closes a socket with when the key is real and may not open that door: not a
// blip to retry, a decision to report. RFC 6455's policy violation.
const POLICY_VIOLATION = 1008;

export class Connection {
  #socket: WebSocket | null = null;
  #reconnect: NodeJS.Timeout | null = null;
  #ping: NodeJS.Timeout | null = null;
  #attempt = 0;
  #closed = false;
  #failed: Error | null = null;
  #opened: ((error?: Error) => void) | null = null;
  readonly #backoff: Backoff;
  readonly #pingMs: number;

  constructor(
    private readonly options: ConnectionOptions,
    private readonly handlers: ConnectionHandlers,
  ) {
    this.#backoff = { ...DEFAULT_BACKOFF, ...options.backoff };
    this.#pingMs = options.pingMs ?? DEFAULT_PING_MS;
  }

  /** True between the socket opening and it closing again. */
  get open(): boolean {
    return this.#socket?.readyState === WebSocket.OPEN;
  }

  /** Open the socket and resolve once `onOpen` has run. After that, staying up is our problem. */
  async start(): Promise<void> {
    this.#closed = false;
    return new Promise<void>((resolve, reject) => {
      this.#opened = (error) => {
        this.#opened = null;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      this.#dial();
    });
  }

  /** One frame up. A command sent while the socket is down is refused, not queued. */
  send(command: Command): void {
    const socket = this.#socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      throw new PinecallError(`${command.type}: the gateway is not connected`);
    }
    socket.send(JSON.stringify(command));
  }

  /**
   * The process is leaving: keep the socket that is up, and dial no other if it drops. A socket
   * dialled mid-drain would register every agent again and be handed calls the drain just moved.
   */
  leaving(): void {
    this.#closed = true;
    if (this.#reconnect !== null) clearTimeout(this.#reconnect);
    this.#reconnect = null;
  }

  /** Stop, and stay stopped: no reconnect follows a close the app asked for. */
  close(): void {
    this.#closed = true;
    this.#stopTimers();
    this.#socket?.close();
    this.#socket = null;
  }

  #dial(): void {
    const socket = new WebSocket(appsUrl(this.options.url), {
      headers: signed(this.options.apiKey, this.options.env),
    });
    this.#socket = socket;
    socket.on("open", () => void this.#onOpen());
    socket.on("message", (raw: Buffer) => this.#onMessage(raw));
    socket.on("error", (failed: Error) => {
      this.#failed = failed;
      this.handlers.onError(failed);
    });
    socket.on("close", (code: number, reason: Buffer) => this.#onClose(code, reason.toString()));
  }

  async #onOpen(): Promise<void> {
    this.#attempt = 0;
    this.#failed = null;
    try {
      await this.handlers.onOpen();
    } catch (failed) {
      // The socket is up and what must be true on it is not. Whoever called `start` hears it as a
      // rejection and that is the whole report; on a reconnect nobody is waiting there, and then
      // the app's error door is the only one. Both, and one failure is printed twice.
      if (this.#opened === null) {
        this.handlers.onError(asError(failed));
      } else {
        this.#opened(asError(failed));
      }
      return;
    }
    this.#ping = setInterval(() => this.handlers.onHeartbeat(), this.#pingMs);
    this.#opened?.();
  }

  #onMessage(raw: Buffer): void {
    try {
      this.handlers.onEntry(decodeEntry(JSON.parse(raw.toString()) as unknown));
    } catch (failed) {
      this.handlers.onError(asError(failed));
    }
  }

  #onClose(code: number, reason: string): void {
    this.#stopTimers();
    this.#socket = null;
    if (this.#closed) {
      return;
    }
    // The gateway says WHY in the close frame's reason — `this key does not open app: it opens
    // calls · evals` — and the app printed `closed with 1008`, a number, for a refusal a person
    // could act on in a second (production, 2026-09-20). A close with no reason keeps the code,
    // because that is all there is.
    const why = new PinecallError(`the gateway refused the socket: ${this.#failed?.message ?? (reason || `closed with ${code}`)}`);
    // The first connection failing is the app's to hear: a wrong key, a host nobody is on. Every
    // close after one that worked is a blip, and a blip is answered with a retry, not a rejection.
    if (this.#opened !== null) {
      this.#opened(why);
      return;
    }
    // Except a REFUSAL, which 1008 is: a key whose scopes do not open this door will not open it
    // on the third try either. Retrying that for ever is a process that says nothing while nothing
    // works — `pinecall start` with a key that cannot hold an agent did exactly that.
    if (code === POLICY_VIOLATION) {
      this.#closed = true;
      this.handlers.onError(why);
      return;
    }
    this.#reconnect = setTimeout(() => this.#dial(), this.#waitMs());
  }

  // Full jitter: every client that lost the same gateway comes back at a different moment.
  #waitMs(): number {
    const window = Math.min(this.#backoff.capMs, this.#backoff.firstMs * this.#backoff.factor ** this.#attempt);
    this.#attempt += 1;
    return Math.random() * window;
  }

  #stopTimers(): void {
    for (const timer of [this.#reconnect, this.#ping]) {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
    this.#reconnect = null;
    this.#ping = null;
  }
}
