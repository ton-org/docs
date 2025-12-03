export async function hidePriorCommentsWithPrefix({
  github, // injected by GitHub
  context, // injected by GitHub
  exec, // injected by GitHub
  prefix = '',
  resolved = true,
  user = 'github-actions[bot]',
}) {
  const comments = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });
  for (const comment of comments.data) {
    const isHidden = (await github.graphql(`
      query($nodeId: ID!) {
        node(id: $nodeId) {
          ... on IssueComment {
            isMinimized
          }
        }
      }
    `, { nodeId: comment.node_id }))?.node?.isMinimized;
    await exec.exec('sleep 0.5s');
    if (isHidden) { continue; }
    if (
      comment.user.login === user &&
      comment.body.startsWith(prefix)
    ) {
      console.log('Comment node_id:', comment.node_id);
      console.log(await github.graphql(`
        mutation($subjectId: ID!, $classifier: ReportedContentClassifiers!) {
          minimizeComment(input: {
            subjectId: $subjectId,
            classifier: $classifier
          }) {
            minimizedComment {
              isMinimized
              minimizedReason
            }
          }
        }
      `, {
        subjectId: comment.node_id,
        classifier: resolved ? 'RESOLVED' : 'OUTDATED',
      }));
      await exec.exec('sleep 0.5s');
    }
  }
}

export async function createComment({
  github, // injected by GitHub
  context, // injected by GitHub
  exec, // injected by GitHub
  body = '',
}) {
  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    body: body,
  });
}
