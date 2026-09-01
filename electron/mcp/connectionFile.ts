import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MCP_COMPANION_PROTOCOL_VERSION } from '../../src/mcp/companionProtocol.js';

export interface CompanionConnectionFile {
  protocolVersion: typeof MCP_COMPANION_PROTOCOL_VERSION;
  endpoint: string;
  token: string;
  aiToken: string;
  pid: number;
  appVersion: string;
  createdAt: number;
}

export function companionStateDirectory(userDataPath: string): string {
  return path.join(userDataPath, 'mcp');
}

export function companionConnectionFilePath(userDataPath: string): string {
  return path.join(companionStateDirectory(userDataPath), 'connection.json');
}

export function companionEndpoint(userDataPath: string, platform = process.platform): string {
  if (platform === 'win32') return `\\\\.\\pipe\\LOCAL\\lacuna-${randomBytes(16).toString('hex')}`;
  const digest = createHash('sha256').update(userDataPath).digest('hex').slice(0, 20);
  return path.join(os.tmpdir(), `lacuna-mcp-${process.getuid?.() ?? 'user'}-${digest}.sock`);
}

export interface CompanionLaunchEnvironment {
  appPath: string;
  execPath: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  userDataPath: string;
  portableExecutableFile?: string;
  appImageFile?: string;
}

export function companionLaunchCommand(
  environment: CompanionLaunchEnvironment,
  mode: '--mcp-companion' | '--ai-companion',
): { command: string; args: string[] } {
  const command = environment.platform === 'win32' && environment.portableExecutableFile
    ? environment.portableExecutableFile
    : environment.platform === 'linux' && environment.appImageFile
      ? path.resolve(environment.appImageFile)
      : environment.execPath;
  return {
    command,
    args: [
      ...(environment.isPackaged ? [mode] : [environment.appPath, mode]),
      '--disable-gpu',
      `--user-data-dir=${environment.userDataPath}`,
    ],
  };
}

export async function writeCompanionConnectionFile(
  userDataPath: string,
  appVersion: string,
): Promise<CompanionConnectionFile> {
  const directory = companionStateDirectory(userDataPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await fs.chmod(directory, 0o700);
  const connection: CompanionConnectionFile = {
    protocolVersion: MCP_COMPANION_PROTOCOL_VERSION,
    endpoint: companionEndpoint(userDataPath),
    token: randomBytes(32).toString('hex'),
    aiToken: randomBytes(32).toString('hex'),
    pid: process.pid,
    appVersion,
    createdAt: Date.now(),
  };
  const file = companionConnectionFilePath(userDataPath);
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(connection), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, file);
  if (process.platform !== 'win32') await fs.chmod(file, 0o600);
  return connection;
}

export async function readCompanionConnectionFile(userDataPath: string): Promise<CompanionConnectionFile> {
  const raw = await fs.readFile(companionConnectionFilePath(userDataPath), 'utf8');
  const value = JSON.parse(raw) as Partial<CompanionConnectionFile>;
  if (value.protocolVersion !== MCP_COMPANION_PROTOCOL_VERSION || typeof value.endpoint !== 'string' ||
    typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token) || typeof value.pid !== 'number' ||
    typeof value.aiToken !== 'string' || !/^[a-f0-9]{64}$/.test(value.aiToken) || value.aiToken === value.token ||
    typeof value.appVersion !== 'string' || typeof value.createdAt !== 'number') {
    throw new Error('Lacuna MCP connection metadata is invalid or incompatible.');
  }
  return value as CompanionConnectionFile;
}

export async function removeCompanionConnectionFile(userDataPath: string): Promise<void> {
  await fs.rm(companionConnectionFilePath(userDataPath), { force: true });
}
