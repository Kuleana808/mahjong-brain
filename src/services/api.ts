import type { ContractEnvelope } from '../../packages/core/src/contracts/envelope';

export class ApiUnavailableError extends Error {
  constructor(message = 'The service is not configured in this build.') {
    super(message);
    this.name = 'ApiUnavailableError';
  }
}

export class ApiContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiContractError';
    this.code = code;
  }
}

const configuredBase = (): string | null => {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
};

export function apiConfigured(): boolean {
  return configuredBase() !== null;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    bearer?: string | null;
    timeoutMs?: number;
  } = {},
): Promise<ContractEnvelope<T>> {
  const base = configuredBase();
  if (!base) throw new ApiUnavailableError();

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const envelope = (await response.json()) as Partial<ContractEnvelope<T>>;
    if (
      typeof envelope.contract !== 'string' ||
      typeof envelope.version !== 'string' ||
      typeof envelope.state !== 'string' ||
      !('data' in envelope) ||
      !('error' in envelope)
    ) {
      throw new ApiContractError('invalid_envelope', 'The service returned an invalid response.');
    }
    if (envelope.error) {
      throw new ApiContractError(envelope.error.code, envelope.error.message);
    }
    return envelope as ContractEnvelope<T>;
  } catch (cause) {
    if (cause instanceof ApiContractError) throw cause;
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiUnavailableError('The service took too long to respond.');
    }
    throw new ApiUnavailableError('The service could not be reached.');
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
