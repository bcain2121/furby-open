import { config } from '../config/env.js';
import { FurbyPiRuntime } from '../runtime/pi-session.js';

const runtime = new FurbyPiRuntime();
try {
  const userId = config.telegramUserId || 1;
  const model = process.argv.slice(2).join(' ').trim() || config.defaultModel;
  console.log(`[smoke] model=${model}`);
  const response = await runtime.prompt(
    userId,
    'Smoke test only. Reply with one concise sentence confirming the Furby Open Pi runtime works and mention whether Pi skills are visible.',
    model,
  );
  console.log('\n[smoke] response:');
  console.log(response.text);
} catch (error) {
  console.error(`[smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  runtime.dispose();
}
