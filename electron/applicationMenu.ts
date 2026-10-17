import type { MenuItemConstructorOptions } from 'electron';

function createViewSubmenu(development: boolean): MenuItemConstructorOptions[] {
  const developerCommands: MenuItemConstructorOptions[] = development
    ? [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
      ]
    : [];

  return [
    ...developerCommands,
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
}

/** Existing Lacuna actions the native menu may open; the renderer owns what each does. */
export type MenuCommand = 'help' | 'settings' | 'shortcuts';

/** Build the platform-native command surface without exposing development tools in releases. */
export function createApplicationMenuTemplate(
  platform: NodeJS.Platform,
  development: boolean,
  run: (command: MenuCommand) => void = () => undefined,
): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin';
  const settings: MenuItemConstructorOptions = {
    label: mac ? 'Settings…' : '&Settings',
    accelerator: 'CmdOrCtrl+,',
    click: () => run('settings'),
  };
  return [
    ...(mac
      ? [
          {
            role: 'appMenu' as const,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              settings,
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
          { role: 'fileMenu' as const },
        ]
      : [
          {
            role: 'fileMenu' as const,
            submenu: [settings, { type: 'separator' as const }, { role: 'quit' as const }],
          },
        ]),
    { role: 'editMenu' },
    { label: mac ? 'View' : '&View', submenu: createViewSubmenu(development) },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Lacuna Help',
          accelerator: mac ? 'Cmd+Shift+/' : 'F1',
          click: () => run('help'),
        },
        // No accelerator: "?" already opens the panel inside Lacuna and must stay typeable.
        {
          label: mac ? 'Keyboard Shortcuts' : '&Keyboard shortcuts',
          click: () => run('shortcuts'),
        },
      ],
    },
  ];
}
