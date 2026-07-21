export function envValue(content: string, key: string) {
  const line = content.split(/\r?\n/u).find((candidate) => candidate.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim() ?? '';
}

export function setEnvValues(content: string, values: Record<string, string | number>) {
  let updated = content;
  for (const [key, rawValue] of Object.entries(values)) {
    const value = String(rawValue);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || /[\r\n]/u.test(value)) throw new Error(`Invalid environment value for ${key}.`);
    const pattern = new RegExp(`^${key}=.*$`, 'mu');
    updated = pattern.test(updated)
      ? updated.replace(pattern, `${key}=${value}`)
      : `${updated.trimEnd()}\n${key}=${value}\n`;
  }
  return updated;
}
