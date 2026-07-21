import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseModelResolution,
  parseModelName,
  requireAvailableModel,
} from '../src/models/model-selection.js';

test('GPT-5.6 SOL aliases resolve to the OpenAI Codex model', () => {
  for (const alias of ['codex', 'sol', 'gpt56', 'gpt-5.6-sol']) {
    assert.deepEqual(parseModelName(alias), {
      provider: 'openai-codex',
      modelId: 'gpt-5.6-sol',
      canonical: 'openai-codex/gpt-5.6-sol',
    });
  }
});

test('MiniMax M3 aliases resolve to the MiniMax model', () => {
  for (const alias of ['minimax', 'minimax3', 'm3']) {
    assert.deepEqual(parseModelName(alias), {
      provider: 'minimax',
      modelId: 'MiniMax-M3',
      canonical: 'minimax/MiniMax-M3',
    });
  }
});

const availableModels = [
  { provider: 'openai-codex', id: 'gpt-5.6-sol', name: 'GPT-5.6 SOL' },
  { provider: 'minimax', id: 'MiniMax-M3', name: 'MiniMax M3' },
] as any[];
const registry = {
  getAvailable: async () => availableModels,
  find: () => undefined,
} as any;

test('explicit model validation rejects unavailable models', async () => {
  await assert.rejects(requireAvailableModel(registry, 'minimax/not-real'), /not currently available/u);
  const model = await requireAvailableModel(registry, 'gpt56');
  assert.equal(model.id, 'gpt-5.6-sol');
});

test('model resolution reports the actual fallback model', async () => {
  const resolution = await chooseModelResolution(registry, 'openai-codex/not-available', 'minimax3');
  assert.equal(resolution.requested, 'openai-codex/not-available');
  assert.equal(resolution.active, 'minimax/MiniMax-M3');
  assert.equal(resolution.fallbackUsed, true);
});
