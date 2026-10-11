/**
 * Выполняется до загрузки тестовых модулей (см. jest-e2e.json).
 */
process.env.JWT_SECRET ??= 'e2e-jwt-secret-for-tests-only-min-32-chars!!';
process.env.QUIZ_INTERNAL_API_KEY ??= 'e2e-internal-key';
process.env.QUIZ_SESSION_API_KEY ??= 'e2e-session-key';
process.env.CORS_ORIGINS ??= 'http://127.0.0.1:3000,http://localhost:3000,http://localhost:5173';
process.env.DATABASE_PATH = ':memory:';
process.env.THROTTLE_JOIN_LIMIT = '1000';
