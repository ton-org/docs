const React =
    typeof globalThis !== "undefined" && globalThis.React
      ? globalThis.React
      : (() => {
          throw new Error(
            "React global missing. TvmInstructionTable must run inside a React-powered environment."
          );
        })();

export const TvmInstructionTable = () => {
  const { useCallback, useEffect, useMemo, useRef, useState } = React;

  const PERSIST_KEY = "tvm-instruction-table::filters";

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

  function formatInlineMarkdown(text) {
    if (typeof text !== "string") return "";
    const trimmed = text.trim();
    if (!trimmed) return "";
    const escaped = trimmed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const withCode = escaped.replace(/`([^`]+)`/g, (_match, code) => {
      return `<code>${code}</code>`;
    });
    const withLinks = withCode.replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      (_match, label, url) =>
        `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`
    );
    return withLinks.replace(/\n/g, "<br />");
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

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightMatches(text, tokens) {
    if (typeof text !== "string") return text;
    const safeTokens = Array.isArray(tokens)
      ? tokens.filter((token) => token && token.length > 0)
      : [];
    if (safeTokens.length === 0) return text;
    const pattern = safeTokens.map(escapeRegExp).join("|");
    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, idx) =>
      idx % 2 === 1 ? (
        <span key={`highlight-${idx}`} className="tvm-highlight">
          {part}
        </span>
      ) : (
        part
      )
    );
  }

  function highlightHtmlContent(html, tokens) {
    if (typeof html !== "string") return html || "";
    const safeTokens = Array.isArray(tokens)
      ? tokens.filter((token) => token && token.length > 0)
      : [];
    if (safeTokens.length === 0) return html;
    const pattern = safeTokens.map(escapeRegExp).join("|");
    if (!pattern) return html;
    const regex = new RegExp(`(${pattern})`, "gi");
    return html
      .split(/(<[^>]+>)/g)
      .map((segment) => {
        if (segment.startsWith("<")) return segment;
        return segment.replace(regex, '<span class="tvm-highlight">$1</span>');
      })
      .join("");
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

  function renderControlFlowSummary(controlFlow) {
    if (!controlFlow) {
      return (
        <p className="tvm-missing-placeholder">
          Control flow details are not available.
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
        Control flow details are not available.
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
            Conditional: {highlightMatches(String(entry.name || "?"), searchTokens)}
          </span>
        );
      }

      return (
        <div key={key} className="tvm-stack-conditional">
          <span className="tvm-stack-conditional-name">
            Conditional: {highlightMatches(String(entry.name || "?"), searchTokens)}
          </span>
          {Array.isArray(entry.match) && entry.match.length > 0 ? (
            entry.match.map((matchArm, idx) => (
              <div
                key={`${key}-match-${idx}`}
                className="tvm-stack-conditional-branch"
              >
                <span className="tvm-stack-conditional-label">
                  = {highlightMatches(String(matchArm.value ?? ""), searchTokens)}
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
          {highlightMatches(label, searchTokens)}
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
          {highlightMatches(String(value), searchTokens)}: {highlightMatches(
            String(entry.value_type || "Const"),
            searchTokens
          )}
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
        {highlightMatches(label, searchTokens)}
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
    const hasRegisterInfo = readsRegisters.length > 0 || writesRegisters.length > 0;
    const hasStackData =
      !instruction.missing.inputs || !instruction.missing.outputs;
    const hasFiftExamples =
      Array.isArray(instruction.fiftExamples) &&
      instruction.fiftExamples.length > 0;
    const descriptionHtml = highlightHtmlContent(
      instruction.descriptionHtml || instruction.description || "",
      searchTokens
    );
    const implementationRefs = Array.isArray(instruction.implementationRefs)
      ? instruction.implementationRefs.filter(Boolean)
      : [];
    const hasImplementation = implementationRefs.length > 0;

    const renderRegisterList = (list, keyPrefix) => {
      const tokens = Array.isArray(list)
        ? list
            .map((register, idx) => {
              if (!register) return null;
              if (register.type === "special" && register.name) {
                return (
                  <span
                    key={`${keyPrefix}-special-${idx}`}
                    className="tvm-register-token tvm-register-token--special"
                  >
                    {register.name}
                  </span>
                );
              }
              const sub =
                register.type === "variable"
                  ? register.var_name || "i"
                  : typeof register.index === "number"
                  ? register.index
                  : register.var_name || "?";
              return (
                <span key={`${keyPrefix}-const-${idx}`} className="tvm-register-token">
                  c<sub>{sub}</sub>
                </span>
              );
            })
            .filter(Boolean)
        : [];

      return tokens.flatMap((token, idx) =>
        idx === 0
          ? [token]
          : [
              <span key={`${keyPrefix}-sep-${idx}`} className="tvm-register-sep">
                ,{" "}
              </span>,
              token,
            ]
      );
    };

    const badgeNodes = [
      <span key="gas" className="tvm-detail-badge">
        <span className="tvm-detail-badge-label">Gas</span>{" "}
        <span className="tvm-detail-badge-value">
          {highlightMatches(String(instruction.gasDisplay || "N/A"), searchTokens)}
        </span>
      </span>,
      <span key="version" className="tvm-detail-badge">
        <span className="tvm-detail-badge-label">TVM</span>{" "}
        <span className="tvm-detail-badge-value">
          {highlightMatches(
            instruction.since > 0 ? `v${instruction.since}` : "v0",
            searchTokens
          )}
        </span>
      </span>,
    ];

    if (hasRegisterInfo) {
      if (readsRegisters.length > 0) {
        badgeNodes.push(
          <span key="registers-read" className="tvm-detail-badge tvm-detail-badge--register">
            <span className="tvm-detail-badge-label">Read registers</span>{" "}
            <span className="tvm-detail-badge-value">
              {renderRegisterList(readsRegisters, "read")}
            </span>
          </span>
        );
      }
      if (writesRegisters.length > 0) {
        badgeNodes.push(
          <span key="registers-write" className="tvm-detail-badge tvm-detail-badge--register">
            <span className="tvm-detail-badge-label">Write registers</span>{" "}
            <span className="tvm-detail-badge-value">
              {renderRegisterList(writesRegisters, "write")}
            </span>
          </span>
        );
      }
    }

    return (
      <div className="tvm-detail-panel">
        <div className="tvm-detail-header">
          <div className="tvm-detail-header-main">
            <h4 className="tvm-detail-title">Description</h4>
            <span className="tvm-category-pill">{instruction.categoryLabel}</span>
          </div>
          <div className="tvm-detail-badges">{badgeNodes}</div>
        </div>

        <div className="tvm-detail-columns">
          <div className="tvm-detail-main">
            {descriptionHtml ? (
              <div
                className="tvm-description"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            ) : (
              <p className="tvm-missing-placeholder">Description not available.</p>
            )}

            <div className="tvm-detail-fift">
              <span className="tvm-detail-subtitle">Fift command</span>
              {instruction.fift ? (
                <code className="tvm-detail-code tvm-detail-code--inline">
                  {highlightMatches(String(instruction.fift), searchTokens)}
                </code>
              ) : (
                <span className="tvm-detail-muted">Not documented.</span>
              )}
            </div>
          </div>

          <aside className="tvm-detail-side">
            <div className="tvm-side-block">
              <span className="tvm-side-title">Opcode</span>
              {instruction.tlb ? (
                <code className="tvm-detail-code">
                  {highlightMatches(String(instruction.tlb), searchTokens)}
                </code>
              ) : (
                <p className="tvm-missing-placeholder">TL-B layout not available.</p>
              )}
            </div>

            <div className="tvm-side-block">
              <span className="tvm-side-title">Operands</span>
              {Array.isArray(instruction.operands) && instruction.operands.length > 0 ? (
                <ul className="tvm-operands-list tvm-operands-list--simple">
                  {instruction.operands.map((operand, idx) => {
                    if (!operand || typeof operand !== "object") return null;
                    const summary = highlightMatches(
                      formatOperandSummary(operand),
                      searchTokens
                    );
                    const range =
                      operand.min_value !== undefined || operand.max_value !== undefined
                        ? [operand.min_value, operand.max_value]
                        : null;
                    const hints = Array.isArray(operand.display_hints)
                      ? operand.display_hints.map((hint) => hint?.type).filter(Boolean)
                      : [];
                    return (
                      <li key={`operand-${idx}`} className="tvm-operands-item">
                        <div className="tvm-operands-line">{summary}</div>
                        {range && range.some((value) => value !== undefined) && (
                          <div className="tvm-operands-detail">
                            Range {highlightMatches(String(range[0] ?? "?"), searchTokens)} – {highlightMatches(
                              String(range[1] ?? "?"),
                              searchTokens
                            )}
                          </div>
                        )}
                        {hints.length > 0 && (
                          <div className="tvm-operands-detail">
                            Hints: {highlightMatches(hints.join(", "), searchTokens)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="tvm-detail-muted">No operands.</p>
              )}
            </div>

            <div className="tvm-side-block">
              <span className="tvm-side-title">Stack</span>
              {hasStackData ? (
                renderStackColumns(instruction, "detail")
              ) : (
                <p className="tvm-missing-placeholder">Stack effects not available.</p>
              )}
            </div>
          </aside>
        </div>

        <section className="tvm-detail-section">
          <h4 className="tvm-detail-title">Control flow</h4>
          {renderControlFlowSummary(instruction.controlFlow)}
        </section>

        {hasFiftExamples && (
          <section className="tvm-detail-section tvm-detail-section--wide">
            <h4 className="tvm-detail-title">Fift examples</h4>
            <ul className="tvm-example-list">
              {instruction.fiftExamples.map((example, idx) => {
                const description =
                  typeof example.description === "string" ? example.description : "";
                const fiftCode = typeof example.fift === "string" ? example.fift : "";
                return (
                  <li
                    key={`${instruction.mnemonic}-example-${idx}`}
                    className="tvm-example-item"
                  >
                    {description && (
                      <p
                        className="tvm-example-description"
                        dangerouslySetInnerHTML={{
                          __html: formatInlineMarkdown(description),
                        }}
                      />
                    )}
                    {fiftCode && (
                      <code className="tvm-detail-code tvm-example-code">{fiftCode}</code>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {hasAliases && (
          <section className="tvm-detail-section tvm-detail-section--wide">
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
                    <p className="tvm-alias-description">{alias.description}</p>
                  )}
                  <div className="tvm-alias-meta-row">
                    {alias.doc_fift && (
                      <span className="tvm-alias-pill">
                        Fift <code>{alias.doc_fift}</code>
                      </span>
                    )}
                    {alias.doc_stack && (
                      <span className="tvm-alias-pill">Stack {alias.doc_stack}</span>
                    )}
                    {alias.operands && Object.keys(alias.operands).length > 0 && (
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

        {hasImplementation && (
          <section className="tvm-detail-section tvm-detail-section--wide">
            <h4 className="tvm-detail-title">Implementation</h4>
            <div className="tvm-impl-badges">
              {implementationRefs.map((ref, idx) => {
                const filename = ref.file || "source";
                const linePart =
                  typeof ref.line === "number" && ref.line > 0 ? `:${ref.line}` : "";
                const href = buildGitHubLineUrl(ref.path, ref.line);
                return (
                  <a
                    key={`${instruction.mnemonic}-impl-${idx}`}
                    className="tvm-detail-badge tvm-detail-badge--link"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {filename}
                    {linePart}
                  </a>
                );
              })}
            </div>
          </section>
        )}
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
  const [activeAnchorId, setActiveAnchorId] = useState(null);
  const searchInputRef = useRef(null);
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
  --tvm-row-padding-y: 0.85rem;
  --tvm-row-padding-x: 1rem;
  --tvm-chip-padding-y: 0.2rem;
  --tvm-chip-padding-x: 0.6rem;
  color: var(--tvm-text-primary);
  background: var(--tvm-surface);
  border: 1px solid var(--tvm-border);
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: 0 24px 60px -40px rgb(var(--gray-900) / 0.9);
}

.tvm-instruction-app.is-density-compact {
  --tvm-row-padding-y: 0.6rem;
  --tvm-row-padding-x: 0.75rem;
  --tvm-chip-padding-y: 0.16rem;
  --tvm-chip-padding-x: 0.5rem;
  padding: 1.25rem;
}

.tvm-instruction-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 1.25rem;
}

.tvm-toolbar-utilities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: flex-end;
  margin-left: auto;
  flex: 1 1 240px;
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

.tvm-field--search {
  min-width: min(260px, 100%);
}

.tvm-search-input {
  position: relative;
  display: flex;
  align-items: center;
}

.tvm-field--search input {
  padding-left: 2.2rem;
}

.tvm-search-icon {
  position: absolute;
  left: 0.75rem;
  width: 1rem;
  height: 1rem;
  color: var(--tvm-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tvm-search-icon svg {
  width: 100%;
  height: 100%;
}

.tvm-clear-search {
  position: absolute;
  right: 0.5rem;
  border: none;
  background: none;
  color: var(--tvm-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem;
  cursor: pointer;
  transition: color 0.2s ease-in-out;
}

.tvm-clear-search svg {
  width: 14px;
  height: 14px;
}

.tvm-clear-search:hover {
  color: var(--tvm-accent-strong);
}

.tvm-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 8px;
  border: 1px solid var(--tvm-border);
  background: var(--tvm-surface-secondary);
  color: var(--tvm-text-primary);
  font-size: 0.82rem;
  padding: 0.45rem 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out;
}

.tvm-button svg {
  width: 16px;
  height: 16px;
}

.tvm-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tvm-button:not(:disabled):hover {
  border-color: var(--tvm-border-strong);
  background: rgb(var(--gray-200) / 0.12);
}

.tvm-button--ghost {
  background: transparent;
  color: var(--tvm-text-secondary);
}

.tvm-button--ghost:not(:disabled):hover {
  color: var(--tvm-text-primary);
  background: rgb(var(--gray-200) / 0.1);
}

.tvm-instruction-meta {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--tvm-text-secondary);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tvm-meta-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.tvm-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.tvm-meta-link {
  display: inline-flex;
  align-items: center;
  color: var(--tvm-accent-subtle);
  font-weight: 500;
  text-decoration: none;
  gap: 0.3rem;
}

.tvm-meta-link:hover {
  text-decoration: underline;
}

.tvm-meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tvm-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 999px;
  padding: var(--tvm-chip-padding-y) var(--tvm-chip-padding-x);
  font-size: 0.72rem;
  color: var(--tvm-text-secondary);
  background: var(--tvm-pill-muted-bg);
  border: 1px solid transparent;
  appearance: none;
  cursor: pointer;
  transition: border-color 0.2s ease-in-out, color 0.2s ease-in-out, background 0.2s ease-in-out;
}

.tvm-meta-chip:hover {
  border-color: var(--tvm-border-strong);
  color: var(--tvm-text-primary);
}

.tvm-meta-chip:focus-visible {
  outline: 2px solid var(--tvm-accent-strong);
  outline-offset: 2px;
}

.tvm-meta-chip-label {
  white-space: nowrap;
}

.tvm-meta-chip-close {
  font-size: 0.85em;
  line-height: 1;
}

.tvm-highlight {
  display: inline;
  background: rgb(var(--primary) / 0.18);
  color: var(--tvm-accent-subtle);
  border-radius: 4px;
  padding: 0.05em 0.12em;
  margin: 0 -0.04em;
  line-height: inherit;
  box-decoration-break: clone;
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
  --tvm-grid-template: 60px 110px 260px minmax(320px, 2fr);
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
  padding: calc(var(--tvm-row-padding-y) - 0.1rem) var(--tvm-row-padding-x);
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
  padding: var(--tvm-row-padding-y) var(--tvm-row-padding-x);
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

.tvm-instruction-app.is-density-compact .tvm-spec-row {
  border-top-width: 0.5px;
}

.tvm-instruction-app.is-density-compact .tvm-mnemonic {
  font-size: 0.92rem;
}

.tvm-instruction-app.is-density-compact .tvm-spec-cell--opcode {
  font-size: 0.78rem;
}

.tvm-instruction-app.is-density-compact .tvm-operand-chip {
  font-size: 0.7rem;
  padding: 0.14rem 0.38rem;
}

.tvm-instruction-app.is-density-compact .tvm-inline-badge {
  font-size: 0.68rem;
  padding: 0.14rem 0.45rem;
}

.tvm-instruction-app.is-density-compact .tvm-spec-cell--description {
  gap: 0.2rem;
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

.tvm-row-indicator {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: var(--tvm-text-muted);
  transition: transform 0.2s ease-in-out, color 0.2s ease-in-out, background 0.2s ease-in-out;
  pointer-events: none;
}

.tvm-row-indicator svg {
  width: 14px;
  height: 14px;
}

.tvm-spec-row:hover .tvm-row-indicator {
  background: var(--tvm-pill-muted-bg);
  color: var(--tvm-text-secondary);
}

.tvm-row-indicator.is-expanded {
  transform: rotate(180deg);
  color: var(--tvm-accent-strong);
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.6rem;
}

.tvm-stack-column {
  background: var(--tvm-surface-secondary);
  border: 1px solid rgb(var(--gray-400) / 0.35);
  border-radius: 10px;
  padding: 0.6rem 0.65rem;
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

.tvm-instruction-app.is-density-compact .tvm-stack-pill {
  font-size: 0.7rem;
  padding: 0.14rem 0.35rem;
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

.tvm-stack-footnote {
  display: inline-block;
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.75rem;
  background: rgb(var(--gray-200) / 0.12);
  border: 1px solid var(--tvm-border);
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  color: var(--tvm-text-secondary);
  max-width: 100%;
  overflow-wrap: anywhere;
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
  background: var(--tvm-surface);
  border: 1px solid var(--tvm-border);
  border-radius: 14px;
  padding: 1rem 1.15rem 1.25rem;
  box-shadow: 0 18px 40px -30px rgb(var(--gray-900) / 0.7);
}

.tvm-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.tvm-detail-header-main {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.tvm-detail-title {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--tvm-text-secondary);
}

.tvm-detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.tvm-detail-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--tvm-border);
  border-radius: 999px;
  background: var(--tvm-surface-secondary);
  padding: 0.28rem 0.7rem;
  font-size: 0.78rem;
  color: var(--tvm-text-primary);
}

.tvm-detail-badge-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--tvm-text-secondary);
}

.tvm-detail-badge-value {
  font-weight: 600;
  display: inline-flex;
  gap: 0.2rem;
  color: var(--tvm-text-primary);
}

.tvm-detail-badge--register {
  background: rgb(var(--primary) / 0.08);
  border-color: rgb(var(--primary) / 0.2);
}

.tvm-register-token {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.82rem;
  color: var(--tvm-text-primary);
}

.tvm-register-token sub {
  font-size: 0.7em;
}

.tvm-register-token--special {
  font-weight: 600;
  text-transform: uppercase;
}

.tvm-register-sep {
  color: var(--tvm-text-secondary);
}

.tvm-detail-columns {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(1rem, 2.5vw, 1.6rem);
  align-items: flex-start;
  margin-bottom: 1.1rem;
}

.tvm-detail-main {
  flex: 1 1 320px;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.tvm-detail-main .tvm-description {
  display: block;
  color: var(--tvm-text-primary);
  -webkit-line-clamp: initial;
  -webkit-box-orient: initial;
  overflow: visible;
}

.tvm-detail-subtitle {
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tvm-text-secondary);
}

.tvm-detail-fift {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tvm-detail-code {
  display: block;
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
  background: rgb(var(--gray-200) / 0.08);
  border: 1px solid var(--tvm-border);
  border-radius: 8px;
  padding: 0.6rem 0.65rem;
  color: var(--tvm-text-primary);
}

.tvm-detail-code--inline {
  display: inline-flex;
  padding: 0.35rem 0.5rem;
}

.tvm-detail-muted {
  margin: 0;
  font-size: 0.78rem;
  color: var(--tvm-text-secondary);
}

.tvm-detail-side {
  flex: 0 1 300px;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.tvm-side-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--tvm-surface-secondary);
  border: 1px solid rgb(var(--gray-400) / 0.3);
  border-radius: 12px;
  padding: 0.85rem 0.95rem;
}

.tvm-side-title {
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tvm-text-secondary);
}

.tvm-detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  background: var(--tvm-surface-secondary);
  border: 1px solid rgb(var(--gray-400) / 0.3);
  border-radius: 12px;
  padding: 0.85rem 0.95rem;
  margin-bottom: 0.9rem;
}

.tvm-detail-section--wide {
  margin-bottom: 0.9rem;
}

.tvm-operands-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tvm-operands-list--simple .tvm-operands-item {
  background: var(--tvm-surface);
  border: 1px solid rgb(var(--gray-400) / 0.25);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tvm-operands-line {
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--tvm-text-primary);
}

.tvm-operands-detail {
  font-size: 0.78rem;
  color: var(--tvm-text-secondary);
}

.tvm-impl-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.tvm-detail-badge--link {
  text-decoration: none;
  color: var(--tvm-text-primary);
  transition: border-color 0.2s ease-in-out, color 0.2s ease-in-out;
}

.tvm-detail-badge--link:hover {
  border-color: var(--tvm-accent);
  color: var(--tvm-accent);
}

@media (max-width: 960px) {
  .tvm-detail-header {
    align-items: stretch;
  }

  .tvm-detail-columns {
    flex-direction: column;
  }

  .tvm-detail-section {
    margin-bottom: 0.8rem;
  }
}

@media (max-width: 720px) {
  .tvm-detail-panel {
    padding: 0.95rem 1rem 1.1rem;
  }

  .tvm-side-block,
  .tvm-detail-section {
    padding: 0.85rem 0.9rem;
  }
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
  background: rgb(var(--primary) / 0.04);
  border: 1px solid rgb(var(--primary) / 0.12);
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
}

.tvm-example-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tvm-example-item {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--tvm-surface);
  border: 1px solid rgb(var(--gray-400) / 0.28);
  border-radius: 10px;
  padding: 0.7rem 0.85rem;
}

.tvm-example-description {
  margin: 0;
  font-size: 0.82rem;
  color: var(--tvm-text-primary);
}

.tvm-example-description a {
  color: var(--tvm-accent);
  text-decoration: none;
}

.tvm-example-description a:hover {
  text-decoration: underline;
}

.tvm-example-code {
  white-space: pre-wrap;
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
    --tvm-grid-template: 48px 95px 220px minmax(280px, 2fr);
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

  .tvm-toolbar-utilities {
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
  }

  .tvm-toolbar-divider {
    display: none;
  }

  .tvm-meta-items {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .tvm-stack-columns {
    flex-direction: column;
  }
}
`,
    []
  );
  const searchTokens = useMemo(() => createSearchTokens(search), [search]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs && typeof prefs === "object") {
        if (typeof prefs.search === "string") setSearch(prefs.search);
        if (typeof prefs.category === "string") setCategory(prefs.category);
        if (
          typeof prefs.sortMode === "string" &&
          ["opcode", "name", "category", "since"].includes(prefs.sortMode)
        ) {
          setSortMode(prefs.sortMode);
        }
      }
    } catch (err) {
      // ignore malformed localStorage content
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload = JSON.stringify({
        search,
        category,
        sortMode,
      });
      window.localStorage.setItem(PERSIST_KEY, payload);
    } catch (err) {
      // ignore persistence failures (private mode, etc.)
    }
  }, [search, category, sortMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event) => {
      if (event.defaultPrevented || event.key !== "/") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const active = document.activeElement;
      if (active) {
        const tagName = active.tagName ? active.tagName.toLowerCase() : "";
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          active.isContentEditable
        ) {
          return;
        }
      }
      event.preventDefault();
      if (searchInputRef.current && typeof searchInputRef.current.focus === "function") {
        searchInputRef.current.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const instructions = useMemo(() => {
    if (!spec) {
      return [];
    }

    const aliasByMnemonic = new Map();
    const aliases = Array.isArray(spec.aliases) ? spec.aliases : [];
    aliases.forEach((alias) => {
      if (!alias || !alias.alias_of) return;
      const list = aliasByMnemonic.get(alias.alias_of) || [];
      list.push(alias);
      aliasByMnemonic.set(alias.alias_of, list);
    });

    return (Array.isArray(spec.instructions) ? spec.instructions : []).map(
      (raw, idx) => {
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

        const opcode = bytecode.prefix || "";

        return {
          uid: `${raw.mnemonic}__${opcode || 'nop'}__${idx}`,
          mnemonic: raw.mnemonic,
          since: typeof raw.since_version === "number" ? raw.since_version : 0,
          categoryKey,
          categoryLabel: humanizeCategoryKey(categoryKey),
          description: doc.description || "",
          descriptionHtml: typeof doc.description_html === "string"
            ? doc.description_html
            : "",
          fift: doc.fift || "",
          fiftExamples: Array.isArray(doc.fift_examples)
            ? doc.fift_examples
                .map((example) =>
                  example && typeof example === "object"
                    ? {
                        description:
                          typeof example.description === "string"
                            ? example.description
                            : "",
                        fift:
                          typeof example.fift === "string" ? example.fift : "",
                      }
                    : null
                )
                .filter((example) =>
                  example && (example.description || example.fift)
                )
            : [],
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
      }
    );
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
    return instructions.filter((item) => {
      if (category !== "All" && item.categoryKey !== category) return false;
      return itemRelevanceScore(item, searchTokens) !== Infinity;
    });
  }, [instructions, category, searchTokens]);

  const sorted = useMemo(() => {
    const copy = filtered.slice();
    const hasQuery = searchTokens.length > 0;
    if (hasQuery) {
      const tokens = searchTokens;
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
  }, [filtered, sortMode, searchTokens]);

  const visibleIds = useMemo(() => sorted.map((item) => item.uid), [sorted]);

  const hasExpandedRows = useMemo(
    () => visibleIds.some((id) => expanded[id]),
    [visibleIds, expanded]
  );

  const hasActiveFilters = useMemo(
    () =>
      searchTokens.length > 0 ||
      category !== "All" ||
      sortMode !== "opcode",
    [searchTokens, category, sortMode]
  );

  const handleResetFilters = useCallback(() => {
    setSearch("");
    setCategory("All");
    setSortMode("opcode");
  }, []);

  const handleExpandAll = useCallback(() => {
    if (visibleIds.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      visibleIds.forEach((id) => {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const handleCollapseAll = useCallback(() => {
    if (visibleIds.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      visibleIds.forEach((id) => {
        if (next[id]) {
          changed = true;
          delete next[id];
        }
      });
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const activeFilters = useMemo(() => {
    const chips = [];
    const searchDisplay = search.trim();
    if (searchTokens.length > 0 && searchDisplay) {
      chips.push({
        key: "search",
        label: `Query: "${searchDisplay}"`,
        ariaLabel: `Remove search filter ${searchDisplay}`,
        onRemove: () => setSearch(""),
      });
    }
    if (category !== "All") {
      const match = categoryOptions.find((option) => option.value === category);
      const label = match ? match.label : humanizeCategoryKey(category);
      chips.push({
        key: "category",
        label: `Category: ${label}`,
        ariaLabel: `Remove category filter ${label}`,
        onRemove: () => setCategory("All"),
      });
    }
    if (sortMode !== "opcode") {
      const sortLabels = {
        name: "Mnemonic",
        category: "Category",
        since: "Since version",
      };
      const label = sortLabels[sortMode] || "Opcode";
      chips.push({
        key: "sort",
        label: `Sort: ${label}`,
        ariaLabel: `Remove sort override ${label}`,
        onRemove: () => setSortMode("opcode"),
      });
    }
    return chips;
  }, [
    searchTokens,
    search,
    category,
    categoryOptions,
    sortMode,
    setSearch,
    setCategory,
    setSortMode,
  ]);

  const toggleRow = useCallback((uid) => {
    setExpanded((prev) => ({
      ...prev,
      [uid]: !prev[uid],
    }));
  }, []);

  return (
    <div className="tvm-instruction-app is-density-cozy">
      <style>{tableStyles}</style>

      <div className="tvm-instruction-toolbar">
        <div className="tvm-field tvm-field--search" style={{ flex: 2 }}>
          <label htmlFor="tvm-search">Search</label>
          <div className="tvm-search-input">
            <span className="tvm-search-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M20 20l-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              id="tvm-search"
              type="search"
              placeholder="Find by mnemonic, opcode, description…"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              ref={searchInputRef}
            />
            {search && (
              <button
                type="button"
                className="tvm-clear-search"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M15 9l-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M9 9l6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
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

        <div className="tvm-toolbar-utilities">
          <button
            type="button"
            className="tvm-button tvm-button--ghost"
            onClick={handleResetFilters}
            disabled={!hasActiveFilters}
          >
            Reset filters
          </button>
        </div>
      </div>

      <div className="tvm-instruction-meta">
        <div className="tvm-meta-items">
          {loading && <span className="tvm-meta-item">Loading specification…</span>}
          {error && !loading && (
            <span className="tvm-meta-item">Failed to load specification.</span>
          )}
          {!loading && !error && (
            <span className="tvm-meta-item">
              Showing {sorted.length} of {instructions.length} instructions
            </span>
          )}
        </div>
        {activeFilters.length > 0 && (
          <div className="tvm-meta-chips" aria-live="polite">
            {activeFilters.map(({ key, label, ariaLabel, onRemove }) => (
              <button
                key={key}
                type="button"
                className="tvm-meta-chip"
                onClick={onRemove}
                aria-label={ariaLabel || `Remove filter ${label}`}
                title={label}
              >
                <span className="tvm-meta-chip-label">{label}</span>
                <span className="tvm-meta-chip-close" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tvm-spec-grid-container">
        <div className="tvm-spec-grid-scroll">
          <div className="tvm-spec-header" role="row">
            <div>Link</div>
            <div>Opcode</div>
            <div>Instruction</div>
            <div>Description</div>
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
                  const descriptionHtml = highlightHtmlContent(
                    instruction.descriptionHtml || instruction.description || "",
                    searchTokens
                  );

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
                        <code>
                          {highlightMatches(
                            instruction.opcode || "—",
                            searchTokens
                          )}
                        </code>
                      </div>
                      <div className="tvm-spec-cell tvm-spec-cell--name">
                        <div className="tvm-name-line">
                          <span className="tvm-mnemonic">
                            {highlightMatches(
                              instruction.mnemonic,
                              searchTokens
                            )}
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
                          <span
                            className={`tvm-row-indicator ${
                              isExpanded ? "is-expanded" : ""
                            }`}
                            aria-hidden="true"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M6 9l6 6 6-6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </div>
                        {instruction.operands.length > 0 && (
                          <div className="tvm-operands">
                            {instruction.operands.map((operand, idx) => (
                              <span key={idx} className="tvm-operand-chip">
                                {highlightMatches(
                                  formatOperandSummary(operand),
                                  searchTokens
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="tvm-spec-cell tvm-spec-cell--description">
                        {instruction.description || instruction.descriptionHtml ? (
                          <div
                            className="tvm-description"
                            dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                          />
                        ) : null}
                        <div className="tvm-description-meta">
                          <span className="tvm-category-pill">
                            {instruction.categoryLabel}
                          </span>
                        </div>
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
