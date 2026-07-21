export type ToolMode = 'safe' | 'coding';

const BUILT_IN_TOOLS: Record<ToolMode, readonly string[]> = {
  safe: ['read'],
  coding: ['read', 'bash', 'edit', 'write'],
};

export const SAFE_CUSTOM_TOOL_NAMES = new Set([
  'furby_get_time',
  'furby_get_weather',
  'furby_memory_search',
  'furby_conversation_search',
  'furby_media_recent',
  'furby_schedule_list',
  'furby_vault_read',
  'furby_vault_search',
  'furby_vault_list',
  'furby_db_query',
]);

export function isToolAllowed(mode: ToolMode, toolName: string) {
  if (BUILT_IN_TOOLS[mode].includes(toolName)) return true;
  return mode === 'coding' || SAFE_CUSTOM_TOOL_NAMES.has(toolName);
}

export function effectiveToolNames(mode: ToolMode, registeredCustomToolNames: readonly string[]) {
  return {
    builtIn: [...BUILT_IN_TOOLS[mode]],
    custom: registeredCustomToolNames.filter((name) => isToolAllowed(mode, name)),
  };
}

export function securityModeSummary(mode: ToolMode) {
  if (mode === 'safe') {
    return 'read-only Pi access plus approved read-only Furby tools; file writes, memory writes, schedule changes, media generation, and Telegram sends are disabled';
  }
  return 'read/bash/edit/write Pi access plus all registered Furby tools';
}
