import { fetchWithTimeout, TimeoutError } from '../network';

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve normally when fetch completes before timeout', async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const res = await fetchWithTimeout('https://api.example.com/data', { timeoutMs: 1000 });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('should throw TimeoutError when request exceeds timeoutMs', async () => {
    global.fetch = jest.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    await expect(
      fetchWithTimeout('https://api.example.com/slow', { timeoutMs: 50 })
    ).rejects.toThrow(TimeoutError);
  });

  it('should abort if an external AbortSignal aborts', async () => {
    const externalController = new AbortController();
    global.fetch = jest.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const promise = fetchWithTimeout('https://api.example.com/cancel', {
      timeoutMs: 5000,
      signal: externalController.signal,
    });

    setTimeout(() => {
      externalController.abort();
    }, 20);

    await expect(promise).rejects.toThrow();
  });
});
