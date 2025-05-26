# Cross-Browser Support for FoxVox

FoxVox now supports both **Chromium-based browsers** (Chrome, Edge, Brave, etc.)
and **Firefox** through a unified build system.

## Architecture Overview

### Browser Compatibility Layer

- **Location**: `src/utils/browser-polyfill.ts`
- **Purpose**: Provides a unified API that abstracts differences between Chrome
  and Firefox extension APIs
- **Key Features**:
  - Automatic browser detection
  - Promise-based API for both browsers
  - Unified storage, tabs, scripting, runtime, and webNavigation APIs

### Manifest Files

- **Chrome**: `manifest.chrome.json` (Manifest V3)
- **Firefox**: `manifest.firefox.json` (Manifest V2)

### Build System

- **Webpack Configuration**: Updated to support multiple browser targets
- **Output Directories**:
  - Chrome: `dist-chrome/`
  - Firefox: `dist-firefox/`

## Build Commands

### Development

```bash
# Chrome development (default)
npm run dev
npm run dev:chrome

# Firefox development
npm run dev:firefox
```

### Production

```bash
# Build both browsers
npm run build

# Build specific browser
npm run build:chrome
npm run build:firefox
```

## Key Differences Handled

### API Differences

| Feature          | Chrome (MV3)                     | Firefox (MV2)                | Unified API                              |
| ---------------- | -------------------------------- | ---------------------------- | ---------------------------------------- |
| Background       | Service Worker                   | Background Scripts           | `unifiedBrowser.runtime`                 |
| Script Injection | `chrome.scripting.executeScript` | `browser.tabs.executeScript` | `unifiedBrowser.scripting.executeScript` |
| Storage          | Callback-based                   | Promise-based                | Promise-based                            |
| Popup Action     | `action`                         | `browser_action`             | Handled in manifest                      |

### Manifest Differences

| Feature     | Chrome                      | Firefox                   |
| ----------- | --------------------------- | ------------------------- |
| Version     | Manifest V3                 | Manifest V2               |
| Background  | `service_worker`            | `scripts` array           |
| Action      | `action`                    | `browser_action`          |
| Permissions | Separate `host_permissions` | Combined in `permissions` |
| CSP         | Default secure              | Explicit CSP required     |

## Browser Detection

The polyfill automatically detects the browser environment:

```typescript
export const isFirefox = typeof (globalThis as any).browser !== 'undefined';
export const isChrome = typeof chrome !== 'undefined' && !isFirefox;
```

## Usage in Code

Instead of using browser-specific APIs directly:

```typescript
// ❌ Browser-specific
chrome.runtime.sendMessage(message);
browser.runtime.sendMessage(message);

// ✅ Cross-browser
import { unifiedBrowser } from './src/utils/browser-polyfill';
unifiedBrowser.runtime.sendMessage(message);
```

## Distribution

### Chrome Web Store

1. Build: `npm run build:chrome`
2. Package: `dist-chrome/` directory
3. Upload to Chrome Web Store

### Firefox Add-ons (AMO)

1. Build: `npm run build:firefox`
2. Package: `dist-firefox/` directory
3. Upload to Firefox Add-ons

### Manual Installation

#### Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist-chrome/` directory

#### Firefox

1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `manifest.json` from `dist-firefox/`

## Development Workflow

1. **Start Development**: `npm run dev:chrome` or `npm run dev:firefox`
2. **Make Changes**: Edit TypeScript files
3. **Auto-rebuild**: Webpack watches for changes
4. **Test**: Load extension in respective browser
5. **Build for Production**: `npm run build`

## Testing Strategy

### Chrome Testing

- Load `dist-chrome/` as unpacked extension
- Test all features including:
  - Content script injection
  - Background service worker
  - Storage operations
  - Cross-origin requests

### Firefox Testing

- Load `dist-firefox/` as temporary add-on
- Test all features including:
  - Content script injection
  - Background scripts
  - Storage operations
  - Cross-origin requests

## Troubleshooting

### Common Issues

1. **API Not Available**

   - Check browser detection in `browser-polyfill.ts`
   - Verify permissions in respective manifest

2. **Content Security Policy**

   - Firefox requires explicit CSP in manifest
   - Chrome has stricter default CSP

3. **Background Script Differences**
   - Chrome: Service Worker (no DOM access)
   - Firefox: Background script (limited DOM access)

### Debug Tips

1. **Check Console**: Browser extension console for errors
2. **Inspect Background**: Use browser dev tools for background scripts
3. **Manifest Validation**: Use browser extension validation tools

## Future Enhancements

- [ ] Safari support (requires additional manifest format)
- [ ] Automated testing across browsers
- [ ] CI/CD pipeline for multi-browser builds
- [ ] Browser-specific feature detection
- [ ] Performance optimization per browser
