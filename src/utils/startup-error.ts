class StartupError extends Error {
  constructor(readonly step: string, cause: unknown) {
    super('Startup step failed.', { cause });
  }
}

export async function startupStep<T>(step: string, action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof StartupError) throw error;
    throw new StartupError(step, error);
  }
}

type Diagnostic = { name: string; message: string; code?: string | number; stack?: string[] };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function redactor(environment: NodeJS.ProcessEnv) {
  const secrets = new Set<string>();
  function add(value: string | undefined) {
    if (!value) return;
    secrets.add(value);
    secrets.add(encodeURIComponent(value));
    try { secrets.add(decodeURIComponent(value)); } catch { /* Invalid percent-encoding can cause startup failures. */ }
  }

  for (const [key, value] of Object.entries(environment)) {
    if (/uri|url|secret|password|passphrase|token|cookie|credential|authorization|private|(?:^|_)key(?:_|$)/i.test(key)) add(value);
  }
  // Even a malformed connection URI can contain valid, encoded credentials.
  const authority = /^mongodb(?:\+srv)?:\/\/([^/?#]*)/i.exec(environment.MONGODB_URI?.trim() ?? '')?.[1];
  if (authority?.includes('@')) {
    const userInfo = authority.slice(0, authority.lastIndexOf('@'));
    const separator = userInfo.indexOf(':');
    add(separator === -1 ? userInfo : userInfo.slice(0, separator));
    if (separator !== -1) add(userInfo.slice(separator + 1));
  }

  const values = [...secrets].sort((a, b) => b.length - a.length);
  const literals = values.length ? new RegExp(values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : undefined;
  return (text: string) => {
    const clean = text
      .replace(/\bmongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[REDACTED MONGODB URI]')
      .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, '[REDACTED URL]')
      .replace(/((?:\bauthorization|\b(?:set-)?cookie)\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
      .replace(/(\b(?:password|passphrase|secret|token|api[_ -]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]')
      .replace(/\b(dup key|full error)\s*:[\s\S]*/i, '$1: [REDACTED]')
      .replace(/(\b(?:not authorized.+?command|unauthorized.+?command))\s+\{[\s\S]*/i, '$1 [REDACTED]');
    return (literals ? clean.replace(literals, '[REDACTED]') : clean)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, 1200);
  };
}

export function startupFailure(step: string, failure: unknown, environment = process.env) {
  const redact = redactor(environment);
  const actualStep = failure instanceof StartupError ? failure.step : step;
  const original = failure instanceof StartupError ? failure.cause : failure;
  const diagnostics: Diagnostic[] = [];
  const visited = new Set<unknown>();

  function inspect(value: unknown) {
    if (value == null || visited.has(value) || diagnostics.length >= 6) return;
    visited.add(value);

    const error = asRecord(value);
    if (!error) {
      if (!diagnostics.length) diagnostics.push({ name: 'UnknownError', message: 'Startup failed with a non-error value.' });
      return;
    }
    const name = typeof error.name === 'string' && /^[A-Za-z][A-Za-z0-9]+$/.test(error.name) ? redact(error.name) : 'UnknownError';
    const code = typeof error.code === 'number' && Number.isSafeInteger(error.code) ? error.code :
      typeof error.code === 'string' && /^[A-Z][A-Za-z0-9_]{1,79}$/.test(error.code) ? redact(error.code) : undefined;
    // Keep code locations and omit raw exception headers, function arguments and host paths.
    const stack = typeof error.stack === 'string' ? error.stack.split('\n').slice(1)
      .filter((line) => /^\s+at\s/.test(line))
      .flatMap((line) => {
        const file = /(?:^|[\\/ (])([A-Za-z0-9_.-]+\.[cm]?[jt]s:\d+:\d+)\)?$/.exec(line)?.[1];
        return file ? [redact(file)] : [];
      }).slice(0, 8) : [];
    diagnostics.push({
      name,
      message: typeof error.message === 'string' ? redact(error.message) : 'Startup failed without an error message.',
      code,
      stack: stack.length ? stack : undefined,
    });

    if (error.cause instanceof Error) inspect(error.cause);
    if (Array.isArray(error.errors)) for (const nested of error.errors.slice(0, 6)) inspect(nested);
    // Driver server-selection errors keep individual DNS/TLS errors on their topology description.
    for (const topology of [error.reason, error.cause]) {
      const servers = asRecord(topology)?.servers;
      if (!(servers instanceof Map)) continue;
      for (const server of servers.values()) {
        if (diagnostics.length >= 6) break;
        inspect(asRecord(server)?.error);
      }
    }
  }

  inspect(original);
  const [error, ...causes] = diagnostics;
  return {
    step: actualStep,
    error: error ?? { name: 'UnknownError', message: 'No startup error details were available.' },
    causes,
  };
}

export function reportStartupFailure(step: string, error: unknown): void {
  process.stderr.write(JSON.stringify({
    level: 60,
    msg: 'SalonBook API failed to start.',
    ...startupFailure(step, error),
  }) + '\n');
}
