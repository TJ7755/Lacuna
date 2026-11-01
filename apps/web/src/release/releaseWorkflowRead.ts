import { parse } from 'yaml';

export function workflowJob(workflow: string, name: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) throw new Error(`Workflow job ${name} does not exist`);

  const nextJob = lines.findIndex((line, index) => index > start && /^ {2}[a-z0-9-]+:$/.test(line));
  return lines.slice(start, nextJob === -1 ? lines.length : nextJob).join('\n');
}

export function workflowStep(job: string, name: string): string {
  const lines = job.split('\n');
  const start = lines.findIndex((line) => line === `      - name: ${name}`);
  if (start === -1) throw new Error(`Workflow step ${name} does not exist`);

  const nextStep = lines.findIndex((line, index) => index > start && line.startsWith('      - '));
  return lines.slice(start, nextStep === -1 ? lines.length : nextStep).join('\n');
}

export function namedAction(
  workflow: string,
  jobName: string,
  stepName: string,
): string | undefined {
  const parsed = parse(workflow) as {
    jobs: Record<string, { steps?: { name?: string; uses?: string }[] }>;
  };
  return parsed.jobs[jobName]?.steps?.find((step) => step.name === stepName)?.uses?.split('@')[0];
}

export function blockScalarValues(block: string, key: string): string[] {
  const lines = block.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${key}: |`);
  if (start === -1) throw new Error(`Block scalar ${key} does not exist`);

  const indentation = lines[start].length - lines[start].trimStart().length;
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const value = line.trim();
    const valueIndentation = line.length - line.trimStart().length;
    if (!value || valueIndentation <= indentation) break;
    values.push(value);
  }
  return values;
}
