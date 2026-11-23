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
  },
});
