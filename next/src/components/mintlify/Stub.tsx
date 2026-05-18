import {Aside} from "./Aside"

export function Stub({issue}: {issue?: string | number}) {
  return (
    <Aside type="note" title="Work in progress">
      This page is a placeholder.
      {issue && (
        <>
          {" "}You can track progress on this page in{" "}
          <a href={`https://github.com/ton-org/docs/issues/${issue}`}>issue #{issue}</a>.
        </>
      )}
    </Aside>
  )
}
