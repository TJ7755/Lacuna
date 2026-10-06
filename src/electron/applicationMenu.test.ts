import { describe, expect, it, vi } from 'vitest';
import { createApplicationMenuTemplate } from '../../electron/applicationMenu';

function topLevelRole(template: ReturnType<typeof createApplicationMenuTemplate>, role: string) {
  return template.find((item) => item.role === role);
}

function topLevelLabel(template: ReturnType<typeof createApplicationMenuTemplate>, label: string) {
  return template.find((item) => item.label === label);
}

function submenuRoles(item: ReturnType<typeof topLevelLabel>) {
  if (!item || !Array.isArray(item.submenu)) throw new Error('Expected a submenu');
  return item.submenu.map((entry) => entry.role);
}

describe('native application menu', () => {
  it('uses macOS application, file, edit, view and window conventions', () => {
    const template = createApplicationMenuTemplate('darwin', false);

    expect(template.map((item) => item.role ?? item.label)).toEqual([
      'appMenu',
      'fileMenu',
      'editMenu',
      'View',
      'windowMenu',
      'help',
    ]);
    expect(topLevelRole(template, 'appMenu')).toBeDefined();
  });

  it('omits the macOS-only application menu on Windows and Linux', () => {
    for (const platform of ['win32', 'linux'] satisfies NodeJS.Platform[]) {
      const template = createApplicationMenuTemplate(platform, false);
      expect(topLevelRole(template, 'appMenu')).toBeUndefined();
      expect(template.map((item) => item.role ?? item.label)).toEqual([
        'fileMenu',
        'editMenu',
        '&View',
        'windowMenu',
        'help',
      ]);
    }
  });

  it('keeps production zoom and full-screen commands without exposing developer commands', () => {
    const viewMenu = topLevelLabel(createApplicationMenuTemplate('darwin', false), 'View');
    const roles = submenuRoles(viewMenu);

    expect(roles).toEqual(['resetZoom', 'zoomIn', 'zoomOut', undefined, 'togglefullscreen']);
    expect(roles).not.toContain('reload');
    expect(roles).not.toContain('toggleDevTools');
  });

  it('adds reload and developer tools only for development builds', () => {
    const viewMenu = topLevelLabel(createApplicationMenuTemplate('linux', true), '&View');
    const roles = submenuRoles(viewMenu);

    expect(roles).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
      undefined,
      'resetZoom',
      'zoomIn',
      'zoomOut',
      undefined,
      'togglefullscreen',
    ]);
  });

  it('routes Help and Keyboard Shortcuts into Lacuna', () => {
    const run = vi.fn();
    const template = createApplicationMenuTemplate('darwin', false, run);
    const help = topLevelRole(template, 'help');
    if (!help || !Array.isArray(help.submenu)) throw new Error('Expected a Help submenu');

    expect(help.submenu.map((item) => item.label)).toEqual(['Lacuna Help', 'Keyboard Shortcuts']);
    expect(help.submenu[0]).toMatchObject({ accelerator: 'Cmd+Shift+/' });
    expect(help.submenu[1].accelerator).toBeUndefined();
    help.submenu[0].click?.({} as never, undefined, {} as never);
    help.submenu[1].click?.({} as never, undefined, {} as never);

    expect(run.mock.calls).toEqual([['help'], ['shortcuts']]);
  });

  it('puts Settings where each platform expects it, on Cmd or Ctrl and comma', () => {
    const run = vi.fn();
    const mac = topLevelRole(createApplicationMenuTemplate('darwin', false, run), 'appMenu');
    if (!mac || !Array.isArray(mac.submenu)) throw new Error('Expected an application submenu');
    const macSettings = mac.submenu.find((item) => item.label === 'Settings…');
    expect(macSettings).toMatchObject({ accelerator: 'CmdOrCtrl+,' });
    expect(mac.submenu.at(-1)?.role).toBe('quit');

    const file = topLevelRole(createApplicationMenuTemplate('win32', false, run), 'fileMenu');
    if (!file || !Array.isArray(file.submenu)) throw new Error('Expected a File submenu');
    expect(file.submenu.map((item) => item.role ?? item.label)).toEqual([
      '&Settings',
      undefined,
      'quit',
    ]);
    file.submenu[0].click?.({} as never, undefined, {} as never);
    expect(run).toHaveBeenCalledWith('settings');
  });
});
