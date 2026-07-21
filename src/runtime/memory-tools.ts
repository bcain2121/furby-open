import { defineTool } from '@earendil-works/pi-coding-agent';
import { appUserIdForTelegram, openDatabase } from '../db/database.js';
import { saveMemory, searchConversationMessages, searchMemories } from '../db/memory.js';

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function createMemoryTools(telegramUserId: number) {
  const userId = appUserIdForTelegram(telegramUserId);
  return [
    defineTool({
      name: 'furby_memory_save',
      label: 'Save Furby Memory',
      description: 'Save a durable, user-owned assistant memory when the user asks you to remember a stable preference or fact.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memory content to save.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
          importanceScore: { type: 'number', description: 'Importance from 1 to 10.', default: 5 },
        },
        required: ['content'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const db = openDatabase();
        try {
          const id = saveMemory(db, {
            userId,
            content: String(params.content ?? ''),
            tags: Array.isArray(params.tags) ? params.tags : [],
            importanceScore: Number(params.importanceScore ?? 5),
            metadata: { saved_by: 'furby_memory_save' },
          });
          return textResult(`Saved memory ${id}.`, { id });
        } finally {
          db.close();
        }
      },
    }),
    defineTool({
      name: 'furby_memory_search',
      label: 'Search Furby Memories',
      description: 'Search durable memories saved by this assistant.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 5 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const db = openDatabase();
        try {
          const rows = searchMemories(db, userId, String(params.query ?? ''), Number(params.limit ?? 5));
          return textResult(JSON.stringify(rows, null, 2), { count: rows.length });
        } finally {
          db.close();
        }
      },
    }),
    defineTool({
      name: 'furby_conversation_search',
      label: 'Search Furby Conversation History',
      description: 'Search conversation messages stored by this assistant.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const db = openDatabase();
        try {
          const rows = searchConversationMessages(db, userId, String(params.query ?? ''), Number(params.limit ?? 10));
          return textResult(JSON.stringify(rows, null, 2), { count: rows.length });
        } finally {
          db.close();
        }
      },
    }),
  ];
}
