/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Heavy tests for manifest validation across browsers
 */

describe('Manifest Validation', () => {
  describe('Chrome Manifest (MV3)', () => {
    let chromeManifest: any;

    beforeAll(() => {
      const manifestPath = join(process.cwd(), 'manifest.chrome.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifestContent = readFileSync(manifestPath, 'utf-8');
      chromeManifest = JSON.parse(manifestContent);
    });

    test('has correct manifest version', () => {
      expect(chromeManifest.manifest_version).toBe(3);
    });

    test('has required basic properties', () => {
      expect(chromeManifest).toHaveProperty('name');
      expect(chromeManifest).toHaveProperty('version');
      expect(chromeManifest).toHaveProperty('description');
      expect(chromeManifest.name).toBe('FoxVox');
      expect(typeof chromeManifest.version).toBe('string');
      expect(chromeManifest.description.length).toBeGreaterThan(10);
    });

    test('has correct service worker configuration', () => {
      expect(chromeManifest).toHaveProperty('background');
      expect(chromeManifest.background).toHaveProperty('service_worker');
      expect(chromeManifest.background.service_worker).toBe('background.bundle.js');
    });

    test('has correct action configuration', () => {
      expect(chromeManifest).toHaveProperty('action');
      expect(chromeManifest.action).toHaveProperty('default_popup');
      expect(chromeManifest.action.default_popup).toBe('popup.html');
      expect(chromeManifest.action).toHaveProperty('default_icon');
    });

    test('has required permissions', () => {
      expect(chromeManifest).toHaveProperty('permissions');
      const permissions = chromeManifest.permissions;

      expect(permissions).toContain('storage');
      expect(permissions).toContain('scripting');
      expect(permissions).toContain('webNavigation');
      expect(permissions).toContain('activeTab');
    });

    test('has correct host permissions', () => {
      expect(chromeManifest).toHaveProperty('host_permissions');
      expect(chromeManifest.host_permissions).toContain('<all_urls>');
    });

    test('has web accessible resources', () => {
      expect(chromeManifest).toHaveProperty('web_accessible_resources');
      const resources = chromeManifest.web_accessible_resources;
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);

      const configResource = resources.find(
        (r: any) => r.resources && r.resources.includes('config.json')
      );
      expect(configResource).toBeDefined();
    });
  });

  describe('Firefox Manifest (MV2)', () => {
    let firefoxManifest: any;

    beforeAll(() => {
      const manifestPath = join(process.cwd(), 'manifest.firefox.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifestContent = readFileSync(manifestPath, 'utf-8');
      firefoxManifest = JSON.parse(manifestContent);
    });

    test('has correct manifest version', () => {
      expect(firefoxManifest.manifest_version).toBe(2);
    });

    test('has required basic properties', () => {
      expect(firefoxManifest).toHaveProperty('name');
      expect(firefoxManifest).toHaveProperty('version');
      expect(firefoxManifest).toHaveProperty('description');
      expect(firefoxManifest.name).toBe('FoxVox');
      expect(typeof firefoxManifest.version).toBe('string');
      expect(firefoxManifest.description.length).toBeGreaterThan(10);
    });

    test('has correct background script configuration', () => {
      expect(firefoxManifest).toHaveProperty('background');
      expect(firefoxManifest.background).toHaveProperty('scripts');
      expect(Array.isArray(firefoxManifest.background.scripts)).toBe(true);
      expect(firefoxManifest.background.scripts).toContain('background.bundle.js');
      expect(firefoxManifest.background).toHaveProperty('persistent');
      expect(firefoxManifest.background.persistent).toBe(false);
    });

    test('has correct browser action configuration', () => {
      expect(firefoxManifest).toHaveProperty('browser_action');
      expect(firefoxManifest.browser_action).toHaveProperty('default_popup');
      expect(firefoxManifest.browser_action.default_popup).toBe('popup.html');
      expect(firefoxManifest.browser_action).toHaveProperty('default_icon');
    });

    test('has required permissions', () => {
      expect(firefoxManifest).toHaveProperty('permissions');
      const permissions = firefoxManifest.permissions;

      expect(permissions).toContain('storage');
      expect(permissions).toContain('tabs');
      expect(permissions).toContain('webNavigation');
      expect(permissions).toContain('activeTab');
      expect(permissions).toContain('<all_urls>');
    });

    test('has browser specific settings', () => {
      expect(firefoxManifest).toHaveProperty('browser_specific_settings');
      expect(firefoxManifest.browser_specific_settings).toHaveProperty('gecko');
      const gecko = firefoxManifest.browser_specific_settings.gecko;

      expect(gecko).toHaveProperty('id');
      expect(gecko).toHaveProperty('strict_min_version');
      expect(gecko.id).toMatch(/.*@.*\..*/); // Basic email format
    });

    test('has content security policy', () => {
      expect(firefoxManifest).toHaveProperty('content_security_policy');
      const csp = firefoxManifest.content_security_policy;
      expect(csp).toContain('script-src');
      expect(csp).toContain('object-src');
    });

    test('has web accessible resources', () => {
      expect(firefoxManifest).toHaveProperty('web_accessible_resources');
      const resources = firefoxManifest.web_accessible_resources;
      expect(Array.isArray(resources)).toBe(true);
      expect(resources).toContain('config.json');
    });
  });

  describe('Cross-browser Consistency', () => {
    let chromeManifest: any;
    let firefoxManifest: any;

    beforeAll(() => {
      chromeManifest = JSON.parse(readFileSync('manifest.chrome.json', 'utf-8'));
      firefoxManifest = JSON.parse(readFileSync('manifest.firefox.json', 'utf-8'));
    });

    test('have consistent basic metadata', () => {
      expect(chromeManifest.name).toBe(firefoxManifest.name);
      expect(chromeManifest.version).toBe(firefoxManifest.version);
      expect(chromeManifest.description).toBe(firefoxManifest.description);
    });

    test('have consistent icon configurations', () => {
      const chromeIcons = chromeManifest.action?.default_icon;
      const firefoxIcons = firefoxManifest.browser_action?.default_icon;

      expect(chromeIcons).toBeDefined();
      expect(firefoxIcons).toBeDefined();

      // Should have the same icon sizes
      expect(chromeIcons['16']).toBe(firefoxIcons['16']);
      expect(chromeIcons['48']).toBe(firefoxIcons['48']);
      expect(chromeIcons['128']).toBe(firefoxIcons['128']);
    });

    test('have consistent popup configuration', () => {
      const chromePopup = chromeManifest.action?.default_popup;
      const firefoxPopup = firefoxManifest.browser_action?.default_popup;

      expect(chromePopup).toBe(firefoxPopup);
      expect(chromePopup).toBe('popup.html');
    });

    test('have equivalent permissions for core functionality', () => {
      const chromePerms = chromeManifest.permissions || [];
      const firefoxPerms = firefoxManifest.permissions || [];
      const chromeHosts = chromeManifest.host_permissions || [];

      // Core permissions should be present in both
      expect(chromePerms).toContain('storage');
      expect(firefoxPerms).toContain('storage');

      expect(chromePerms).toContain('webNavigation');
      expect(firefoxPerms).toContain('webNavigation');

      expect(chromePerms).toContain('activeTab');
      expect(firefoxPerms).toContain('activeTab');

      // URL access
      expect(chromeHosts).toContain('<all_urls>');
      expect(firefoxPerms).toContain('<all_urls>');
    });
  });
});
