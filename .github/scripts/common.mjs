export async function hidePriorCommentsWithPrefix({
  github, // injected by GitHub
  context, // injected by GitHub
  exec, // injected by GitHub
  prefix = '',
  resolved = true,
  user = 'github-actions[bot]',
}) {
  const comments = await withRetry(() =>
    github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
    })
  );
  await exec.exec('sleep 0.5s');
  for (const comment of comments.data) {
    const commentData = await withRetry(() =>
      github.graphql(`
        query($nodeId: ID!) {
          node(id: $nodeId) {
            ... on IssueComment {
              isMinimized
            }
          }
        }
      `, { nodeId: comment.node_id })
    );
    await exec.exec('sleep 0.5s');
    const isHidden = commentData?.node?.isMinimized;
    if (isHidden) { continue; }
    if (
      comment.user.login === user &&
      comment.body.startsWith(prefix)
    ) {
      console.log('Comment node_id:', comment.node_id);
      const commentStatus = await withRetry(() =>
        github.graphql(`
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
        })
      );
      await exec.exec('sleep 0.5s');
      console.log(commentStatus);
    }
  }
}

export async function createComment({
  github, // injected by GitHub
  context, // injected by GitHub
  exec, // injected by GitHub
  body = '',
}) {
  await withRetry(() =>
    github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body: body,
    })
  );
}

/** @param fn {() => Promise<any>} */
async function withRetry(fn, maxRetries = 3, baseDelayMs = 1500) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry on 4xx errors (client errors), only on 5xx or network issues
      if (error.status && error.status >= 400 && error.status < 500) {
        throw error;
      }
      lastError = error;

      // Exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Did not produce results after multiple retries
  throw lastError;
}
