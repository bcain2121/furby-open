import fs from 'node:fs';
import path from 'node:path';

export type A2ATaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface A2ATask {
  id: string;
  status: A2ATaskStatus;
  message?: { role: string; parts: Array<{ type: string; text: string }> };
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export function isValidA2ATaskId(value: string) {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._-]+$/u.test(value);
}

export class A2ATaskStore {
  readonly pendingDir: string;
  readonly completedDir: string;

  constructor(readonly rootDir: string) {
    this.pendingDir = path.join(rootDir, 'pending');
    this.completedDir = path.join(rootDir, 'completed');
    this.ensureDirectories();
  }

  create(task: A2ATask) {
    if (!isValidA2ATaskId(task.id)) throw new Error('Invalid A2A task ID');
    this.atomicWrite(this.taskPath(this.pendingDir, task.id), task);
  }

  markProcessing(taskId: string) {
    const task = this.getPending(taskId);
    if (!task) return null;
    task.status = 'processing';
    this.atomicWrite(this.taskPath(this.pendingDir, taskId), task);
    return task;
  }

  complete(taskId: string, result: string) {
    const existing = this.getPending(taskId) ?? this.getCompleted(taskId);
    if (!existing) throw new Error(`A2A task ${taskId} was not found`);
    const task: A2ATask = {
      ...existing,
      status: 'completed',
      result,
      error: undefined,
      completedAt: Date.now(),
    };
    this.atomicWrite(this.taskPath(this.completedDir, taskId), task);
    this.deletePending(taskId);
    return task;
  }

  fail(taskId: string, error: string) {
    const existing = this.getPending(taskId) ?? this.getCompleted(taskId);
    if (!existing) throw new Error(`A2A task ${taskId} was not found`);
    const task: A2ATask = {
      ...existing,
      status: 'failed',
      result: undefined,
      error,
      completedAt: Date.now(),
    };
    this.atomicWrite(this.taskPath(this.completedDir, taskId), task);
    this.deletePending(taskId);
    return task;
  }

  get(taskId: string) {
    return this.getCompleted(taskId) ?? this.getPending(taskId);
  }

  getPending(taskId: string) {
    return this.readTask(this.pendingDir, taskId);
  }

  getCompleted(taskId: string) {
    return this.readTask(this.completedDir, taskId);
  }

  listPending() {
    return this.listDirectory(this.pendingDir);
  }

  cleanupCompleted(maxAgeMs = 60 * 60 * 1000) {
    const threshold = Date.now() - maxAgeMs;
    for (const entry of fs.readdirSync(this.completedDir)) {
      const filePath = path.join(this.completedDir, entry);
      if (!entry.endsWith('.json')) continue;
      if (fs.statSync(filePath).mtimeMs < threshold) fs.unlinkSync(filePath);
    }
  }

  private ensureDirectories() {
    fs.mkdirSync(this.pendingDir, { recursive: true });
    fs.mkdirSync(this.completedDir, { recursive: true });
  }

  private taskPath(directory: string, taskId: string) {
    if (!isValidA2ATaskId(taskId)) throw new Error('Invalid A2A task ID');
    return path.join(directory, `${taskId}.json`);
  }

  private readTask(directory: string, taskId: string): A2ATask | null {
    if (!isValidA2ATaskId(taskId)) return null;
    const filePath = this.taskPath(directory, taskId);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as A2ATask;
    } catch {
      return null;
    }
  }

  private listDirectory(directory: string) {
    return fs.readdirSync(directory)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => this.readTask(directory, entry.slice(0, -5)))
      .filter((task): task is A2ATask => Boolean(task));
  }

  private deletePending(taskId: string) {
    const filePath = this.taskPath(this.pendingDir, taskId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  private atomicWrite(filePath: string, value: unknown) {
    this.ensureDirectories();
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, filePath);
  }
}
