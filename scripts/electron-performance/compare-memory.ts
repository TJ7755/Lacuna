import { readFile } from 'node:fs/promises';
import { argumentValue } from './executable';
import { compareMemoryReports } from './memory-comparison';
import type { PackagedMemoryReport } from './memory-types';

const args = process.argv.slice(2);
const beforePath = argumentValue(args, '--before');
const afterPath = argumentValue(args, '--after');
if (!beforePath || !afterPath) {
  throw new Error('Memory comparison requires --before <report.json> and --after <report.json>.');
}
const before = JSON.parse(await readFile(beforePath, 'utf8')) as PackagedMemoryReport;
const after = JSON.parse(await readFile(afterPath, 'utf8')) as PackagedMemoryReport;
process.stdout.write(`${JSON.stringify(compareMemoryReports(before, after), null, 2)}\n`);
