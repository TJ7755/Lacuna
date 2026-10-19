import { readFile, writeFile } from 'node:fs/promises';
import { materialiseQuestionBank, parseQuestionBank } from '../src/questions/bank';

const [command, input, output] = process.argv.slice(2);
try {
  if (
    !input ||
    !['validate', 'materialise'].includes(command) ||
    (command === 'materialise' && !output)
  ) {
    throw new Error('Usage: bun scripts/question-bank.ts validate FILE | materialise FILE OUTPUT');
  }
  const bank = parseQuestionBank(JSON.parse(await readFile(input, 'utf8')));
  if (command === 'materialise') {
    await writeFile(
      output,
      `${JSON.stringify(materialiseQuestionBank(bank, bank.courseCode), null, 2)}\n`,
      'utf8',
    );
  }
  console.log(`Valid Question bank: ${bank.bankId} v${bank.bankVersion}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
