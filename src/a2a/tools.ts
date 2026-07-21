import { defineTool } from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';
import { A2ATaskStore, isValidA2ATaskId } from './store.js';

function result(text: string, details: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function createA2ATools(store?: A2ATaskStore) {
  const taskStore = () => store ??= new A2ATaskStore(config.a2aDir);
  return [
    defineTool({
      name: 'write_a2a_response',
      label: 'Write A2A Response',
      description: 'Write the final response to an incoming task identified by an [A2A:taskId] marker.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'A2A task ID from the request marker.' },
          response: { type: 'string', description: 'Final response returned to the calling agent.' },
        },
        required: ['taskId', 'response'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const taskId = String(params.taskId ?? '');
        const response = String(params.response ?? '');
        if (!isValidA2ATaskId(taskId)) throw new Error('Invalid A2A task ID');
        if (!response.trim()) throw new Error('A2A response cannot be empty');
        taskStore().complete(taskId, response);
        return result(`A2A response written for task ${taskId}.`, { taskId, responseLength: response.length });
      },
    }),
    defineTool({
      name: 'list_a2a_pending',
      label: 'List A2A Pending',
      description: 'List incoming A2A tasks that are awaiting a response.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const tasks = taskStore().listPending();
        if (tasks.length === 0) return result('No A2A tasks pending response.', { count: 0 });
        const text = tasks.map((task) => {
          const message = task.message?.parts.map((part) => part.text).join(' ') ?? '';
          return `${task.id}: ${message}`;
        }).join('\n');
        return result(text, { count: tasks.length });
      },
    }),
  ];
}
