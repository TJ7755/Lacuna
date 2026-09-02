import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { argumentValue, resolvePackagedExecutable } from './executable';
import { runPackagedMemorySuite } from './memory-harness';

const args = process.argv.slice(2);
const executablePath = await resolvePackagedExecutable({
  appDir: argumentValue(args, '--app-dir'),
});
const outputPath = argumentValue(args, '--output');
const report = await runPackagedMemorySuite({ executablePath });
const json = `${JSON.stringify(report, null, 2)}\n`;

if (outputPath) {
  const resolvedOutput = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedOutput), { recursive: true });
  await writeFile(resolvedOutput, json, 'utf8');
  process.stderr.write(`Wrote ${resolvedOutput}\n`);
} else {
  process.stdout.write(json);
}
