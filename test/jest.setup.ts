jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: Record<string, unknown>) => {
    const result = new Headers();

    for (const [key, value] of Object.entries(headers || {})) {
      if (Array.isArray(value)) {
        result.set(key, value.join(', '));
      } else if (value != null) {
        result.set(key, String(value));
      }
    }

    return result;
  },
  toNodeHandler:
    () =>
    (_req: unknown, _res: unknown, next?: () => void) => {
      next?.();
    },
}));

jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    async <T>(task: () => T | Promise<T>): Promise<T> =>
      task(),
}));

jest.mock('../src/auth-better/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn().mockResolvedValue(null),
    },
  },
}));
