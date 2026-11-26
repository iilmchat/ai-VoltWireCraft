import { defineConfig } from 'vitest/config';

/**
 * SEC-01/SEC-02: тесты меняют `process.env` и системное время.
 * Параллельный запуск файлов делает результат недетерминированным
 * (bootstrap-тест AppModule падал по таймауту при соседних fake timers).
 * Последовательный запуск файлов сохраняет все проверки без ослаблений.
 */
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // F-03: высокие лимиты только в тестовом раннере; реальные значения
    // проверяются отдельными/targeted тестами лимитера с явной конфигурацией.
    env: {
      AUTH_RATE_LIMIT_LOGIN_MAX: '100000',
      AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS: '900',
      AUTH_RATE_LIMIT_REFRESH_MAX: '100000',
      AUTH_RATE_LIMIT_REFRESH_WINDOW_SECONDS: '300',
      AUTH_RATE_LIMIT_LOGOUT_MAX: '100000',
      AUTH_RATE_LIMIT_LOGOUT_WINDOW_SECONDS: '300',
    },
  },
});
