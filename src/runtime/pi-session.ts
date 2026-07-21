import fs from 'node:fs';
import path from 'node:path';
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';
import { appUserIdForTelegram, openDatabase } from '../db/database.js';
import { listRecentMediaAssets } from '../db/media.js';
import { formatMemoryContext, searchMemories } from '../db/memory.js';
import { chooseModelResolution, parseModelName, requireAvailableModel } from '../models/model-selection.js';
import { correlationId, logEvent } from '../observability/logger.js';
import { createA2ATools } from '../a2a/tools.js';
import { effectiveToolNames, type ToolMode } from './capability-policy.js';
import { InteractionQueue } from './interaction-queue.js';
import { createFurbyResourceLoader } from './resource-policy.js';
import { createDbTools } from './db-tools.js';
import { createInfoTools } from './info-tools.js';
import { createMediaTools } from './media-tools.js';
import { createMemoryTools } from './memory-tools.js';
import { createScheduleTools } from './schedule-tools.js';
import { createTelegramTools } from './telegram-tools.js';
import { createVaultTools } from './vault-tools.js';

export interface FurbyImageInput {
  mediaType: string;
  data: string;
}

export interface FurbyResponse {
  text: string;
}

export function extractAssistantTextSince(messages: any[], startIndex = 0) {
  for (let index = messages.length - 1; index >= Math.max(0, startIndex); index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    if (typeof message.content === 'string' && message.content.trim()) return message.content.trim();
    if (Array.isArray(message.content)) {
      const text = message.content
        .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
        .map((part: any) => part.text)
        .join('')
        .trim();
      if (text) return text;
    }
  }
  return '';
}

export type { ToolMode } from './capability-policy.js';

export type FurbyPromptPurpose = 'interactive' | 'scheduled' | 'a2a';

export const FURBY_SESSION_SETTINGS = Object.freeze({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 1 },
  steeringMode: 'all' as const,
  followUpMode: 'all' as const,
});

export function createFurbyCustomTools(userId: number, purpose: FurbyPromptPurpose) {
  return [
    ...createInfoTools(),
    ...createMemoryTools(userId),
    ...createMediaTools(userId),
    ...createScheduleTools(userId),
    ...createVaultTools(),
    ...(purpose === 'a2a' ? [] : createTelegramTools()),
    ...createDbTools(),
    ...(purpose === 'a2a' ? createA2ATools() : []),
  ];
}

interface SessionRecord {
  userId: number;
  purpose: FurbyPromptPurpose;
  session: AgentSession;
  requestedModelName: string;
  activeModelName: string;
  fallbackUsed: boolean;
  toolMode: ToolMode;
}

export class FurbyPiRuntime {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly freshSessionKeys = new Set<string>();
  private readonly interactions = new InteractionQueue<string>();
  private readonly interactiveSessionReady = new Map<number, Promise<SessionRecord | null>>();
  readonly authStorage: ReturnType<typeof AuthStorage.create>;
  readonly modelRegistry: ModelRegistry;

  constructor() {
    this.authStorage = AuthStorage.create(config.piAuthPath);
    this.applyRuntimeApiKeys();
    this.modelRegistry = config.piModelsPath
      ? ModelRegistry.create(this.authStorage, config.piModelsPath)
      : ModelRegistry.create(this.authStorage);
  }

  private applyRuntimeApiKeys() {
    if (config.minimaxApiKey) this.authStorage.setRuntimeApiKey('minimax', config.minimaxApiKey);
    if (config.openaiApiKey) this.authStorage.setRuntimeApiKey('openai', config.openaiApiKey);
    if (config.anthropicApiKey) this.authStorage.setRuntimeApiKey('anthropic', config.anthropicApiKey);
    if (config.googleApiKey) this.authStorage.setRuntimeApiKey('google', config.googleApiKey);
    if (config.openrouterApiKey) this.authStorage.setRuntimeApiKey('openrouter', config.openrouterApiKey);
  }

