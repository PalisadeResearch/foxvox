import { execSync } from 'child_process';
import { existsSync } from 'fs';

/**
 * Light tests for build verification
 * These tests should be fast and run on every commit
 */

describe('Build Tests', () => {
  const timeout = 15000; // 15 seconds max for build tests

  test(
    'TypeScript compilation succeeds',
    () => {
      expect(() => {
        execSync('npm run type-check', { stdio: 'pipe' });
      }).not.toThrow();
    },
    timeout
  );

  test(
    'ESLint passes without errors',
    () => {
      expect(() => {
        execSync('npm run lint:check', { stdio: 'pipe' });
      }).not.toThrow();
    },
    timeout
  );

  test(
    'Prettier formatting is correct',
    () => {
      expect(() => {
        execSync('npm run format:check', { stdio: 'pipe' });
      }).not.toThrow();
    },
    timeout
  );

  test(
    'Chrome build succeeds',
    () => {
      expect(() => {
        execSync('npm run build:chrome', { stdio: 'pipe' });
      }).not.toThrow();

      // Verify key files exist
      expect(existsSync('dist-chrome/manifest.json')).toBe(true);
      expect(existsSync('dist-chrome/background.bundle.js')).toBe(true);
      expect(existsSync('dist-chrome/popup.bundle.js')).toBe(true);
      expect(existsSync('dist-chrome/popup.html')).toBe(true);
      expect(existsSync('dist-chrome/config.json')).toBe(true);
    },
    timeout
  );

  test(
    'Firefox build succeeds',
    () => {
      expect(() => {
        execSync('npm run build:firefox', { stdio: 'pipe' });
      }).not.toThrow();

      // Verify key files exist
      expect(existsSync('dist-firefox/manifest.json')).toBe(true);
      expect(existsSync('dist-firefox/background.bundle.js')).toBe(true);
      expect(existsSync('dist-firefox/popup.bundle.js')).toBe(true);
      expect(existsSync('dist-firefox/popup.html')).toBe(true);
      expect(existsSync('dist-firefox/config.json')).toBe(true);
    },
    timeout
  );
});
