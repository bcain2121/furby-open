import http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { A2ATaskStore, isValidA2ATaskId } from './store.js';

interface A2ARuntime {
  prompt(
    userId: number,
    text: string,
    modelName: string,
    toolMode: 'safe' | 'coding',
    images: [],
    purpose: 'a2a',
  ): Promise<{ text: string }>;
  abortPurpose?(purpose: 'a2a'): Promise<void>;
}

export interface FurbyA2AServiceOptions {
  hostname: string;
  port: number;
  taskDir: string;
  userId: number;
  modelName: string;
  maxConcurrency: number;
  agentName: string;
  skills?: string[];
  maxBodyBytes?: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export class FurbyA2AService {
  readonly store: A2ATaskStore;
  private server: http.Server | null = null;
  private readonly queued = new Set<string>();
  private readonly queue: string[] = [];
  private readonly processing = new Set<Promise<void>>();
  private readonly sseTimers = new Set<NodeJS.Timeout>();
  private activeCount = 0;
  private stopping = false;

  constructor(
    private readonly runtime: A2ARuntime,
    private readonly options: FurbyA2AServiceOptions,
  ) {
    this.store = new A2ATaskStore(options.taskDir);
  }

  get running() {
    return Boolean(this.server?.listening);
  }

  get address() {
    return this.server?.address() as AddressInfo | null;
  }

  async start() {
    if (this.server) return;
    this.stopping = false;
    this.store.cleanupCompleted();
    const server = http.createServer((request, response) => this.handleHttp(request, response));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        this.server = null;
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        server.on('error', (error) => console.error('[a2a] server error', error));
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.options.port, this.options.hostname);
    });
    for (const task of this.store.listPending()) this.enqueue(task.id);
    console.log(`[a2a] listening on ${this.options.hostname}:${this.address?.port ?? this.options.port}`);
  }

  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    for (const timer of this.sseTimers) clearInterval(timer);
    this.sseTimers.clear();
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await this.runtime.abortPurpose?.('a2a').catch(() => undefined);
    await Promise.allSettled([...this.processing]);
    this.queue.length = 0;
    this.queued.clear();
    console.log('[a2a] stopped');
  }

  private handleHttp(request: http.IncomingMessage, response: http.ServerResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-a2a-token');

    if (request.method === 'OPTIONS') {
      response.writeHead(200).end();
      return;
    }
    if (request.method === 'GET' && request.url === '/') {
      this.writeJson(response, 200, this.agentCard());
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      this.writeJson(response, 200, {
        status: 'ok',
        pendingTasks: this.store.listPending().length,
        processingTasks: this.activeCount,
      });
      return;
    }

    const taskRoute = request.url?.match(/^\/tasks\/([A-Za-z0-9._-]+)(\/stream)?(?:\?.*)?$/u);
    if (request.method === 'GET' && taskRoute) {
      const taskId = taskRoute[1];
      if (!isValidA2ATaskId(taskId)) {
        this.writeJson(response, 400, { error: 'Invalid task ID' });
        return;
      }
      if (taskRoute[2] === '/stream') this.openSse(request, response, taskId);
      else this.writeJson(response, 200, this.store.get(taskId) ?? { error: 'Task not found' });
      return;
    }

    if (request.method !== 'POST' || (request.url !== '/' && request.url !== '')) {
      response.writeHead(404).end();
      return;
    }

    let body = '';
    let rejected = false;
    request.on('data', (chunk) => {
      if (rejected) return;
      body += chunk;
      if (Buffer.byteLength(body) > (this.options.maxBodyBytes ?? 1024 * 1024)) {
        rejected = true;
        this.writeJson(response, 413, { error: 'Request body exceeds 1 MiB' });
      }
    });
    request.on('end', () => {
      if (rejected) return;
      try {
        const rpc = JSON.parse(body) as JsonRpcRequest;
        this.writeJson(response, 200, this.handleJsonRpc(rpc));
      } catch {
        this.writeJson(response, 400, {
          jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' },
        });
      }
    });
  }

  private handleJsonRpc(request: JsonRpcRequest) {
    const id = request.id ?? null;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } };
    }
    if (request.method === 'agents/get' || request.method === 'agent/get') {
      return { jsonrpc: '2.0', id, result: this.agentCard() };
    }
    if (request.method === 'tasks/send' || request.method === 'task/send') {
      const params = request.params as { taskId?: string; message?: { parts?: Array<{ text?: string }> } } | undefined;
      const taskId = params?.taskId || randomUUID();
      const message = params?.message?.parts?.map((part) => part.text ?? '').join('\n').trim() ?? '';
      if (!isValidA2ATaskId(taskId)) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Invalid task ID' } };
      }
      if (!message) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Task message is required' } };
      }
      const existing = this.store.get(taskId);
      if (!existing) {
        this.store.create({
          id: taskId,
          status: 'pending',
          message: { role: 'user', parts: [{ type: 'text', text: message }] },
          createdAt: Date.now(),
        });
        this.enqueue(taskId);
      }
      return {
        jsonrpc: '2.0', id,
        result: { taskId, status: existing?.status ?? 'pending', message: 'Task queued. Poll /tasks/{taskId} or use SSE /tasks/{taskId}/stream' },
      };
    }
    if (request.method === 'tasks/get' || request.method === 'task/get') {
      const taskId = String(request.params?.taskId ?? '');
      if (!isValidA2ATaskId(taskId)) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Valid task ID is required' } };
      }
      const task = this.store.get(taskId);
      return task
        ? { jsonrpc: '2.0', id, result: task }
        : { jsonrpc: '2.0', id, error: { code: -32602, message: 'Task not found' } };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method '${request.method}' not found` } };
  }

  private enqueue(taskId: string) {
    if (this.queued.has(taskId) || this.stopping) return;
    this.queued.add(taskId);
    this.queue.push(taskId);
    this.pump();
  }

  private pump() {
    while (!this.stopping && this.activeCount < this.options.maxConcurrency && this.queue.length > 0) {
      const taskId = this.queue.shift()!;
      this.activeCount += 1;
      const operation = this.processTask(taskId)
        .catch((error) => console.error(`[a2a] task ${taskId} failed`, error))
        .finally(() => {
          this.activeCount -= 1;
          this.queued.delete(taskId);
          this.processing.delete(operation);
          this.pump();
        });
      this.processing.add(operation);
    }
  }

  private async processTask(taskId: string) {
    const task = this.store.markProcessing(taskId);
    if (!task) return;
    const message = task.message?.parts.map((part) => part.text).join('\n').trim() ?? '';
    try {
      const response = await this.runtime.prompt(
        this.options.userId,
        `[A2A:${taskId}]\n\n${message}\n\n[/A2A:${taskId}]\n\nRespond to this network agent request. Use write_a2a_response with taskId ${taskId} for the final answer.`,
        this.options.modelName,
        'safe',
        [],
        'a2a',
      );
      if (!this.store.getCompleted(taskId)) this.store.complete(taskId, response.text);
    } catch (error) {
      if (!this.store.getCompleted(taskId)) {
        this.store.fail(taskId, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private openSse(request: http.IncomingMessage, response: http.ServerResponse, taskId: string) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = () => {
      const task = this.store.get(taskId);
      if (!task) return;
      response.write(`data: ${JSON.stringify(task)}\n\n`);
      if (task.status === 'completed' || task.status === 'failed') close();
    };
    const timer = setInterval(send, 250);
    this.sseTimers.add(timer);
    const close = () => {
      clearInterval(timer);
      this.sseTimers.delete(timer);
      if (!response.writableEnded) response.end();
    };
    request.on('close', close);
    send();
  }

  private agentCard() {
    return {
      name: this.options.agentName,
      description: 'Furby personal assistant, compatible with the global Pi A2A task protocol',
      version: '1.0.0',
      capabilities: {
        streaming: true,
        pushNotifications: false,
        tools: ['write_a2a_response', 'list_a2a_pending'],
        skills: this.options.skills ?? [],
      },
    };
  }

  private writeJson(response: http.ServerResponse, status: number, payload: unknown) {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  }
}
