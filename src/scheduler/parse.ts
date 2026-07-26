const UNIT_SECONDS: Record<string, number> = {
  s: 1, sec: 1, second: 1, seconds: 1,
  m: 60, min: 60, minute: 60, minutes: 60,
  h: 3600, hr: 3600, hour: 3600, hours: 3600,
  d: 86400, day: 86400, days: 86400,
};

export interface ParsedScheduleSpec {
  scheduleKind: 'once' | 'interval';
  intervalSeconds?: number;
  runAt?: Date;
  nextRunAt: Date;
  prompt: string;
  title: string;
}

function parseDuration(text: string) {
  const match = text.trim().match(/^(\d+)\s*([a-zA-Z]+)$/u);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = UNIT_SECONDS[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || amount <= 0 || !unit) return undefined;
  return amount * unit;
}

function titleFromPrompt(prompt: string) {
  const cleaned = prompt.replace(/\s+/gu, ' ').trim();
  return cleaned.length <= 60 ? cleaned : `${cleaned.slice(0, 57)}...`;
}

export function parseScheduleCommand(argument: string, now = new Date()): ParsedScheduleSpec | undefined {
  const trimmed = argument.trim();
  const every = trimmed.match(/^every\s+(\d+\s*[a-zA-Z]+)\s+(?:do\s+)?([\s\S]+)$/iu);
  if (every) {
    const intervalSeconds = parseDuration(every[1]);
    const prompt = every[2].trim();
    if (!intervalSeconds || !prompt) return undefined;
    return {
      scheduleKind: 'interval',
      intervalSeconds,
      nextRunAt: new Date(now.getTime() + intervalSeconds * 1000),
      prompt,
      title: titleFromPrompt(prompt),
    };
  }

  const at = trimmed.match(/^at\s+(.+?)\s+(?:do\s+)([\s\S]+)$/iu);
  if (at) {
    const runAt = new Date(at[1]);
    const prompt = at[2].trim();
    if (Number.isNaN(runAt.getTime()) || !prompt) return undefined;
    return {
      scheduleKind: 'once',
      runAt,
      nextRunAt: runAt,
      prompt,
      title: titleFromPrompt(prompt),
    };
  }

  const inMatch = trimmed.match(/^in\s+(\d+\s*[a-zA-Z]+)\s+(?:do\s+)?([\s\S]+)$/iu);
  if (inMatch) {
    const seconds = parseDuration(inMatch[1]);
    const prompt = inMatch[2].trim();
    if (!seconds || !prompt) return undefined;
    const runAt = new Date(now.getTime() + seconds * 1000);
    return {
      scheduleKind: 'once',
      runAt,
      nextRunAt: runAt,
      prompt,
      title: titleFromPrompt(prompt),
    };
  }

  return undefined;
}

export function formatScheduleHelp() {
  return [
    'Usage:',
    '!schedule list',
    '!schedule all',
    '!schedule delete <id>',
    '!schedule pause <id>',
    '!schedule resume <id>',
    '!schedule every 30m do check the news and summarize top AI stories',
    '!schedule every 2h do remind me to drink water',
    '!schedule in 10m do remind me to move laundry',
    '!schedule at 2026-06-01T18:00:00-07:00 do remind me to call mom',
  ].join('\n');
}

export function formatTaskTime(iso: string, timeZone = 'UTC') {
  return new Date(iso).toLocaleString('en-US', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
