export function workflowState(runs, path, sha, branches, events = ['push']) {
  const run = runs
    .filter(
      (item) =>
        item.path === path &&
        item.head_sha === sha &&
        events.includes(item.event) &&
        branches.includes(item.head_branch),
    )
    .sort((a, b) => b.id - a.id)[0];
  if (!run || run.status !== 'completed') return { state: 'pending', url: run?.html_url };
  return { state: run.conclusion === 'success' ? 'success' : 'failed', url: run.html_url };
}
