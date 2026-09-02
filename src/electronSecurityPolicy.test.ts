import { describe, expect, it } from 'vitest';
import {
  addElectronSecurityHeaders,
  canGrantRendererPermission,
  decideWindowOpen,
  isAllowedRendererNavigation,
  isSafeExternalUrl,
} from '../electron/securityPolicy.js';

describe('Electron renderer security policy', () => {
  describe('response headers', () => {
    it('sets the exact production renderer CSP and isolation headers', () => {
      expect(
        addElectronSecurityHeaders('app://./index.html', { Server: ['fixture'] }, 'production'),
      ).toEqual({
        Server: ['fixture'],
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
        'Access-Control-Allow-Origin': ['*'],
        'Content-Security-Policy': [
          "default-src 'self' app: file:; script-src 'self' 'unsafe-inline' app: file:; style-src 'self' 'unsafe-inline' app: file:; font-src 'self' app: file: data:; img-src 'self' blob: data: app: file:; connect-src 'self' https://lacuna-relay.vercel.app; frame-src 'self' app: file: https://www.youtube-nocookie.com https://player.vimeo.com;",
        ],
      });
    });

    it('preserves renderer isolation in development without installing the production CSP', () => {
      expect(
        addElectronSecurityHeaders(
          'http://localhost:5173/src/main.tsx',
          { Server: ['fixture'] },
          'development',
        ),
      ).toEqual({
        Server: ['fixture'],
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
      });
    });

    it('leaves unrelated remote subframe headers unchanged', () => {
      const providerHeaders = {
        'Content-Security-Policy': ["default-src 'none';"],
        'Cross-Origin-Opener-Policy': ['unsafe-none'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      };

      expect(
        addElectronSecurityHeaders(
          'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
          providerHeaders,
          'production',
        ),
      ).toEqual(providerHeaders);
      expect(
        addElectronSecurityHeaders(
          'https://player.vimeo.com/video/123456789',
          providerHeaders,
          'production',
        ),
      ).toEqual(providerHeaders);
    });

    it('repairs CORS for the exact production sync relay and no other remote origin', () => {
      expect(
        addElectronSecurityHeaders(
          'https://lacuna-relay.vercel.app/channel',
          { 'access-control-allow-origin': ['https://stripped.example'] },
          'production',
        ),
      ).toMatchObject({
        'Access-Control-Allow-Origin': ['app://.'],
        'Access-Control-Allow-Methods': ['GET, PUT, POST, DELETE, OPTIONS'],
        'Access-Control-Allow-Headers': ['Authorization, Content-Type, If-Match'],
      });
      expect(
        addElectronSecurityHeaders(
          'https://lacuna-relay.vercel.app/channel',
          { 'access-control-allow-origin': ['https://stripped.example'] },
          'production',
        ),
      ).not.toHaveProperty('access-control-allow-origin');

      expect(
        addElectronSecurityHeaders('https://example.com/channel', {}, 'production'),
      ).not.toHaveProperty('Access-Control-Allow-Origin');
      expect(
        addElectronSecurityHeaders(
          'https://lacuna-relay.vercel.app.evil.example/channel',
          {},
          'production',
        ),
      ).not.toHaveProperty('Access-Control-Allow-Origin');
    });
  });

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
