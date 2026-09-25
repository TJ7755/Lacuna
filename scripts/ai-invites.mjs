import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

function main() {
  const { values } = parseArgs({ options: {
    count: { type: 'string', default: '20' },
    existing: { type: 'string' },
    help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: bun run ai:invites [--count 1–1000] [--existing credential-hashes.json]');
    return;
  }
  if (!/^[1-9]\d*$/.test(values.count) || Number(values.count) > 1000) {
    throw new Error('Count must be an integer between 1 and 1000.');
  }
  let hashes = Object.create(null);
  if (values.existing) {
    try {
      const existing = JSON.parse(readFileSync(values.existing, 'utf8'));
      if (!existing || typeof existing !== 'object' || Array.isArray(existing) ||
          Object.entries(existing).some(([id, hash]) =>
            !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
        throw new Error();
      }
      hashes = Object.assign(hashes, existing);
    } catch {
      throw new Error('Invalid existing credential configuration: provide a readable JSON object of learner IDs and SHA-256 hashes.');
    }
  }
  const rows = ['learner_id,access_code,issued_to,issued_on'];
  for (let index = 0; index < Number(values.count); index += 1) {
    let id;
    do { id = `beta_${randomBytes(12).toString('hex')}`; } while (Object.hasOwn(hashes, id));
    const code = randomBytes(32).toString('base64url');
    hashes[id] = createHash('sha256').update(code).digest('hex');
    rows.push(`${id},${code},,`);
  }
  const root = resolve('.ai-invites');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(root, 'batch-'));
  try {
    writeFileSync(join(directory, 'codes.csv'), `${rows.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(directory, 'credential-hashes.json'), `${JSON.stringify(hashes)}\n`, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  console.log(`Created ${values.count} codes in ${directory}`);
  console.log('Keep codes.csv private; fill in issued_to and issued_on as you distribute codes.');
  console.log('Set AI_ACCESS_CREDENTIAL_HASHES to the contents of credential-hashes.json, then redeploy.');
  console.log('If users already have codes, merge the current deployed configuration with --existing before replacing it.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not generate invitations.');
  process.exitCode = 1;
}
