import { defineTool } from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function createInfoTools() {
  return [
    defineTool({
      name: 'furby_get_time',
      label: 'Get Current Time',
      description: `Get the current date/time/day for a timezone. Use whenever ${config.ownerName} asks for the current time, date, day, or timezone-sensitive now information.`,
      parameters: {
        type: 'object',
        properties: {
          timeZone: { type: 'string', default: config.assistantTimezone },
        },
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const timeZone = String(params.timeZone || config.assistantTimezone);
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('en-US', {
          timeZone,
          dateStyle: 'full',
          timeStyle: 'long',
        }).format(now);
        return textResult(`${formatted} (${timeZone})`, { iso: now.toISOString(), timeZone });
      },
    }),
    defineTool({
      name: 'furby_get_weather',
      label: 'Get Weather',
      description: `Get current weather for a location using wttr.in. Use when ${config.ownerName} asks about weather or forecast.`,
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', default: config.assistantLocation },
        },
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const location = String(params.location || config.assistantLocation).trim();
        if (!location) throw new Error('No weather location configured. Provide a location or set ASSISTANT_LOCATION.');
        const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
        const response = await fetch(url, { headers: { 'User-Agent': 'furby-open/0.1' } });
        if (!response.ok) throw new Error(`Weather lookup failed: HTTP ${response.status}`);
        const payload = await response.json() as any;
        const current = payload.current_condition?.[0];
        const area = payload.nearest_area?.[0];
        const resolved = [area?.areaName?.[0]?.value, area?.region?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(', ') || location;
        const summary = [
          `Weather for ${resolved}`,
          `${current?.weatherDesc?.[0]?.value ?? 'Unknown conditions'}, ${current?.temp_F ?? '?'}°F / ${current?.temp_C ?? '?'}°C`,
          `Feels like ${current?.FeelsLikeF ?? '?'}°F, humidity ${current?.humidity ?? '?'}%, wind ${current?.windspeedMiles ?? '?'} mph ${current?.winddir16Point ?? ''}`.trim(),
        ].join('\n');
        return textResult(summary, { location, resolved, current });
      },
    }),
  ];
}
