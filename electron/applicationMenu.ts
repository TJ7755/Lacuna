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

/** Build the platform-native command surface without exposing development tools in releases. */
export function createApplicationMenuTemplate(
  platform: NodeJS.Platform,
  development: boolean,
  openHelp: () => void = () => undefined,
): MenuItemConstructorOptions[] {
  return [
    ...(platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { label: platform === 'darwin' ? 'View' : '&View', submenu: createViewSubmenu(development) },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Lacuna Help',
          accelerator: platform === 'darwin' ? 'Cmd+Shift+/' : 'F1',
          click: openHelp,
        },
      ],
    },
  ];
}