  private async createSession(userId: number, modelName: string, toolMode: ToolMode, purpose: FurbyPromptPurpose) {
    const safeUserId = String(userId).replace(/[^0-9]/g, '') || 'default';
    const sessionDir = purpose === 'interactive'
      ? path.join(config.sessionRoot, safeUserId)
      : path.join(config.sessionRoot, safeUserId, purpose);
    fs.mkdirSync(sessionDir, { recursive: true });

    const modelResolution = await chooseModelResolution(this.modelRegistry, modelName, config.fallbackModel);
    const systemPromptPath = path.join(config.rootDir, 'src', 'config', 'system.md');
    const soulPromptPath = path.join(config.rootDir, 'src', 'config', 'soul.md');
    const localPersonalityPath = path.join(config.rootDir, '.data', 'personality.md');
    const systemPromptParts = [systemPromptPath, soulPromptPath, localPersonalityPath]
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => fs.readFileSync(filePath, 'utf8').trim())
      .filter(Boolean);
    const templateContext = [
      `Assistant name: ${config.name}`,
      `Owner/user name: ${config.ownerName}`,
      `Default timezone: ${config.assistantTimezone}`,
      `Default location: ${config.assistantLocation}`,
      `Mobile vault root: ${config.mobileVaultRoot}`,
    ].join('\n');
    const systemPrompt = systemPromptParts.length > 0 ? `${templateContext}\n\n---\n\n${systemPromptParts.join('\n\n---\n\n')}` : templateContext;

    const resourceLoader = createFurbyResourceLoader({
      cwd: config.rootDir,
      agentDir: config.piAgentDir,
      purpose,
      systemPrompt,
      loadGlobalSkills: config.loadGlobalSkills,
    });
    await resourceLoader.reload();

    const settingsManager = SettingsManager.inMemory(FURBY_SESSION_SETTINGS);

    const customTools = createFurbyCustomTools(userId, purpose);

    const freshSessionKey = `${purpose}:${userId}`;
    const useFreshSession = this.freshSessionKeys.has(freshSessionKey);
    const effectiveTools = effectiveToolNames(toolMode, customTools.map((tool: any) => String(tool.name)));
    if (purpose === 'a2a') {
      for (const toolName of ['write_a2a_response', 'list_a2a_pending']) {
        if (!effectiveTools.custom.includes(toolName)) effectiveTools.custom.push(toolName);
      }
    }

    const { session } = await createAgentSession({
      cwd: config.rootDir,
      agentDir: config.piAgentDir,
      model: modelResolution.model,
      thinkingLevel: config.piThinkingLevel,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      resourceLoader,
      sessionManager: useFreshSession
        ? SessionManager.create(config.rootDir, sessionDir)
        : SessionManager.continueRecent(config.rootDir, sessionDir),
      settingsManager,
      tools: [...effectiveTools.builtIn, ...effectiveTools.custom],
      customTools,
    });

