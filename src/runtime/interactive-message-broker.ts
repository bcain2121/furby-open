import type { FurbyImageInput, FurbyResponse } from './pi-session.js';

export interface InteractiveMessage {
  text: string;
  images?: FurbyImageInput[];
}

export interface InteractiveBatchHandlers {
  runInitial(messages: readonly InteractiveMessage[]): Promise<FurbyResponse>;
  steer(message: InteractiveMessage): Promise<void>;
}

export interface InteractiveSubmission {
  owner: boolean;
  completion?: Promise<FurbyResponse>;
}

interface Batch {
  phase: 'collecting' | 'running';
  messages: InteractiveMessage[];
  handlers: InteractiveBatchHandlers;
  completion: Promise<FurbyResponse>;
  resolve: (response: FurbyResponse) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
  steeringTail: Promise<void>;
}

export function combineInteractiveMessages(messages: readonly InteractiveMessage[]) {
  if (messages.length === 1) return messages[0].text;
  const sections = messages.map((message, index) => `[Message ${index + 1}]\n${message.text}`);
  return [
    'The user sent these Telegram messages in rapid succession. Treat them as one request and answer them together.',
    '',
    ...sections.flatMap((section, index) => index === sections.length - 1 ? [section] : [section, '']),
  ].join('\n');
}

export class InteractiveMessageBroker<Key> {
  private readonly batches = new Map<Key, Batch>();

  constructor(private readonly coalesceMs: number) {}

  submit(key: Key, message: InteractiveMessage, handlers: InteractiveBatchHandlers): InteractiveSubmission {
    const existing = this.batches.get(key);
    if (existing) {
      if (existing.phase === 'collecting') {
        existing.messages.push(message);
      } else {
        existing.steeringTail = existing.steeringTail.then(() => existing.handlers.steer(message));
      }
      return { owner: false };
    }

    let resolve!: (response: FurbyResponse) => void;
    let reject!: (error: unknown) => void;
    const completion = new Promise<FurbyResponse>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const batch: Batch = {
      phase: 'collecting',
      messages: [message],
      handlers,
      completion,
      resolve,
      reject,
      timer: setTimeout(() => this.start(key), this.coalesceMs),
      steeringTail: Promise.resolve(),
    };
    this.batches.set(key, batch);
    return { owner: true, completion };
  }

  async waitForIdle(key?: Key) {
    if (key !== undefined) {
      const completion = this.batches.get(key)?.completion;
      if (completion) await completion.catch(() => undefined);
      return;
    }
    await Promise.allSettled([...this.batches.values()].map((batch) => batch.completion));
  }

  pendingKeys() {
    return this.batches.size;
  }

  dispose(reason = new Error('Interactive message broker disposed')) {
    for (const [key, batch] of this.batches.entries()) {
      clearTimeout(batch.timer);
      batch.reject(reason);
      this.batches.delete(key);
    }
  }

  private start(key: Key) {
    const batch = this.batches.get(key);
    if (!batch || batch.phase !== 'collecting') return;
    batch.phase = 'running';
    const initialMessages = [...batch.messages];
    void (async () => {
      try {
        const response = await batch.handlers.runInitial(initialMessages);
        while (true) {
          const tail = batch.steeringTail;
          await tail;
          if (tail === batch.steeringTail) break;
        }
        batch.resolve(response);
      } catch (error) {
        batch.reject(error);
      } finally {
        if (this.batches.get(key) === batch) this.batches.delete(key);
      }
    })();
  }
}
