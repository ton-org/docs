const React =
    typeof globalThis !== "undefined" && globalThis.React
      ? globalThis.React
      : (() => {
          throw new Error(
            "React global missing. TvmInstructionTable must run inside a React-powered environment."
          );
        })();

export const TvmInstructionTable = () => {
  const { useCallback, useEffect, useMemo, useState } = React;

  const SPEC_REPO = "https://github.com/hacker-volodya/tvm-spec-docs-builder";
  const SPEC_COMMIT = "refs/heads/master";
  const SPEC_URL = `${SPEC_REPO.replace(
    "github.com",
    "raw.githubusercontent.com"
  )}/${SPEC_COMMIT}/cp0.json`;

  const CATEGORY_MAP = {
    stack_basic: "Stack basics",
    stack_complex: "Stack (complex)",
    arithm_basic: "Arithmetic (basic)",
    arithm_div: "Arithmetic (division)",
    arithm_logical: "Arithmetic (logical)",
    arithm_quiet: "Arithmetic (quiet)",
    cell_build: "Cell builders",
    cell_parse: "Cell parsers",
    codepage: "Codepage management",
    compare_int: "Comparisons (integers)",
    compare_other: "Comparisons (other)",
    const_data: "Constants (data)",
    const_int: "Constants (integers)",
    cont_basic: "Continuations (basic)",
    cont_conditional: "Continuations (conditional)",
    cont_create: "Continuations (creation)",
    cont_dict: "Continuations (dictionary)",
    cont_loops: "Continuations (loops)",
    cont_registers: "Continuations (registers)",
    cont_stack: "Continuations (stack)",
    dict_delete: "Dictionaries (delete)",
    dict_get: "Dictionaries (lookup)",
    dict_mayberef: "Dictionaries (maybe ref)",
    dict_min: "Dictionaries (min/max)",
    dict_next: "Dictionaries (iteration)",
    dict_prefix: "Dictionaries (prefix)",
    dict_serial: "Dictionaries (serialization)",
    dict_set: "Dictionaries (store)",
    dict_set_builder: "Dictionaries (builder)",
    dict_special: "Dictionaries (special)",
    dict_sub: "Dictionaries (sub-dictionaries)",
    app_actions: "Actions",
    app_addr: "Addresses",
    app_config: "Blockchain configuration",
    app_crypto: "Cryptography",
    app_currency: "Currency",
    app_gas: "Gas & fees",
    app_global: "Global variables",
    app_misc: "Misc",
    app_rnd: "Randomness",
    app_gaslimits: "Gas limits",
    app_storage: "Contract storage",
    exceptions: "Exceptions & control",
    debug: "Debugging",
    tuple: "Tuples",
  };

  function humanizeCategoryKey(key) {
    if (!key) return "Uncategorized";
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
    return key
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function formatGasDisplay(gas) {
    if (Array.isArray(gas)) {
      return gas.length > 0 ? gas.join(" / ") : "N/A";
    }
    if (typeof gas === "number") {
      return gas.toLocaleString();
    }
    if (typeof gas === "string") {
      const value = gas.trim();
      if (!value) return "N/A";
      return value.replace(/\//g, " / ").replace(/\s+/g, " ");
    }
    return "N/A";
  }

  function formatOperandSummary(operand) {
    if (!operand) return "";
    const name =
      typeof operand.name === "string" && operand.name ? operand.name : "?";
    const type = typeof operand.type === "string" ? operand.type : "";
    const size =
      typeof operand.size === "number"
        ? operand.size
        : typeof operand.bits === "number"
        ? operand.bits
        : undefined;
    const hasRange =
      operand.min_value !== undefined &&
      operand.min_value !== null &&
      operand.max_value !== undefined &&
      operand.max_value !== null;
    const range = hasRange
      ? ` [${operand.min_value}; ${operand.max_value}]`
      : "";
    const sizePart = size !== undefined ? `(${size})` : "";
    return `${name}${type ? `:${type}` : ""}${sizePart}${range}`;
  }

  function compareOpcodes(a, b) {
    const sanitize = (value) => (value || "").replace(/[^0-9a-f]/gi, "");
    const ax = Number.parseInt(sanitize(a), 16);
    const bx = Number.parseInt(sanitize(b), 16);
    if (!Number.isNaN(ax) && !Number.isNaN(bx) && ax !== bx) {
      return ax - bx;
    }
    return (a || "").localeCompare(b || "");
  }

  // Search helpers for relevance-based filtering and sorting
  function createSearchTokens(query) {
    if (typeof query !== "string") return [];
    return query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2); // drop 1-char tokens as too noisy
  }

  function getItemSearchFields(item) {
    const aliasMnemonics = Array.isArray(item.aliases)
      ? item.aliases
          .map((alias) => (typeof alias.mnemonic === "string" ? alias.mnemonic : ""))
          .filter(Boolean)
      : [];
    return {
      mnemonic: String(item.mnemonic || "").toLowerCase(),
      opcode: String(item.opcode || "").toLowerCase(),
      fift: String(item.fift || "").toLowerCase(),
      aliases: aliasMnemonics.map((s) => s.toLowerCase()),
    };
  }

  function computeFieldMatchScore(field, token) {
    if (!token) return null;
    if (!field) return null;
    if (field === token) return 0; // exact
    if (field.startsWith(token)) return 3; // prefix
    if (field.includes(token)) return 7; // substring
    return null; // no match
  }

  function computeBestAliasMatchScore(aliases, token) {
    if (!Array.isArray(aliases) || aliases.length === 0) return null;
    let best = null;
    for (const a of aliases) {
      const s = computeFieldMatchScore(a, token);
      if (s === 0) return 1; // alias exact slightly worse than mnemonic exact
      if (s !== null) best = best === null ? s + 1 : Math.min(best, s + 1);
    }
    return best;
  }

  function itemRelevanceScore(item, tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) return 1000; // neutral when no query
    const { mnemonic, opcode, fift, aliases } = getItemSearchFields(item);
    let total = 0;
    for (const token of tokens) {
      // try fields in priority order
      const scores = [
        computeFieldMatchScore(mnemonic, token),
        computeBestAliasMatchScore(aliases, token),
        computeFieldMatchScore(opcode, token) !== null
          ? computeFieldMatchScore(opcode, token) + 2 // de-prioritize opcode a bit
          : null,
        computeFieldMatchScore(fift, token) !== null
          ? computeFieldMatchScore(fift, token) + 5 // fift is weakest signal
          : null,
      ].filter((s) => s !== null);
      if (scores.length === 0) return Infinity; // token didn't match any field
      total += Math.min(...scores);
    }
    return total;
  }

  // Build anchor ids compatible with static MDX (slug of "<opcode> <mnemonic>"")
  function buildAnchorId(instruction) {
    const opcodeText = String(instruction.opcode || "").trim().toLowerCase();
    const titleText = `${instruction.mnemonic}`.trim().toLowerCase();
    const raw = `${opcodeText} ${titleText}`.trim();
    const slug = raw
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return encodeURIComponent(slug);
  }

  function copyAnchorUrl(anchorId) {
    try {
      const { location, navigator } = window;
      const base = location ? `${location.origin}${location.pathname}` : "";
      const url = `${base}#${anchorId}`;
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(url);
      }
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function formatRegister(register) {
    if (!register) return "?";
    if (register.type === "constant") {
      return `c${register.index}`;
    }
    if (register.type === "variable") {
      return register.var_name || "var";
    }
    if (register.type === "special") {
      return register.name || "special";
    }
    return "register";
  }

  function formatAliasOperands(operands) {
    return Object.entries(operands)
      .map(([name, value]) => `${name}=${value}`)
      .join(", ");
  }

  function extractImplementationRefs(implementation) {
    if (!Array.isArray(implementation)) return [];
    return implementation
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const file = typeof item.file === "string" ? item.file : "";
        const functionName =
          typeof item.function_name === "string" ? item.function_name : "";
        const line = typeof item.line === "number" ? item.line : undefined;
        const path = typeof item.path === "string" ? item.path : "";
        if (!file && !functionName && !path) return null;
        return { file, functionName, line, path };
      })
      .filter(Boolean);
  }

  function buildGitHubLineUrl(rawUrl, line) {
    if (typeof rawUrl !== "string" || !rawUrl) return "";
    let url = rawUrl;
    const RAW_PREFIX = "https://raw.githubusercontent.com/";
    if (rawUrl.startsWith(RAW_PREFIX)) {
      const parts = rawUrl.slice(RAW_PREFIX.length).split("/");
      if (parts.length >= 4) {
        const owner = parts[0];
        const repo = parts[1];
        const commit = parts[2];
        const filePath = parts.slice(3).join("/");
        url = `https://github.com/${owner}/${repo}/blob/${commit}/${filePath}`;
      } else {
        url = rawUrl.replace(RAW_PREFIX, "https://github.com/");
      }
    }
    if (typeof line === "number" && Number.isFinite(line) && line > 0) {
      url = url.split("#")[0] + `#L${line}`;
    }
    return url;
  }

  function renderControlFlowSummary(controlFlow, isMissing) {
    if (!controlFlow) {
      return (
        <p className="tvm-missing-placeholder">
          {isMissing
            ? "Control flow branches missing in tvm-spec."
            : "Control flow data unavailable."}
        </p>
      );
    }

    const { branches, nobranch } = controlFlow;

    if (Array.isArray(branches) && branches.length > 0) {
      return (
        <div className="tvm-control-flow">
          <p className="tvm-detail-muted">
            {branches.length} possible branch{branches.length > 1 ? "es" : ""}{" "}
            documented.
          </p>
          <pre className="tvm-detail-code">
            {JSON.stringify(branches, null, 2)}
          </pre>
        </div>
      );
    }

    if (nobranch && branches.length === 0) {
      return (
        <p className="tvm-detail-muted">
          Instruction does not alter control flow.
        </p>
      );
    }

    return (
      <p className="tvm-missing-placeholder">
        {isMissing
          ? "Control flow documentation incomplete in tvm-spec."
          : "Control flow data unavailable."}
      </p>
    );
  }

  function renderStackEntry(entry, key, mode) {
    if (!entry) return null;

    if (entry.type === "conditional") {
      if (mode === "compact" || mode === "detail-inline") {
        return (
          <span
            key={key}
            className="tvm-stack-pill tvm-stack-pill--conditional"
          >
            Conditional: {entry.name || "?"}
          </span>
        );
      }

      return (
        <div key={key} className="tvm-stack-conditional">
          <span className="tvm-stack-conditional-name">
            Conditional: {entry.name || "?"}
          </span>
          {Array.isArray(entry.match) && entry.match.length > 0 ? (
            entry.match.map((matchArm, idx) => (
              <div
                key={`${key}-match-${idx}`}
                className="tvm-stack-conditional-branch"
              >
                <span className="tvm-stack-conditional-label">
                  = {String(matchArm.value)}
                </span>
                <div className="tvm-stack-conditional-values">
                  {Array.isArray(matchArm.stack) &&
                  matchArm.stack.length > 0 ? (
                    matchArm.stack
                      .slice()
                      .reverse()
                      .map((nested, nestedIdx) =>
                        renderStackEntry(
                          nested,
                          `${key}-match-${idx}-item-${nestedIdx}`,
                          "detail-inline"
                        )
                      )
                  ) : (
                    <span className="tvm-stack-pill tvm-stack-pill--empty">
                      Empty
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <span className="tvm-stack-pill tvm-stack-pill--empty">
              Empty branches
            </span>
          )}
          {Array.isArray(entry.else) && (
            <div className="tvm-stack-conditional-branch">
              <span className="tvm-stack-conditional-label">else</span>
              <div className="tvm-stack-conditional-values">
                {entry.else.length > 0 ? (
                  entry.else
                    .slice()
                    .reverse()
                    .map((nested, nestedIdx) =>
                      renderStackEntry(
                        nested,
                        `${key}-else-${nestedIdx}`,
                        "detail-inline"
                      )
                    )
                ) : (
                  <span className="tvm-stack-pill tvm-stack-pill--empty">
                    Empty
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (entry.type === "array") {
      const label = `${entry.name || "items"}[${entry.length_var ?? ""}]`;
      return (
        <span key={key} className="tvm-stack-pill tvm-stack-pill--array">
          {label}
        </span>
      );
    }

    if (entry.type === "const") {
      const value =
        entry.value === null
          ? "null"
          : entry.value === undefined
          ? "?"
          : entry.value;
      return (
        <span key={key} className="tvm-stack-pill tvm-stack-pill--const">
          {String(value)}: {entry.value_type || "Const"}
        </span>
      );
    }

    const valueTypes =
      Array.isArray(entry.value_types) && entry.value_types.length > 0
        ? entry.value_types.join("/")
        : entry.value_type || "Any";
    const label = entry.name ? `${entry.name}: ${valueTypes}` : valueTypes;

    return (
      <span key={key} className="tvm-stack-pill tvm-stack-pill--simple">
        {label}
      </span>
    );
  }

  function renderStackColumn(title, items, mode = "detail") {
    const safeItems = Array.isArray(items) ? items : [];
    const reversed = safeItems.slice().reverse();
    const limit = mode === "compact" ? 4 : reversed.length;
    const shown = reversed.slice(0, limit);
    const truncated = mode === "compact" && reversed.length > shown.length;

    return (
      <div
        className={`tvm-stack-column ${
          mode === "compact" ? "tvm-stack-column--compact" : ""
        }`}
      >
        <div className="tvm-stack-column-title">{title}</div>
        <div className="tvm-stack-top">TOP</div>
        <div className="tvm-stack-list">
          {shown.length === 0 && <span className="tvm-stack-empty">Empty</span>}
          {shown.map((entry, idx) =>
            renderStackEntry(entry, `${title}-${idx}`, mode)
          )}
          {truncated && (
            <span className="tvm-stack-pill tvm-stack-pill--more">
              +{reversed.length - shown.length} more
            </span>
          )}
        </div>
      </div>
    );
  }

  function renderStackColumns(instruction, mode = "detail") {
    const inputs = instruction?.valueFlow?.inputs ?? [];
    const outputs = instruction?.valueFlow?.outputs ?? [];

    return (
      <div
        className={`tvm-stack-columns ${
          mode === "compact" ? "tvm-stack-columns--compact" : ""
        }`}
      >
        {renderStackColumn("Inputs", inputs, mode)}
        {renderStackColumn("Outputs", outputs, mode)}
      </div>
    );
  }

  function renderInstructionDetail(instruction) {
    const hasAliases =
      Array.isArray(instruction.aliases) && instruction.aliases.length > 0;
    const readsRegisters = Array.isArray(instruction.registers?.inputs)
      ? instruction.registers.inputs
      : [];
    const writesRegisters = Array.isArray(instruction.registers?.outputs)
      ? instruction.registers.outputs
      : [];

    return (
      <div className="tvm-detail-panel">
        <div className="tvm-detail-grid">
          <section className="tvm-detail-section">
            <h4 className="tvm-detail-title">Summary</h4>
            <dl className="tvm-detail-dl">
              <div className="tvm-detail-row">
                <dt>Category</dt>
                <dd>{instruction.categoryLabel}</dd>
              </div>
              <div className="tvm-detail-row">
                <dt>Since</dt>
                <dd>v{instruction.since}</dd>
              </div>
              <div className="tvm-detail-row">
                <dt>Gas</dt>
                <dd>{instruction.gasDisplay}</dd>
              </div>
              {instruction.fift && (
                <div className="tvm-detail-row">
                  <dt>Fift</dt>
                  <dd>
                    <code>{instruction.fift}</code>
                  </dd>
                </div>
              )}
              {readsRegisters.length > 0 && (
                <div className="tvm-detail-row">
                  <dt>Reads</dt>
                  <dd>{readsRegisters.map(formatRegister).join(", ")}</dd>
                </div>
              )}
              {writesRegisters.length > 0 && (
                <div className="tvm-detail-row">
                  <dt>Writes</dt>
                  <dd>{writesRegisters.map(formatRegister).join(", ")}</dd>
                </div>
              )}
            </dl>
          </section>

          {(!instruction.missing.inputs || !instruction.missing.outputs) && (
            <section className="tvm-detail-section">
              <h4 className="tvm-detail-title">Stack signature</h4>
              {renderStackColumns(instruction, "detail")}
            </section>
          )}

          <section className="tvm-detail-section">
            <h4 className="tvm-detail-title">Bytecode</h4>
            {instruction.tlb ? (
              <code className="tvm-detail-code">{instruction.tlb}</code>
            ) : (
              <p className="tvm-missing-placeholder">
                TL-B layout missing in tvm-spec.
              </p>
            )}
          </section>

          <section className="tvm-detail-section">
            <h4 className="tvm-detail-title">Control flow</h4>
            {renderControlFlowSummary(
              instruction.controlFlow,
              instruction.missing.controlFlow
            )}
          </section>

          
          {hasAliases && (
            <section className="tvm-detail-section">
              <h4 className="tvm-detail-title">Aliases</h4>
              <ul className="tvm-alias-list">
                {instruction.aliases.map((alias) => (
                  <li key={alias.mnemonic} className="tvm-alias-item">
                    <div className="tvm-alias-headline">
                      <code>{alias.mnemonic}</code>
                      <span className="tvm-alias-meta">
                        alias of <code>{alias.alias_of}</code>
                      </span>
                    </div>
                    {alias.description && (
                      <p className="tvm-alias-description">
                        {alias.description}
                      </p>
                    )}
                    <div className="tvm-alias-meta-row">
                      {alias.doc_fift && (
                        <span className="tvm-alias-pill">
                          Fift <code>{alias.doc_fift}</code>
                        </span>
                      )}
                      {alias.doc_stack && (
                        <span className="tvm-alias-pill">
                          Stack {alias.doc_stack}
                        </span>
                      )}
                      {alias.operands &&
                        Object.keys(alias.operands).length > 0 && (
                          <span className="tvm-alias-pill">
                            Operands {formatAliasOperands(alias.operands)}
                          </span>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="tvm-detail-section">
            <h4 className="tvm-detail-title">Implementation</h4>
            {Array.isArray(instruction.implementationRefs) && instruction.implementationRefs.length > 0 ? (
              <ul className="tvm-impl-list">
                {instruction.implementationRefs.map((ref, idx) => {
                  const filename = ref.file || "source";
                  const linePart = typeof ref.line === "number" && ref.line > 0 ? `:${ref.line}` : "";
                  const func = ref.functionName || "";
                  const href = buildGitHubLineUrl(ref.path, ref.line);
                  return (
                    <li key={`${instruction.mnemonic}-impl-${idx}`} className="tvm-impl-item">
                      <a className="tvm-impl-link" href={href} target="_blank" rel="noreferrer">
                        <code className="tvm-impl-filename">{filename}{linePart}</code>
                        {func && (
                          <>
                            <span className="tvm-impl-sep">–</span>
                            <code className="tvm-impl-func">{func}</code>
                          </>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null }
          </section>
        </div>
      </div>
    );
  }

  const [spec, setSpec] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sortMode, setSortMode] = useState("opcode");
  const [expanded, setExpanded] = useState({});
  const [copied, setCopied] = useState({});
  const tableStyles = useMemo(
    () => `
.tvm-instruction-app {
  --tvm-border: var(--mint-border-color, rgb(var(--gray-400) / 0.24));
  --tvm-border-strong: rgb(var(--gray-400) / 0.32);
  --tvm-surface: var(--mint-surface-elevated, rgb(var(--background-light)));
  --tvm-surface-secondary: rgb(var(--gray-50) / 0.65);
  --tvm-text-primary: var(--mint-text-primary, rgb(var(--gray-800)));
  --tvm-text-secondary: var(--mint-text-secondary, rgb(var(--gray-600) / 0.85));
  --tvm-text-muted: var(--mint-text-tertiary, rgb(var(--gray-400) / 0.68));
  --tvm-accent: rgb(var(--primary));
  --tvm-accent-soft: rgb(var(--primary) / 0.16);
  --tvm-accent-strong: rgb(var(--primary-light));
  --tvm-accent-subtle: rgb(var(--primary-dark));
  --tvm-callout-bg: var(--callout-bg-color, rgb(var(--primary) / 0.12));
  --tvm-callout-border: var(--callout-border-color, rgb(var(--primary) / 0.2));
  --tvm-callout-text: var(--callout-text-color, rgb(var(--primary)));
  --tvm-stack-simple-bg: var(--tvm-accent-soft);
  --tvm-stack-simple-text: var(--tvm-accent-subtle);
  --tvm-stack-const-bg: rgb(var(--primary) / 0.2);
  --tvm-stack-const-text: var(--tvm-accent-subtle);
  --tvm-stack-array-bg: rgb(var(--primary-light) / 0.18);
  --tvm-stack-array-text: var(--tvm-text-primary);
  --tvm-stack-conditional-bg: rgb(var(--primary-dark) / 0.22);
  --tvm-stack-conditional-text: var(--tvm-accent-subtle);
  --tvm-stack-conditional-border: rgb(var(--primary-dark) / 0.32);
  --tvm-stack-label: var(--mint-text-tertiary, rgb(var(--gray-600) / 0.65));
  --tvm-pill-muted-bg: rgb(var(--gray-400) / 0.12);
  color: var(--tvm-text-primary);
  background: var(--tvm-surface);
  border: 1px solid var(--tvm-border);
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: 0 24px 60px -40px rgb(var(--gray-900) / 0.9);
}

.tvm-instruction-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 1.25rem;
}

.tvm-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 190px;
  flex: 1;
}

.tvm-field label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--tvm-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tvm-field input,
.tvm-field select {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--tvm-border);
  padding: 0.55rem 0.75rem;
  background: var(--tvm-surface-secondary);
  color: var(--tvm-text-primary);
  font-size: 0.95rem;
}

.tvm-instruction-meta {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--tvm-text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.tvm-missing-banner {
  margin-bottom: 1rem;
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  background: var(--tvm-callout-bg);
  border: 1px solid var(--tvm-callout-border);
  color: var(--tvm-callout-text);
  font-size: 0.85rem;
}

.tvm-spec-grid-container {
  border: 1px solid var(--tvm-border);
  border-radius: 12px;
  background: var(--tvm-surface-secondary);
  box-shadow: inset 0 1px 0 rgb(var(--gray-400) / 0.08);
}

.tvm-spec-grid-scroll {
  overflow-x: auto;
}

.tvm-spec-grid-scroll::-webkit-scrollbar {
  height: 6px;
}

.tvm-spec-grid-scroll::-webkit-scrollbar-thumb {
  background: var(--tvm-border-strong);
  border-radius: 999px;
}

.tvm-spec-header,
.tvm-spec-row {
  --tvm-grid-template: 60px 110px 260px minmax(240px, 2fr) minmax(260px, 1.5fr);
  display: grid;
  grid-template-columns: var(--tvm-grid-template);
  min-width: 860px;
}

.tvm-spec-header {
  background: rgb(var(--gray-400) / 0.12);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
  color: var(--tvm-text-secondary);
}

.tvm-spec-header > div {
  padding: 0.75rem 1rem;
  font-weight: 600;
}

.tvm-spec-row {
  border-top: 1px solid var(--tvm-border);
  transition: background 0.2s ease-in-out;
  cursor: pointer;
  align-items: center;
}

.tvm-spec-row:hover {
  background: rgb(var(--primary) / 0.08);
}

.tvm-spec-row.is-expanded {
  background: rgb(var(--primary) / 0.12);
}

.tvm-spec-row--detail {
  cursor: default;
  background: var(--tvm-surface-secondary);
  align-items: stretch;
}

.tvm-spec-cell {
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
  color: var(--tvm-text-primary);
}

.tvm-spec-cell--full {
  grid-column: 1 / -1;
}

.tvm-spec-cell--opcode {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.85rem;
  justify-content: center;
  align-items: center;
}

.tvm-spec-cell--anchor {
  justify-content: center;
  align-items: center;
}

.tvm-spec-cell--name {
  gap: 0.4rem;
}

.tvm-name-line {
  position: relative;
}

.tvm-copy-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--tvm-border);
  background: var(--tvm-surface-secondary);
  color: var(--tvm-text-secondary);
  cursor: pointer;
}

.tvm-copy-link:hover {
  border-color: var(--tvm-border-strong);
}

.tvm-copy-link svg {
  width: 14px;
  height: 14px;
}

.tvm-copy-link.is-copied {
  border-color: var(--tvm-accent-strong);
  background: var(--tvm-accent-soft);
  color: var(--tvm-accent-strong);
}

.tvm-name-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tvm-mnemonic {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 1rem;
  font-weight: 600;
  color: var(--tvm-text-primary);
  white-space: pre;
}

.tvm-spec-cell--gas {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.85rem;
  justify-content: center;
  color: var(--tvm-text-secondary);
}

.tvm-spec-cell--description p {
  margin: 0;
}

.tvm-description {
  font-size: 0.92rem;
  line-height: 1.45;
  color: var(--tvm-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tvm-description-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tvm-category-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: var(--tvm-accent-soft);
  color: var(--tvm-accent-subtle);
  font-size: 0.72rem;
  letter-spacing: 0.03em;
}

.tvm-inline-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: var(--tvm-accent-soft);
  color: var(--tvm-accent-subtle);
}

.tvm-inline-badge--muted {
  background: var(--tvm-pill-muted-bg);
  color: var(--tvm-text-secondary);
}

.tvm-fift {
  font-size: 0.78rem;
  color: var(--tvm-text-secondary);
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
}

.tvm-operands {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tvm-operand-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--tvm-border);
  background: var(--tvm-pill-muted-bg);
  font-size: 0.72rem;
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  color: var(--tvm-text-secondary);
}

.tvm-stack-columns {
  display: flex;
  gap: 0.75rem;
}

.tvm-stack-column {
  flex: 1;
  background: var(--tvm-surface-secondary);
  border: 1px dashed var(--tvm-border-strong);
  border-radius: 10px;
  padding: 0.65rem 0.7rem;
  min-width: 0;
}

.tvm-stack-column--compact {
  padding: 0.5rem 0.55rem;
}

.tvm-stack-column-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--tvm-text-secondary);
  margin-bottom: 0.35rem;
}

.tvm-stack-top {
  font-size: 0.7rem;
  color: var(--tvm-text-muted);
  margin-bottom: 0.35rem;
}

.tvm-stack-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tvm-stack-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.45rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  width: fit-content;
}

.tvm-stack-pill--simple {
  background: var(--tvm-stack-simple-bg);
  color: var(--tvm-stack-simple-text);
}

.tvm-stack-pill--const {
  background: var(--tvm-stack-const-bg);
  color: var(--tvm-stack-const-text);
}

.tvm-stack-pill--array {
  background: var(--tvm-stack-array-bg);
  color: var(--tvm-stack-array-text);
}

.tvm-stack-pill--conditional {
  background: var(--tvm-stack-conditional-bg);
  color: var(--tvm-stack-conditional-text);
}

.tvm-stack-pill--empty {
  background: var(--tvm-pill-muted-bg);
  color: var(--tvm-text-secondary);
}

.tvm-stack-pill--more {
  background: rgb(var(--gray-400) / 0.18);
  color: var(--tvm-text-secondary);
}

.tvm-stack-conditional {
  border-left: 2px solid var(--tvm-stack-conditional-border);
  padding-left: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tvm-stack-conditional-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--tvm-stack-conditional-text);
}

.tvm-stack-conditional-branch {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tvm-stack-conditional-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tvm-stack-label);
}

.tvm-stack-conditional-values {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.tvm-stack-array {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.tvm-stack-array-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding-left: 0.4rem;
}

.tvm-stack-empty {
  font-size: 0.78rem;
  color: var(--tvm-text-secondary);
}

.tvm-detail-panel {
  background: var(--tvm-surface-secondary);
  border: 1px solid var(--tvm-border);
  border-radius: 12px;
  padding: 1.1rem;
}

.tvm-detail-grid {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.tvm-detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.tvm-detail-title {
  margin: 0;
  font-size: 0.82rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--tvm-text-secondary);
}

.tvm-detail-dl {
  margin: 0;
  display: grid;
  gap: 0.35rem;
}

.tvm-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.84rem;
}

.tvm-detail-row dt {
  margin: 0;
  color: var(--tvm-text-secondary);
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tvm-detail-row dd {
  margin: 0;
  color: var(--tvm-text-primary);
  font-weight: 600;
  font-size: 0.85rem;
}

.tvm-detail-muted {
  margin: 0;
  font-size: 0.78rem;
  color: var(--tvm-text-secondary);
}

.tvm-detail-code {
  display: block;
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  background: var(--tvm-surface-secondary);
  border: 1px solid var(--tvm-border);
  border-radius: 8px;
  padding: 0.6rem 0.65rem;
  color: var(--tvm-text-primary);
}

.tvm-control-flow {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.tvm-missing-placeholder {
  margin: 0;
  font-size: 0.78rem;
  color: var(--tvm-callout-text);
  background: var(--tvm-callout-bg);
  border: 1px solid var(--tvm-callout-border);
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
}

.tvm-alias-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tvm-alias-item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: var(--tvm-surface-secondary);
  border: 1px solid var(--tvm-border);
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
}

.tvm-alias-headline {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.tvm-alias-headline code {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.85rem;
  color: var(--tvm-text-primary);
}

.tvm-alias-meta {
  font-size: 0.75rem;
  color: var(--tvm-text-secondary);
}

.tvm-alias-description {
  margin: 0;
  font-size: 0.82rem;
  color: var(--tvm-text-secondary);
}

.tvm-alias-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tvm-alias-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.18rem 0.45rem;
  border-radius: 6px;
  background: var(--tvm-pill-muted-bg);
  color: var(--tvm-text-secondary);
  font-size: 0.72rem;
}

.tvm-alias-pill code {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
}

.tvm-impl-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  text-decoration: none;
  color: var(--tvm-text-primary);
  font-size: 0.9rem;
  max-width: 100%;
  overflow: hidden;
}

.tvm-impl-link:hover {
  text-decoration: underline;
}

.tvm-impl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tvm-impl-item {
  padding: 0.1rem 0;
}

.tvm-impl-filename,
.tvm-impl-func {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  background: var(--tvm-surface-secondary);
  border: 1px solid var(--tvm-border);
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
  color: var(--tvm-text-primary);
  white-space: nowrap;
}

.tvm-impl-sep {
  color: var(--tvm-text-secondary);
}

.tvm-loading-row,
.tvm-empty-row,
.tvm-error-row {
  grid-column: 1 / -1;
  text-align: center;
  padding: 1.5rem 1rem;
  font-size: 0.92rem;
  color: var(--tvm-text-secondary);
}

.tvm-error-row {
  color: var(--tvm-accent-strong);
}

@media (max-width: 1024px) {
  .tvm-instruction-app {
    padding: 1.1rem;
  }

  .tvm-spec-header,
  .tvm-spec-row {
    --tvm-grid-template: 48px 95px 220px minmax(200px, 2fr) minmax(220px, 1.2fr);
    min-width: 720px;
  }
}

@media (max-width: 768px) {
  .tvm-instruction-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .tvm-field {
    width: 100%;
    min-width: 0;
  }

  .tvm-stack-columns {
    flex-direction: column;
  }
}
`,
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(SPEC_URL);
        if (!response.ok) {
          throw new Error(`Failed to load spec (${response.status})`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setSpec(payload);
          setLoading(false);
          return;
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setExpanded({});
  }, [spec]);

  const { instructions, missing } = useMemo(() => {
    if (!spec) {
      return {
        instructions: [],
        missing: {
          description: [],
          stackInputs: [],
          stackOutputs: [],
          stackDoc: [],
          tlb: [],
          implementation: [],
          gas: [],
          controlFlow: [],
        },
      };
    }

    const aliasByMnemonic = new Map();
    const aliases = Array.isArray(spec.aliases) ? spec.aliases : [];
    aliases.forEach((alias) => {
      if (!alias || !alias.alias_of) return;
      const list = aliasByMnemonic.get(alias.alias_of) || [];
      list.push(alias);
      aliasByMnemonic.set(alias.alias_of, list);
    });

    const missing = {
      description: [],
      stackInputs: [],
      stackOutputs: [],
      stackDoc: [],
      tlb: [],
      implementation: [],
      gas: [],
      controlFlow: [],
    };

    const instructions = (
      Array.isArray(spec.instructions) ? spec.instructions : []
    ).map((raw, idx) => {
      const doc = raw.doc || {};
      const bytecode = raw.bytecode || {};
      const valueFlow = raw.value_flow || {};
      const inputs = Array.isArray(valueFlow.inputs?.stack)
        ? valueFlow.inputs.stack
        : [];
      const outputs = Array.isArray(valueFlow.outputs?.stack)
        ? valueFlow.outputs.stack
        : [];
      const registersIn = Array.isArray(valueFlow.inputs?.registers)
        ? valueFlow.inputs.registers
        : [];
      const registersOut = Array.isArray(valueFlow.outputs?.registers)
        ? valueFlow.outputs.registers
        : [];

      const categoryKey = doc.category || "uncategorized";
      const descriptionMissing = !doc.description;
      const stackDocMissing = !doc.stack;
      const gasMissing = !doc.gas;
      const tlbMissing = !bytecode.tlb;
      const inputsMissing = !Array.isArray(valueFlow.inputs?.stack);
      const outputsMissing = !Array.isArray(valueFlow.outputs?.stack);
      const implementationRefs = extractImplementationRefs(raw.implementation);
      const implementationMissing = implementationRefs.length === 0;
      const controlFlowMissing =
        !raw.control_flow || !Array.isArray(raw.control_flow.branches);

      if (descriptionMissing) missing.description.push(raw.mnemonic);
      if (stackDocMissing) missing.stackDoc.push(raw.mnemonic);
      if (gasMissing) missing.gas.push(raw.mnemonic);
      if (tlbMissing) missing.tlb.push(raw.mnemonic);
      if (inputsMissing) missing.stackInputs.push(raw.mnemonic);
      if (outputsMissing) missing.stackOutputs.push(raw.mnemonic);
      if (implementationMissing) missing.implementation.push(raw.mnemonic);
      if (controlFlowMissing) missing.controlFlow.push(raw.mnemonic);

      const opcode = bytecode.prefix || "";

      return {
        uid: `${raw.mnemonic}__${opcode || 'nop'}__${idx}`,
        mnemonic: raw.mnemonic,
        since: typeof raw.since_version === "number" ? raw.since_version : 0,
        categoryKey,
        categoryLabel: humanizeCategoryKey(categoryKey),
        description: doc.description || "",
        descriptionHtml: typeof doc.description_html === "string" ? doc.description_html : "",
        fift: doc.fift || "",
        gas: doc.gas || "",
        gasDisplay: formatGasDisplay(doc.gas),
        stackDoc: doc.stack || "",
        opcode,
        tlb: bytecode.tlb || "",
        operands: Array.isArray(bytecode.operands) ? bytecode.operands : [],
        valueFlow: {
          inputs,
          outputs,
        },
        registers: {
          inputs: registersIn,
          outputs: registersOut,
        },
        controlFlow: raw.control_flow || null,
        implementationRefs,
        aliases: aliasByMnemonic.get(raw.mnemonic) || [],
        missing: {
          description: descriptionMissing,
          gas: gasMissing,
          tlb: tlbMissing,
          stackDoc: stackDocMissing,
          inputs: inputsMissing,
          outputs: outputsMissing,
          implementation: implementationMissing,
          controlFlow: controlFlowMissing,
        },
      };
    });

    return { instructions, missing };
  }, [spec]);

  const categoryOptions = useMemo(() => {
    const entries = new Map();
    instructions.forEach((item) => {
      if (!entries.has(item.categoryKey)) {
        entries.set(item.categoryKey, item.categoryLabel);
      }
    });
    const sortedEntries = Array.from(entries.entries()).sort((a, b) =>
      a[1].localeCompare(b[1])
    );
    return [
      { value: "All", label: "All categories" },
      ...sortedEntries.map(([value, label]) => ({ value, label })),
    ];
  }, [instructions]);

  const filtered = useMemo(() => {
    const tokens = createSearchTokens(search);
    return instructions.filter((item) => {
      if (category !== "All" && item.categoryKey !== category) return false;
      return itemRelevanceScore(item, tokens) !== Infinity;
    });
  }, [instructions, category, search]);

  const sorted = useMemo(() => {
    const copy = filtered.slice();
    const hasQuery = typeof search === "string" && search.trim().length > 0;
    if (hasQuery) {
      const tokens = createSearchTokens(search);
      copy.sort((a, b) => {
        const sa = itemRelevanceScore(a, tokens);
        const sb = itemRelevanceScore(b, tokens);
        if (sa !== sb) return sa - sb;
        // tie-breakers
        return (
          a.mnemonic.localeCompare(b.mnemonic) ||
          compareOpcodes(a.opcode, b.opcode)
        );
      });
      return copy;
    }
    // no query: use selected sort mode
    if (sortMode === "opcode") {
      // Preserve original array order (as provided by the spec)
      return copy;
    }
    copy.sort((a, b) => {
      switch (sortMode) {
        case "name":
          return a.mnemonic.localeCompare(b.mnemonic);
        case "category":
          return (
            a.categoryLabel.localeCompare(b.categoryLabel) ||
            a.opcode.localeCompare(b.opcode)
          );
        case "since":
          return a.since - b.since || a.opcode.localeCompare(b.opcode);
        default:
          return (
            compareOpcodes(a.opcode, b.opcode) ||
            a.mnemonic.localeCompare(b.mnemonic)
          );
      }
    });
    return copy;
  }, [filtered, sortMode, search]);

  const missingSummary = useMemo(() => {
    if (!missing) return [];
    const summary = [];
    if (missing.description.length)
      summary.push(`${missing.description.length} descriptions`);
    if (missing.stackInputs.length || missing.stackOutputs.length) {
      summary.push(
        `${
          missing.stackInputs.length + missing.stackOutputs.length
        } stack annotations`
      );
    }
    if (missing.tlb.length) summary.push(`${missing.tlb.length} TL-B layouts`);
    if (missing.controlFlow.length) {
      summary.push(`${missing.controlFlow.length} control-flow entries`);
    }
    if (missing.implementation.length) {
      summary.push(`${missing.implementation.length} implementation notes`);
    }
    return summary;
  }, [missing]);

  const toggleRow = useCallback((uid) => {
    setExpanded((prev) => ({
      ...prev,
      [uid]: !prev[uid],
    }));
  }, []);

  return (
    <div className="tvm-instruction-app">
      <style>{tableStyles}</style>

      <div className="tvm-instruction-toolbar">
        <div className="tvm-field" style={{ flex: 2 }}>
          <label htmlFor="tvm-search">Search</label>
          <input
            id="tvm-search"
            type="search"
            placeholder="Find by mnemonic, opcode, description, stack…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>

        <div className="tvm-field" style={{ maxWidth: 210 }}>
          <label htmlFor="tvm-sort">Sort</label>
          <select
            id="tvm-sort"
            value={sortMode}
            onChange={(event) => setSortMode(event.currentTarget.value)}
          >
            <option value="opcode">Opcode</option>
            <option value="name">Mnemonic</option>
            <option value="category">Category</option>
            <option value="since">Since version</option>
          </select>
        </div>

        <div className="tvm-field" style={{ maxWidth: 240 }}>
          <label htmlFor="tvm-category">Category</label>
          <select
            id="tvm-category"
            value={category}
            onChange={(event) => setCategory(event.currentTarget.value)}
          >
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tvm-instruction-meta">
        {loading && <span>Loading specification…</span>}
        {!loading && !error && (
          <span>
            Showing {sorted.length} instructions (of {instructions.length}{" "}
            total)
          </span>
        )}
      </div>

      {!loading && !error && missingSummary.length > 0 && (
        <div className="tvm-missing-banner">
          Incomplete fields in tvm-spec: {missingSummary.join(", ")}. Expand a
          row to see placeholders.
        </div>
      )}

      <div className="tvm-spec-grid-container">
        <div className="tvm-spec-grid-scroll">
          <div className="tvm-spec-header" role="row">
            <div>Link</div>
            <div>Opcode</div>
            <div>Instruction</div>
            <div>Description</div>
            <div>Stack</div>
          </div>

          {error && <div className="tvm-error-row">{error}</div>}

          {!error && (
            <>
              {loading && (
                <div className="tvm-loading-row">Loading specification…</div>
              )}
              {!loading && sorted.length === 0 && (
                <div className="tvm-empty-row">
                  No instructions match the filters.
                </div>
              )}
              {!loading &&
                sorted.flatMap((instruction) => {
                  const isExpanded = Boolean(expanded[instruction.uid]);
                  const aliasCount = Array.isArray(instruction.aliases)
                    ? instruction.aliases.length
                    : 0;
                  const detailId = `tvm-detail-${instruction.uid}`;
                  const anchorId = buildAnchorId(instruction);

                  const nodes = [
                    <div
                      key={instruction.uid}
                      id={anchorId}
                      className={`tvm-spec-row ${
                        isExpanded ? "is-expanded" : ""
                      }`}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      onClick={() => toggleRow(instruction.uid)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleRow(instruction.uid);
                        }
                      }}
                    >
                      <div className="tvm-spec-cell tvm-spec-cell--anchor">
                        <button
                          type="button"
                          className={`tvm-copy-link ${copied[instruction.uid] ? "is-copied" : ""}`}
                          aria-label={copied[instruction.uid] ? "Copied" : "Copy link to instruction"}
                          onClick={(e) => {
                            e.stopPropagation();
                            copyAnchorUrl(anchorId)
                              .then(() => {
                                setCopied((prev) => ({ ...prev, [instruction.uid]: true }));
                                setTimeout(() => {
                                  setCopied((prev) => {
                                    const { [instruction.uid]: _omit, ...rest } = prev;
                                    return rest;
                                  });
                                }, 1500);
                              })
                              .catch(() => {
                                // ignore
                              });
                          }}
                          title={copied[instruction.uid] ? "Copied" : "Copy link"}
                        >
                          {copied[instruction.uid] ? (
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                              <path d="M10.59 13.41a1.996 1.996 0 0 0 2.82 0l3.59-3.59a2 2 0 0 0-2.83-2.83l-1.17 1.17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M13.41 10.59a1.996 1.996 0 0 0-2.82 0L7 14.18a2 2 0 1 0 2.83 2.83l1.17-1.17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="tvm-spec-cell tvm-spec-cell--opcode">
                        <code>{instruction.opcode || "—"}</code>
                      </div>
                      <div className="tvm-spec-cell tvm-spec-cell--name">
                        <div className="tvm-name-line">
                          <span className="tvm-mnemonic">
                            {instruction.mnemonic}
                          </span>
                          {instruction.since > 0 && (
                            <span className="tvm-inline-badge">
                              since v{instruction.since}
                            </span>
                          )}
                          {aliasCount > 0 && (
                            <span className="tvm-inline-badge tvm-inline-badge--muted">
                              {aliasCount} alias{aliasCount > 1 ? "es" : ""}
                            </span>
                          )}
                        </div>
                        {instruction.operands.length > 0 && (
                          <div className="tvm-operands">
                            {instruction.operands.map((operand, idx) => (
                              <span key={idx} className="tvm-operand-chip">
                                {formatOperandSummary(operand)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="tvm-spec-cell tvm-spec-cell--description">
                        {instruction.description ? (
                          <div
                            className="tvm-description"
                            dangerouslySetInnerHTML={{ __html: instruction.description }}
                          />
                        ) : null }
                        <div className="tvm-description-meta">
                          <span className="tvm-category-pill">
                            {instruction.categoryLabel}
                          </span>
                          {instruction.missing.description && (
                            <span className="tvm-inline-badge tvm-inline-badge--muted">
                              Needs docs
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="tvm-spec-cell tvm-spec-cell--stack">
                        {instruction.missing.inputs && instruction.missing.outputs ? instruction.stackDoc : renderStackColumns(instruction, "compact")}
                      </div>
                    </div>,
                  ];

                  if (isExpanded) {
                    nodes.push(
                      <div
                        key={`${instruction.uid}-detail`}
                        className="tvm-spec-row tvm-spec-row--detail"
                      >
                        <div
                          className="tvm-spec-cell tvm-spec-cell--full"
                          id={detailId}
                        >
                          {renderInstructionDetail(instruction)}
                        </div>
                      </div>
                    );
                  }

                  return nodes;
                })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TvmInstructionTable;
