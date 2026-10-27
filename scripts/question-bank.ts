import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { materialiseQuestionBank, parseQuestionBank } from '../src/questions/bank';
import { auditQuestionClassifications } from '../src/questions/classificationAudit';

const [command, input, output] = process.argv.slice(2);
try {
  if (
    !input ||
    !['validate', 'materialise', 'audit'].includes(command) ||
    (command === 'materialise' && !output)
  ) {
    throw new Error(
      'Usage: bun scripts/question-bank.ts validate FILE | materialise FILE OUTPUT | audit FILE [OUTPUT]',
    );
  }
  const bytes = await readFile(input);
  const text = bytes.toString('utf8');
  const value = JSON.parse(text);
  if (command === 'audit') {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    let report;
    if (value?.format === 'lacuna-course') {
      const { decodeCourseFile } = await import('../src/db/courseFile');
      const { payload } = await decodeCourseFile(text);
      report = {
        artefact: {
          format: value.format,
          sha256,
          name: payload.course.n,
          lineageId: payload.li ?? null,
          revision: payload.rv ?? null,
        },
        basis: 'stored-question-sets',
        excludedLegacyQuestions: 'questions' in payload ? payload.questions.length : 0,
        ...auditQuestionClassifications(
          'questionSets' in payload ? payload.questionSets : [],
          'concepts' in payload
            ? payload.concepts.map((concept) => ({ id: concept.id, name: concept.n }))
            : [],
        ),
      };
    } else {
      const bank = parseQuestionBank(value);
      report = {
        artefact: {
          format: bank.format,
          sha256,
          bankId: bank.bankId,
          bankVersion: bank.bankVersion,
          courseCode: bank.courseCode,
        },
        basis: 'static-sets-and-family-templates',
        ...auditQuestionClassifications(
          materialiseQuestionBank(bank, bank.courseCode, true),
          bank.concepts,
        ),
      };
    }
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (output) await writeFile(output, json, { encoding: 'utf8', flag: 'wx' });
    else process.stdout.write(json);
  } else {
    const bank = parseQuestionBank(value);
    if (command === 'materialise') {
      await writeFile(
        output,
        `${JSON.stringify(materialiseQuestionBank(bank, bank.courseCode), null, 2)}\n`,
        'utf8',
      );
    }
    console.log(`Valid Question bank: ${bank.bankId} v${bank.bankVersion}.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
