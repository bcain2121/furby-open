import fs from 'node:fs';
import path from 'node:path';
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';

export const MODEL_ALIASES: Record<string, string> = {
  codex: 'openai-codex/gpt-5.6-sol',
  sol: 'openai-codex/gpt-5.6-sol',
  gpt56: 'openai-codex/gpt-5.6-sol',
  'gpt-5.6-sol': 'openai-codex/gpt-5.6-sol',
  gpt55: 'openai-codex/gpt-5.5',
  'gpt-5.5': 'openai-codex/gpt-5.5',
  gpt54: 'openai-codex/gpt-5.4',
  minimax: 'minimax/MiniMax-M3',
  minimax3: 'minimax/MiniMax-M3',
  m3: 'minimax/MiniMax-M3',
  m27: 'minimax/MiniMax-M2.7',
  'm2.7': 'minimax/MiniMax-M2.7',
  'minimax-fast': 'minimax/MiniMax-M2.7-highspeed',
  m27fast: 'minimax/MiniMax-M2.7-highspeed',
};

export interface ParsedModelName {
  provider: string;
  modelId: string;
  canonical: string;
}

export function parseModelName(input: string): ParsedModelName {
  const expanded = MODEL_ALIASES[input.trim().toLowerCase()] ?? input.trim();
  const separator = expanded.includes('/') ? '/' : expanded.includes(':') ? ':' : '';
  if (!separator) {
    return { provider: 'minimax', modelId: expanded, canonical: `minimax/${expanded}` };
  }

  const [provider, ...rest] = expanded.split(separator);
  const modelId = rest.join(separator).trim();
  if (!provider || !modelId) {
    throw new Error(`Invalid model name: ${input}`);
  }

  const normalizedProvider = provider === 'gemini' ? 'google' : provider;
  return {
    provider: normalizedProvider,
    modelId,
    canonical: `${normalizedProvider}/${modelId}`,
  };
}

export function findModel(registry: ModelRegistry, input: string): Model<any> | undefined {
  const parsed = parseModelName(input);
  return registry.find(parsed.provider as any, parsed.modelId);
}

export interface ModelResolution {
  requested: string;
  active: string;
  model: Model<any>;
  fallbackUsed: boolean;
}

function canonicalModelName(model: Model<any>) {
  return `${model.provider}/${model.id}`;
}

export async function requireAvailableModel(registry: ModelRegistry, input: string): Promise<Model<any>> {
  const requested = parseModelName(input).canonical;
  const available = await registry.getAvailable();
  const model = available.find((candidate) => canonicalModelName(candidate) === requested);
  if (!model) {
    throw new Error(`Model ${requested} is not currently available. Run \`pi /login\`, configure its API key, or choose a model from /models.`);
  }
  return model;
}

export async function chooseModelResolution(registry: ModelRegistry, preferred: string, fallback: string): Promise<ModelResolution> {
  const requested = parseModelName(preferred).canonical;
  const available = await registry.getAvailable();
  const preferredModel = available.find((candidate) => canonicalModelName(candidate) === requested);
  if (preferredModel) {
    return { requested, active: canonicalModelName(preferredModel), model: preferredModel, fallbackUsed: false };
  }

  const fallbackName = parseModelName(fallback).canonical;
  const fallbackModel = available.find((candidate) => canonicalModelName(candidate) === fallbackName);
  if (fallbackModel) {
    return { requested, active: canonicalModelName(fallbackModel), model: fallbackModel, fallbackUsed: true };
  }

  const first = available[0];
  if (first) {
    return { requested, active: canonicalModelName(first), model: first, fallbackUsed: true };
  }

  throw new Error(`No usable model found. Tried ${preferred} and ${fallback}. Run \`pi /login\` or configure an API key.`);
}

export async function chooseModel(registry: ModelRegistry, preferred: string, fallback: string): Promise<Model<any>> {
  return (await chooseModelResolution(registry, preferred, fallback)).model;
}

export function loadPiScopedModels() {
  const settingsPath = path.join(config.piAgentDir, 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { enabledModels?: unknown };
    const enabled = Array.isArray(settings.enabledModels) ? settings.enabledModels.filter((model): model is string => typeof model === 'string') : [];
    return enabled.length > 0 ? enabled : [config.defaultModel, config.fallbackModel].filter(Boolean);
  } catch {
    return [config.defaultModel, config.fallbackModel].filter(Boolean);
  }
}

export function nextScopedModel(current: string | undefined) {
  const scoped = loadPiScopedModels();
  if (scoped.length === 0) return config.defaultModel;
  if (!current) return scoped[0];
  const index = scoped.findIndex((model) => model === current);
  return scoped[(index + 1) % scoped.length];
}

export async function listAvailableModelSummary(registry: ModelRegistry, limit = 20) {
  const available = await registry.getAvailable();
  return available.slice(0, limit).map((model) => ({
    provider: model.provider,
    id: model.id,
    name: model.name ?? model.id,
    input: model.input ?? [],
    contextWindow: model.contextWindow ?? null,
  }));
}
