/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tests for config.json validation
 */

describe('Config File', () => {
  let config: any;

  beforeAll(() => {
    const configPath = join(process.cwd(), 'config.json');
    const configContent = readFileSync(configPath, 'utf-8');
    config = JSON.parse(configContent);
  });

  test('config.json is valid JSON', () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  test('has required top-level properties', () => {
    expect(config).toHaveProperty('templates');
    expect(config).toHaveProperty('api');
    expect(typeof config.templates).toBe('object');
    expect(typeof config.api).toBe('object');
  });

  test('has valid API configuration', () => {
    expect(config.api).toHaveProperty('key');
    expect(typeof config.api.key).toBe('string');
    expect(config.api.key.length).toBeGreaterThan(0);
  });

  test('has valid templates structure', () => {
    const templates = config.templates;
    expect(Object.keys(templates).length).toBeGreaterThan(0);

    // Check each template has required properties
    Object.values(templates).forEach((template: any) => {
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('generation');
      expect(typeof template.name).toBe('string');
      expect(typeof template.generation).toBe('string');
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.generation.length).toBeGreaterThan(0);
    });
  });

  test('has expected template names', () => {
    const templates = config.templates;
    const templateNames = Object.values(templates).map((t: any) => t.name);

    // We expect these specific templates based on current config
    expect(templateNames).toContain('Fox');
    expect(templateNames).toContain('Vox');
    expect(templateNames).toContain('Humor');
    expect(templateNames).toContain('Conspiracy');
    expect(templateNames).toContain('Malicious');
  });

  test('templates have reasonable generation instructions', () => {
    const templates = config.templates;

    Object.values(templates).forEach((template: any) => {
      // Each template should have substantial generation instructions
      expect(template.generation.length).toBeGreaterThan(100);

      // Should contain some key instruction words
      expect(template.generation.toLowerCase()).toMatch(/edit|task|text|input|output/);
    });
  });

  test('API key is properly base64 encoded', () => {
    const apiKey = config.api.key;

    // Should be a valid base64 string
    expect(() => {
      atob(apiKey);
    }).not.toThrow();

    // Decoded should look like an OpenAI API key format
    const decoded = atob(apiKey);
    expect(decoded).toMatch(/^sk-/);
  });
});
