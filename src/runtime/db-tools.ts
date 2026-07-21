import { defineTool } from '@earendil-works/pi-coding-agent';
import { openDatabase } from '../db/database.js';

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function assertReadOnlySql(sql: string) {
  const trimmed = sql.trim();
  if (!/^(select|with|explain)\b/iu.test(trimmed)) {
    throw new Error('Only read-only SELECT/WITH/EXPLAIN queries are allowed. PRAGMA statements are not permitted.');
  }
  const withoutStrings = trimmed.replace(/'[^']*'/gu, "''").replace(/"[^"]*"/gu, '""');
  if (/[;]\s*\S/u.test(withoutStrings)) throw new Error('Only one SQL statement is allowed.');
  if (/\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|reindex|truncate|pragma)\b/iu.test(withoutStrings)) {
    throw new Error('Mutating SQL and PRAGMA statements are not allowed.');
  }
}

export function createDbTools() {
  return [
    defineTool({
      name: 'furby_db_query',
      label: 'Read Furby SQLite Database',
      description: 'Run a read-only SQL query against the assistant SQLite database for introspection and debugging.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string' },
          params: { type: 'object', additionalProperties: true, default: {} },
          limit: { type: 'number', default: 50 },
        },
        required: ['sql'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const sql = String(params.sql ?? '');
        assertReadOnlySql(sql);
        const limit = Math.max(1, Math.min(Number(params.limit ?? 50), 200));
        const db = openDatabase();
        try {
          db.pragma('query_only = ON');
          const rows = db.prepare(sql).all(params.params ?? {}).slice(0, limit);
          return textResult(JSON.stringify(rows, null, 2), { count: rows.length, limit });
        } finally {
          db.close();
        }
      },
    }),
  ];
}
