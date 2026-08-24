import { describe, expect, it } from 'vitest';
import {
  canGrantRendererPermission,
  decideWindowOpen,
  isAllowedRendererNavigation,
  isSafeExternalUrl,
} from '../electron/securityPolicy.js';

describe('Electron renderer security policy', () => {
  describe('permissions', () => {
    it.each([
      ['production', 'app://./index.html', ['audio']],
      ['production', 'app://./share', ['video']],
      ['development', 'http://localhost:5173/cards', ['audio']],
      ['development', 'http://localhost:5173/share', ['video']],
    ] as const)(
      'allows Lacuna %s media requests for %s',
      (environment, requestingUrl, mediaTypes) => {
        expect(
          canGrantRendererPermission(
            { permission: 'media', requestingUrl, isMainFrame: true, mediaTypes },
            environment,
          ),
        ).toBe(true);
      },
    );

    it.each([
      ['production', 'app://./index.html', 'audio'],
      ['production', 'app://./index.html', 'video'],
      ['development', 'http://localhost:5173/', 'audio'],
      ['development', 'http://localhost:5173/', 'video'],
    ] as const)('allows Lacuna %s media checks for %s', (environment, requestingUrl, mediaType) => {
      expect(
        canGrantRendererPermission(
          { permission: 'media', requestingUrl, isMainFrame: true, mediaType },
          environment,
        ),
      ).toBe(true);
    });

    it('allows sanitised clipboard writes from the trusted renderer', () => {
      expect(
        canGrantRendererPermission(
          {
            permission: 'clipboard-sanitized-write',
            requestingUrl: 'app://./index.html',
            isMainFrame: true,
          },
          'production',
        ),
      ).toBe(true);
    });

    it.each([
      { permission: 'geolocation', requestingUrl: 'app://./index.html', isMainFrame: true },
      { permission: 'notifications', requestingUrl: 'app://./index.html', isMainFrame: true },
      {
        permission: 'media',
        requestingUrl: 'https://attacker.example',
        isMainFrame: true,
        mediaTypes: ['audio'],
      },
      {
        permission: 'media',
        requestingUrl: 'app://attacker/index.html',
        isMainFrame: true,
        mediaTypes: ['video'],
      },
      {
        permission: 'media',
        requestingUrl: 'app://./index.html',
        isMainFrame: false,
        mediaTypes: ['audio'],
      },
      {
        permission: 'media',
        requestingUrl: 'app://./index.html',
        isMainFrame: true,
        mediaTypes: ['unknown'],
      },
      { permission: 'media', requestingUrl: 'app://./index.html', isMainFrame: true },
    ])('denies untrusted or unnecessary permission context %#', (context) => {
      expect(canGrantRendererPermission(context, 'production')).toBe(false);
    });
  });

  describe('navigation', () => {
    it.each(['app://./index.html', 'app://./courses/123'])(
      'allows the production app origin: %s',
      (url) => {
        expect(isAllowedRendererNavigation(url, 'production')).toBe(true);
      },
    );

    it.each([
      'app://attacker/index.html',
      'app:///index.html',
      'https://example.com',
      'file:///tmp/index.html',
      'not a URL',
    ])('denies non-app production navigation: %s', (url) => {
      expect(isAllowedRendererNavigation(url, 'production')).toBe(false);
    });

    it.each(['http://localhost:5173/', 'http://localhost:5173/courses/123?tab=learn'])(
      'allows the exact Vite development origin: %s',
      (url) => {
        expect(isAllowedRendererNavigation(url, 'development')).toBe(true);
      },
    );

    it.each([
      'http://127.0.0.1:5173/',
      'http://localhost:5174/',
      'https://localhost:5173/',
      'http://localhost.evil:5173/',
      'app://./index.html',
    ])('denies other development origins: %s', (url) => {
      expect(isAllowedRendererNavigation(url, 'development')).toBe(false);
    });
  });

  describe('external opening', () => {
    it.each(['http://example.com/path', 'https://example.com/path'])(
      'allows web URLs: %s',
      (url) => {
        expect(isSafeExternalUrl(url)).toBe(true);
      },
    );

    it.each([
      'file:///tmp/secret',
      'javascript:alert(1)',
      'data:text/html,hello',
      'mailto:test@example.com',
      'not a URL',
    ])('denies non-web external URLs: %s', (url) => {
      expect(isSafeExternalUrl(url)).toBe(false);
    });

    it('denies every new window while marking only web URLs for external opening', () => {
      expect(decideWindowOpen('https://example.com')).toEqual({
        action: 'deny',
        openExternally: true,
      });
      expect(decideWindowOpen('file:///tmp/secret')).toEqual({
        action: 'deny',
        openExternally: false,
      });
    });
  });
});