    if (useFreshSession) this.freshSessionKeys.delete(freshSessionKey);
    return { session, modelResolution };
  }

  async prompt(
    userId: number,
    text: string,
    modelName: string,
    toolMode: ToolMode = config.toolMode,
    images: FurbyImageInput[] = [],
    purpose: FurbyPromptPurpose = 'interactive',
  ): Promise<FurbyResponse> {
    return this.interactions.run(`${purpose}:${userId}`, () => this.promptSerialized(userId, text, modelName, toolMode, images, purpose));
  }

  async promptInteractiveBatch(
    userId: number,
    text: string,
    modelName: string,
    toolMode: ToolMode = config.toolMode,
    images: FurbyImageInput[] = [],
  ) {
    let resolveReady!: (record: SessionRecord | null) => void;
    const ready = new Promise<SessionRecord | null>((resolve) => {
      resolveReady = resolve;
    });
    this.interactiveSessionReady.set(userId, ready);
    try {
      return await this.interactions.run(`interactive:${userId}`, () => this.promptSerialized(
        userId,
        text,
        modelName,
        toolMode,
        images,
        'interactive',
        resolveReady,
      ));
    } catch (error) {
      resolveReady(null);
      throw error;
    } finally {
      if (this.interactiveSessionReady.get(userId) === ready) this.interactiveSessionReady.delete(userId);
    }
  }

  async steerInteractive(userId: number, text: string, images: FurbyImageInput[] = []) {
    const record = await this.requireInteractiveSession(userId, 'steering');
    await record.session.steer(this.withMemoryContext(userId, text), this.toPiImages(images));
  }

  async followUpInteractive(userId: number, text: string, images: FurbyImageInput[] = []) {
    const record = await this.requireInteractiveSession(userId, 'follow-up delivery');
    await record.session.followUp(this.withMemoryContext(userId, text), this.toPiImages(images));
  }

  private async requireInteractiveSession(userId: number, operation: string) {
    const record = this.sessions.get(`interactive:${userId}`) ?? await this.interactiveSessionReady.get(userId);
    if (!record) throw new Error(`No active interactive Furby session is available for ${operation}.`);
    return record;
  }

  private toPiImages(images: FurbyImageInput[]) {
    return images.map((image) => ({
      type: 'image' as const,
      mimeType: image.mediaType,
      data: image.data,
    }));
  }

  private async promptSerialized(
    userId: number,
    text: string,
    modelName: string,
    toolMode: ToolMode,
    images: FurbyImageInput[],
    purpose: FurbyPromptPurpose,
    onSessionReady?: (record: SessionRecord) => void,
  ): Promise<FurbyResponse> {
    const canonicalModelName = parseModelName(modelName).canonical;
    const sessionKey = `${purpose}:${userId}`;
    let record = this.sessions.get(sessionKey);
    if (!record || record.requestedModelName !== canonicalModelName || record.toolMode !== toolMode) {
      record?.session.dispose();
      const created = await this.createSession(userId, canonicalModelName, toolMode, purpose);
      record = {
        userId,
        purpose,
        session: created.session,
        requestedModelName: created.modelResolution.requested,
        activeModelName: created.modelResolution.active,
        fallbackUsed: created.modelResolution.fallbackUsed,
        toolMode,
      };
      this.sessions.set(sessionKey, record);
    }
    onSessionReady?.(record);

    const promptText = this.withMemoryContext(userId, text);
    const messageStartIndex = (record.session.agent.state.messages as any[]).length;

    const interactionId = correlationId('interaction');
    const startedAt = Date.now();
    logEvent('info', 'interaction.started', {
      interactionId,
      userId,
      purpose,
      requestedModel: record.requestedModelName,
      activeModel: record.activeModelName,
      toolMode,
    });

    let streamedText = '';
    const unsubscribe = record.session.subscribe((event: any) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        streamedText += event.assistantMessageEvent.delta;
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (
        config.showThinkingStream &&
        event.type === 'message_update' &&
        event.assistantMessageEvent?.type === 'thinking_delta'
      ) {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.type === 'tool_execution_start') {
        console.log(`\n[tool] ${event.toolName}`);
      }
    });

    let promptTimeout: NodeJS.Timeout | undefined;
    try {
      const promptOperation = record.session.prompt(promptText, {
        images: images.map((image) => ({
          type: 'image' as const,
          mimeType: image.mediaType,
          data: image.data,
        })),
      });
      const timeoutOperation = new Promise<void>((_resolve, reject) => {
        promptTimeout = setTimeout(() => {
          void record.session.abort().finally(() => {
            reject(new Error(`Pi interaction timed out after ${config.piPromptTimeoutSeconds} seconds.`));
          });
        }, config.piPromptTimeoutSeconds * 1000);
      });
      await Promise.race([promptOperation, timeoutOperation]);
      await record.session.waitForIdle();
      process.stdout.write('\n');
      const latestText = extractAssistantTextSince(record.session.agent.state.messages as any[], messageStartIndex)
        || streamedText.trim()
        || (purpose === 'a2a' ? 'A2A response completed through the response tool.' : '');
      if (!latestText) {
        throw new Error('The selected model did not return a new response. Try again or switch models.');
      }
      logEvent('info', 'interaction.completed', {
        interactionId,
        userId,
        purpose,
        durationMs: Date.now() - startedAt,
      });
      return { text: latestText };
    } catch (error) {
      logEvent('error', 'interaction.failed', {
        interactionId,
        userId,
        purpose,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (promptTimeout) clearTimeout(promptTimeout);
      unsubscribe();
    }
  }

  async reset(userId: number, freshSession = true) {
    await this.interactions.waitForIdle((key) => key === `interactive:${userId}`);
    const key = `interactive:${userId}`;
    const record = this.sessions.get(key);
    record?.session.dispose();
    this.sessions.delete(key);
    if (freshSession) this.freshSessionKeys.add(key);
    else this.freshSessionKeys.delete(key);
  }

  async abortPurpose(purpose: FurbyPromptPurpose) {
    const records = [...this.sessions.values()].filter((record) => record.purpose === purpose);
    await Promise.allSettled(records.map((record) => record.session.abort()));
    for (const record of records) {
      record.session.dispose();
      this.sessions.delete(`${record.purpose}:${record.userId}`);
    }
  }

  async validateModel(modelName: string) {
    const model = await requireAvailableModel(this.modelRegistry, modelName);
    return `${model.provider}/${model.id}`;
  }

  status(userId: number) {
    const record = this.sessions.get(`interactive:${userId}`);
    return {
      active: Boolean(record),
      requestedModel: record?.requestedModelName ?? null,
      model: record?.activeModelName ?? null,
      fallbackUsed: record?.fallbackUsed ?? false,
      toolMode: record?.toolMode ?? config.toolMode,
      thinkingLevel: config.piThinkingLevel,
      agentDir: config.piAgentDir,
    };
  }

  async listSkills(limit = 80) {
    const resourceLoader = createFurbyResourceLoader({
      cwd: config.rootDir,
      agentDir: config.piAgentDir,
      purpose: 'interactive',
      loadGlobalSkills: config.loadGlobalSkills,
    });
    await resourceLoader.reload();
    const { skills } = resourceLoader.getSkills();
    return skills.slice(0, limit).map((skill) => ({ name: skill.name, description: skill.description }));
  }

  dispose() {
    for (const record of this.sessions.values()) record.session.dispose();
    this.sessions.clear();
  }

  private withMemoryContext(userId: number, text: string) {
    if (text.trim().startsWith('/')) return text;
    const db = openDatabase();
    try {
      const appUserId = appUserIdForTelegram(userId);
      const memories = searchMemories(db, appUserId, text, 3);
      const memoryContext = formatMemoryContext(memories);
      const wantsMediaContext = /\b(file|document|pdf|image|photo|upload|attachment|voice|audio|that|recent|last)\b/iu.test(text);
      const mediaContext = wantsMediaContext
        ? listRecentMediaAssets(db, appUserId, 3).map((asset, index) => (
          `${index + 1}. ${asset.id} | ${asset.vault_path} | ${asset.mime_type ?? 'unknown'} | ${asset.preview_text ?? ''}`
        )).join('\n')
        : '';
      const contextBlocks = [memoryContext, mediaContext ? `Recent assistant media uploads:\n${mediaContext}` : ''].filter(Boolean);
      if (contextBlocks.length === 0) return text;
      return `${text}\n\n[${contextBlocks.join('\n\n')}]`;
    } catch (error) {
      console.warn('[memory] auto-recall failed', error);
      return text;
    } finally {
      db.close();
    }
  }

}
