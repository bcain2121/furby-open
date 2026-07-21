import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config/env.js';
import { mediaJobQueue } from '../media/job-queue.js';

const execFileAsync = promisify(execFile);

export interface TranscriptionResult {
  text: string;
  provider: string;
  model: string;
}

function fileNameForUpload(filePath: string, mimeType: string) {
  const existing = path.basename(filePath);
  if (path.extname(existing)) return existing;
  if (mimeType === 'audio/ogg') return `${existing}.ogg`;
  if (mimeType === 'audio/mpeg') return `${existing}.mp3`;
  if (mimeType === 'audio/wav') return `${existing}.wav`;
  if (mimeType === 'audio/webm') return `${existing}.webm`;
  return existing;
}

function assertLocalWhisperReady() {
  if (!fs.existsSync(config.whisperCppBin)) {
    throw new Error(`Local whisper.cpp binary not found at ${config.whisperCppBin}.`);
  }
  if (!fs.existsSync(config.whisperCppModel)) {
    throw new Error(`Local whisper.cpp model not found at ${config.whisperCppModel}.`);
  }
}

async function transcodeToWav(inputPath: string) {
  const outputPath = path.join(os.tmpdir(), `furby-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath], {
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 4,
  });
  return outputPath;
}

function parseWhisperOutput(output: string) {
  return output
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\s*\[[^\]]+\]\s*/u, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

async function transcribeLocalWhisperCpp(filePath: string): Promise<TranscriptionResult> {
  assertLocalWhisperReady();
  const wavPath = await transcodeToWav(filePath);
  try {
    const { stdout, stderr } = await execFileAsync(config.whisperCppBin, [
      '-m', config.whisperCppModel,
      '-f', wavPath,
      '-nt',
      '-np',
    ], {
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 16,
    });
    const text = parseWhisperOutput(stdout) || parseWhisperOutput(stderr);
    if (!text) throw new Error('Local whisper.cpp returned empty transcript.');
    return { text, provider: 'local-whisper.cpp', model: path.basename(config.whisperCppModel) };
  } finally {
    fs.rmSync(wavPath, { force: true });
  }
}

async function transcribeOpenAI(filePath: string, mimeType: string): Promise<TranscriptionResult> {
  if (!config.openaiApiKey || config.openaiApiKey.includes('OPTIONAL') || config.openaiApiKey.includes('YOUR_')) {
    throw new Error('OPENAI_API_KEY is not configured with a real key.');
  }

  const model = 'gpt-4o-mini-transcribe';
  const buffer = await fs.promises.readFile(filePath);
  const form = new FormData();
  form.set('model', model);
  form.set('file', new File([buffer], fileNameForUpload(filePath, mimeType), { type: mimeType || 'audio/ogg' }));

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    body: form,
  });

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(`OpenAI transcription failed: ${detail}`);
  }

  const text = String(payload?.text ?? '').trim();
  if (!text) throw new Error('OpenAI transcription returned empty text.');
  return { text, provider: 'openai', model };
}

export async function transcribeAudio(filePath: string, mimeType: string): Promise<TranscriptionResult> {
  return mediaJobQueue.run(async () => {
    if (config.transcriptionProvider === 'openai') {
      return transcribeOpenAI(filePath, mimeType);
    }
    return transcribeLocalWhisperCpp(filePath);
  });
}
