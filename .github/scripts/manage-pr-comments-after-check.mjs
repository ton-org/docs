export default async function({ github, context, exec }) {
  const success = JSON.parse(process.env.SUCCESS ?? 'false');
  const rawCommentText = process.env.COMMENT ?? '';
  if (!success && rawCommentText === '') {
    process.exit(0);
  }
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
    const body = comment.body;
    const prefix = rawCommentText.slice(1, 30);
    if (
      comment.user.login === 'github-actions[bot]' &&
      body.startsWith(prefix)
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
        classifier: success ? 'RESOLVED' : 'OUTDATED',
      }));
      await exec.exec('sleep 0.5s');
    }
  }
  if (!success) {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body: `${rawCommentText.slice(1, -1).replace(/\\n/g, '\n')}`,
    });
  }
}
