import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/config.js';

const validEnv = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_USER: 'root',
  DB_PASSWORD: 'pw',
  DB_NAME: 'notifications',
  ADMIN_API_KEY: 'key',
};

describe('loadConfig', () => {
  it('parses and coerces a valid environment, applying defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe(3000);
    expect(config.env).toBe('development');
    expect(config.db).toEqual({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'pw',
      database: 'notifications',
    });
  });

  it('throws listing every missing variable', () => {
    expect(() => loadConfig({})).toThrow(/DB_HOST.*DB_USER.*DB_NAME.*ADMIN_API_KEY/);
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });
});
