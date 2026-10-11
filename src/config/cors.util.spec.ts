import { corsOriginFromEnv } from './cors.util';

describe('corsOriginFromEnv', () => {
  const prev = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (prev === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prev;
  });

  it('allows any origin when unset', () => {
    delete process.env.CORS_ORIGINS;
    expect(corsOriginFromEnv()).toBe(true);
  });

  it('allows any origin for *', () => {
    process.env.CORS_ORIGINS = '*';
    expect(corsOriginFromEnv()).toBe(true);
  });

  it('parses a comma list', () => {
    process.env.CORS_ORIGINS = 'http://localhost:5173, http://localhost:3000';
    expect(corsOriginFromEnv()).toEqual(['http://localhost:5173', 'http://localhost:3000']);
  });
});
