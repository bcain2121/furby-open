import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SAFE_CUSTOM_TOOL_NAMES,
  effectiveToolNames,
  isToolAllowed,
} from '../src/runtime/capability-policy.js';

const allCustomTools = [
  'furby_get_time',
  'furby_get_weather',
  'furby_memory_save',
  'furby_memory_search',
  'furby_conversation_search',
  'furby_media_recent',
  'furby_media_extract_text',
  'furby_schedule_create',
  'furby_schedule_list',
  'furby_schedule_update',
  'furby_vault_write',
  'furby_vault_append',
  'furby_vault_read',
  'furby_vault_search',
  'furby_vault_list',
  'furby_telegram_send_file',
  'furby_db_query',
];

test('safe mode includes only explicitly approved read-only tools', () => {
  const effective = effectiveToolNames('safe', allCustomTools);
  assert.deepEqual(effective.builtIn, ['read']);
  assert.deepEqual(effective.custom, allCustomTools.filter((name) => SAFE_CUSTOM_TOOL_NAMES.has(name)));

  for (const forbidden of [
    'bash',
    'edit',
    'write',
    'furby_memory_save',
    'furby_media_extract_text',
    'furby_schedule_create',
    'furby_schedule_update',
    'furby_vault_write',
    'furby_vault_append',
    'furby_telegram_send_file',
  ]) {
    assert.equal(isToolAllowed('safe', forbidden), false, `${forbidden} must not be available in safe mode`);
  }
});

test('coding mode preserves all registered custom tools and coding built-ins', () => {
  const effective = effectiveToolNames('coding', allCustomTools);
  assert.deepEqual(effective.builtIn, ['read', 'bash', 'edit', 'write']);
  assert.deepEqual(effective.custom, allCustomTools);
});

test('safe mode fails closed for newly registered custom tools', () => {
  assert.equal(isToolAllowed('safe', 'furby_future_mutating_tool'), false);
});
