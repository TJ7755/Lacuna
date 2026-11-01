import { classifyPaths, parseNameStatus } from './ci-change-scope.mjs';

export const projects = [
  { name: 'lacuna', id: 'prj_pT9dbirIR497NHQ36nymeNS13Axk' },
  { name: 'lacuna-relay', id: 'prj_9QmV1AnuyJOq1UVOyM3eMmdMDIGN' },
  { name: 'lacuna-gaps', id: 'prj_3u4p8wJ3v4qolOUtJQBe7KV5nZda' },
  { name: 'lacuna-library', id: 'prj_Pk3H8aAXy0Ehlh92JeTZ2IGVOi1K' },
];

export function affectedProjects(paths) {
  const scope = classifyPaths(paths);
  return projects.filter(({ name }) =>
    name === 'lacuna-relay'
      ? scope.relay
      : scope.app || scope.sites || scope.electron || scope.tooling,
  );
}

if (process.argv[1]?.endsWith('/vercel-deploy-scope.mjs')) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const selected = process.env.DEPLOY_PROJECT;
  const matrix = selected
    ? projects.filter(({ name }) => name === selected)
    : affectedProjects(input ? parseNameStatus(input) : []);
  if (selected && matrix.length !== 1) throw new Error('Unknown deployment project');
  console.log(`matrix=${JSON.stringify({ include: matrix })}`);
  console.log(`changed=${matrix.length > 0}`);
}
