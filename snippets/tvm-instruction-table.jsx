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

  const SPEC_REPO = "https://github.com/ton-org/tvm-spec-docs-builder";
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

  const CATEGORY_GROUPS = [
    {
      key: "stack",
      label: "Stack",
      patterns: [/^stack_/],
    },
    {
      key: "continuations",
      label: "Continuations & Control Flow",
      patterns: [/^cont_/, /^codepage$/],
    },
    {
      key: "arithmetic",
      label: "Arithmetic & Logic",
      patterns: [/^arithm_/, /^compare_/],
    },
    {
      key: "cells",
      label: "Cells & Tuples",
      patterns: [/^cell_/, /^tuple$/],
    },
    {
      key: "dictionaries",
      label: "Dictionaries",
      patterns: [/^dict_/],
    },
    {
      key: "constants",
      label: "Constants",
      patterns: [/^const_/],
    },
    {
      key: "crypto",
      label: "Crypto",
      patterns: [/^app_crypto/],
    },
    {
      key: "applications",
      label: "Blockchain",
      patterns: [/^app_(?!crypto)/],
    },
    {
      key: "exceptions",
      label: "Exceptions",
      patterns: [/^exceptions$/],
    },
    {
      key: "debug",
      label: "Debugging",
      patterns: [/^debug$/],
    }
  ];

  const CATEGORY_GROUP_KEYS = new Set(
    CATEGORY_GROUPS.map((group) => group.key)
  );

  function resolveCategoryGroup(categoryKey) {
    const normalized = (categoryKey || "").toLowerCase();
    for (const group of CATEGORY_GROUPS) {
      if (
        Array.isArray(group.patterns) &&
        group.patterns.length > 0 &&
        group.patterns.some((pattern) => pattern.test(normalized))
      ) {
        return group;
      }
    }
    return CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1];
  }

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

  function copyPlainText(value) {
    try {
      const { navigator, document } = window;
      if (navigator?.clipboard?.writeText) {
        return navigator.clipboard.writeText(value);
      }
      const ta = document.createElement("textarea");
      ta.value = value;
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

  function cleanAliasDescription(html) {
    if (typeof html !== "string") return "";
    let output = html.trim();
    if (!output) return "";
    output = output.replace(/^<p>/i, "").replace(/<\/p>$/i, "");
    output = output.replace(/\.+$/g, "");
    return output.trim();
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
    if (!controlFlow || typeof controlFlow !== "object") {
      return (
        <p className="tvm-missing-placeholder">
          Control flow details are not available.
        </p>
      );
    }

    const branches = Array.isArray(controlFlow.branches)
      ? controlFlow.branches.filter(Boolean)
      : [];
    const nobranch = Boolean(controlFlow.nobranch);
    const isContinuationObject = (value) =>
      Boolean(value && typeof value === "object" && typeof value.type === "string");

    const formatPrimitiveValue = (value) => {
      if (value === null || value === undefined) return "";
      if (Array.isArray(value)) {
        return value
          .map((item) => formatPrimitiveValue(item))
          .filter(Boolean)
          .join(", ");
      }
      if (typeof value === "object") {
        return "";
      }
      if (typeof value === "boolean") {
        return value ? "true" : "false";
      }
      return String(value);
    };

    const describeContinuation = (node) => {
      if (!isContinuationObject(node)) {
        return {
          typeLabel: "unknown",
          valueLabel: "?",
          detailLabel: "",
          text: "unknown ?",
        };
      }

      const type = String(node.type || "").toLowerCase();
      let typeLabel = "unknown";
      let valueLabel = "";

      switch (type) {
        case "variable":
          typeLabel = "var";
          valueLabel = typeof node.var_name === "string" ? node.var_name : "?";
          break;
        case "register":
          typeLabel = "register";
          if (typeof node.index === "number") {
            valueLabel = `c${node.index}`;
          } else if (typeof node.var_name === "string") {
            valueLabel = `c{${node.var_name}}`;
          } else {
            valueLabel = "c?";
          }
          break;
        case "cc":
          typeLabel = "cc";
          valueLabel = "";
          break;
        case "special":
          typeLabel = "special";
          valueLabel = typeof node.name === "string" && node.name ? node.name : "?";
          break;
        default:
          typeLabel = node.type ? String(node.type) : "unknown";
          valueLabel = "";
          break;
      }

      const detailParts = [];
      if (type === "special") {
        const args = node.args && typeof node.args === "object" ? node.args : {};
        Object.entries(args).forEach(([argKey, argValue]) => {
          if (!isContinuationObject(argValue)) {
            const formatted = formatPrimitiveValue(argValue);
            if (formatted) {
              detailParts.push(`${argKey}=${formatted}`);
            }
          }
        });
      }

      const knownKeys = new Set(["type", "var_name", "index", "name", "args", "save"]);
      Object.entries(node).forEach(([key, value]) => {
        if (knownKeys.has(key)) return;
        const formatted = formatPrimitiveValue(value);
        if (formatted) {
          detailParts.push(`${key}=${formatted}`);
        }
      });

      const detailLabel = detailParts.length > 0 ? `(${detailParts.join(", ")})` : "";
      const text = [typeLabel, valueLabel, detailLabel]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      return { typeLabel, valueLabel, detailLabel, text };
    };

    const gatherChildContinuations = (node) => {
      if (!isContinuationObject(node)) return [];
      const type = String(node.type || "").toLowerCase();
      const children = [];

      const saveEntries =
        node.save && typeof node.save === "object"
          ? Object.entries(node.save).filter(([, value]) => isContinuationObject(value))
          : [];
      saveEntries
        .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
        .forEach(([slot, value]) => {
          children.push({
            label: String(slot),
            node: value,
          });
        });

      if (type === "special") {
        const args = node.args && typeof node.args === "object" ? node.args : {};
        Object.entries(args).forEach(([argKey, argValue]) => {
          if (isContinuationObject(argValue)) {
            children.push({
              label: argKey,
              node: argValue,
            });
          }
        });
      }

      return children.map((child) => {
        const raw = child.label ? String(child.label) : "";
        const cleaned = raw.replace(/^(arg|save)\s+/i, "").trim();
        return {
          label: cleaned,
          node: child.node,
        };
      });
    };

    const buildContinuationTree = (node, path = "root") => {
      const summary = describeContinuation(node);
      const children = gatherChildContinuations(node).map((child, idx) => ({
        label: child.label,
        tree: buildContinuationTree(child.node, `${path}.${idx}`),
      }));
      return { id: path, summary, children };
    };

    const splitEdgeLabel = (label) => {
      if (!label) {
        return { primary: "", secondary: "" };
      }
      const text = label.trim();
      if (!text) {
        return { primary: "", secondary: "" };
      }
      const tokens = text.split(/\s+/);
      if (tokens.length <= 1) {
        return { primary: text, secondary: "" };
      }
      return {
        primary: tokens[0],
        secondary: tokens.slice(1).join(" "),
      };
    };

    const computeSpan = (tree) => {
      if (!tree.children || tree.children.length === 0) {
        tree.span = 1;
        return 1;
      }
      let total = 0;
      tree.children.forEach((child) => {
        total += computeSpan(child.tree);
      });
      tree.span = Math.max(total, 1);
      return tree.span;
    };

    const H_SPACING = 200;
    const V_SPACING = 110;
    const NODE_HEIGHT = 42;
    const NODE_MIN_WIDTH = 140;
    const PADDING_X = 60;
    const PADDING_Y = 60;

    let canvasMeasureCtx = null;
    const measureNodeWidth = (summary) => {
      if (typeof document !== "undefined") {
        if (!canvasMeasureCtx) {
          const canvas = document.createElement("canvas");
          canvasMeasureCtx = canvas.getContext("2d");
        }
        if (canvasMeasureCtx) {
          canvasMeasureCtx.font = "600 13px 'JetBrains Mono', 'Menlo', 'Monaco', monospace";
          const typeText = (summary.typeLabel || "").toUpperCase();
          const parts = [typeText];
          if (summary.valueLabel) parts.push(summary.valueLabel);
          if (summary.detailLabel) parts.push(summary.detailLabel);
          const text = parts.join(" ").trim();
          const metrics = canvasMeasureCtx.measureText(text || "node");
          return Math.max(metrics.width + 48, NODE_MIN_WIDTH);
        }
      }
      const fallbackLength =
        (summary.typeLabel || "").length +
        (summary.valueLabel || "").length +
        (summary.detailLabel || "").length;
      return Math.max(fallbackLength * 7 + 48, NODE_MIN_WIDTH);
    };

    const assignPositions = (
      tree,
      nodes,
      nodeMap,
      edges,
      depth = 0,
      offsetSpan = 0
    ) => {
      const span = Math.max(tree.span || 1, 1);
      const spanWidth = span * H_SPACING;
      const x = PADDING_X + offsetSpan + spanWidth / 2;
      const y = PADDING_Y + depth * V_SPACING;
      const width = measureNodeWidth(tree.summary);
      const nodeEntry = {
        id: tree.id,
        summary: tree.summary,
        x,
        y,
        width,
        height: NODE_HEIGHT,
      };
      nodes.push(nodeEntry);
      nodeMap.set(tree.id, nodeEntry);

      let childOffset = offsetSpan;
      tree.children.forEach((child) => {
        assignPositions(child.tree, nodes, nodeMap, edges, depth + 1, childOffset);
        edges.push({
          from: tree.id,
          to: child.tree.id,
          label: child.label,
        });
        childOffset += Math.max(child.tree.span || 1, 1) * H_SPACING;
      });
    };

    return (
      <div>
        {(branches.length > 0 || !nobranch) ? (<div><b>Falls through: </b>{nobranch ? "Yes" : "No"}</div>) : null}
        {branches.length > 0 ? (
          <div className="tvm-control-flow-branches">
            {branches.map((branch, index) => {
              const rootSummary = describeContinuation(branch);
              const branchType = (rootSummary.typeLabel || "").toUpperCase();
              const branchTitleText = `Branch -> ${branchType}${
                rootSummary.valueLabel ? ` ${rootSummary.valueLabel}` : ""
              }`;
              const tree = buildContinuationTree(branch, `branch-${index}`);
              computeSpan(tree);
              const nodes = [];
              const nodeMap = new Map();
              const edges = [];
              assignPositions(tree, nodes, nodeMap, edges);

              let minX = Infinity;
              let maxX = -Infinity;
              let minY = Infinity;
              let maxY = -Infinity;
              nodes.forEach((node) => {
                minX = Math.min(minX, node.x - node.width / 2);
                maxX = Math.max(maxX, node.x + node.width / 2);
                minY = Math.min(minY, node.y - node.height / 2);
                maxY = Math.max(maxY, node.y + node.height / 2);
              });

              const shiftX = Number.isFinite(minX) ? PADDING_X - minX : 0;
              const shiftY = Number.isFinite(minY) ? PADDING_Y - minY : 0;
              if (shiftX || shiftY) {
                nodes.forEach((node) => {
                  node.x += shiftX;
                  node.y += shiftY;
                });
              }

              const canvasWidth = Math.max(maxX - minX + PADDING_X * 2, 260);
              const canvasHeight = Math.max(maxY - minY + PADDING_Y * 2, NODE_HEIGHT + PADDING_Y * 2);

              const edgeLayouts = edges
                .map((edge, edgeIdx) => {
                  const from = nodeMap.get(edge.from);
                  const to = nodeMap.get(edge.to);
                  if (!from || !to) return null;
                  const fromX = from.x;
                  const fromY = from.y + from.height / 2;
                  const toX = to.x;
                  const toY = to.y - to.height / 2;
                  const midY = fromY + (toY - fromY) / 2;
                  const path = `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
                  const labelX = (fromX + toX) / 2;
                  const labelY = midY;
                  const segments = splitEdgeLabel(edge.label);
                  const hasSecondary = Boolean(segments.secondary);
                  return {
                    id: `${edge.from}->${edge.to}-${edgeIdx}`,
                    path,
                    labelX,
                    labelY,
                    segments,
                    hasSecondary,
                  };
                })
                .filter(Boolean);

              return (
                <div key={`branch-${index}`} className="tvm-control-flow-branch">
                  <div className="tvm-control-flow-branch-header">
                    <span className="tvm-control-flow-branch-title">
                      {highlightMatches(branchTitleText, searchTokens)}
                    </span>
                  </div>
                  <div className="tvm-flow-graph-wrapper">
                    <div
                      className="tvm-flow-canvas"
                      style={{
                        width: `${canvasWidth}px`,
                        height: `${canvasHeight}px`,
                      }}
                    >
                      <svg
                        className="tvm-flow-canvas-svg"
                        width={canvasWidth}
                        height={canvasHeight}
                        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                        preserveAspectRatio="xMinYMin meet"
                      >
                        <defs>
                          <marker
                            id="tvm-flow-arrowhead"
                            markerWidth="8"
                            markerHeight="8"
                            refX="6"
                            refY="4"
                            orient="auto"
                            markerUnits="strokeWidth"
                          >
                            <path d="M1 1 L7 4 L1 7 Z" fill="currentColor" />
                          </marker>
                        </defs>
                        {edgeLayouts.map((edge) => (
                          <path
                            key={`edge-path-${edge.id}`}
                            d={edge.path}
                            className="tvm-flow-graph-line"
                            markerEnd="url(#tvm-flow-arrowhead)"
                          />
                        ))}
                      </svg>
                      {edgeLayouts.map((edge) => (
                        edge.segments.primary ? (
                      <div
                        key={`edge-label-${edge.id}`}
                        className={`tvm-flow-edge-label${
                          edge.hasSecondary ? ' has-secondary' : ''
                        }`}
                        style={{
                          left: `${edge.labelX}px`,
                          top: `${edge.labelY}px`,
                        }}
                      >
                        <span className="tvm-flow-edge-label-primary">
                          {highlightMatches(edge.segments.primary.toUpperCase(), searchTokens)}
                        </span>
                        {edge.segments.secondary && (
                          <span className="tvm-flow-edge-label-secondary">
                            {highlightMatches(edge.segments.secondary.toUpperCase(), searchTokens)}
                          </span>
                        )}
                      </div>
                        ) : null
                      ))}
                      {nodes.map((node) => (
                        <div
                          key={node.id}
                          className="tvm-flow-node"
                          style={{
                            left: `${node.x}px`,
                            top: `${node.y}px`,
                          }}
                        >
                          <span
                            className="tvm-control-flow-node-pill"
                            style={{ minWidth: `${node.width}px` }}
                          >
                            <span className="tvm-control-flow-node-type">
                              {highlightMatches(
                                (node.summary.typeLabel || "").toUpperCase(),
                                searchTokens
                              )}
                            </span>
                            {node.summary.valueLabel && (
                              <span className="tvm-control-flow-node-value">
                                {highlightMatches(node.summary.valueLabel, searchTokens)}
                              </span>
                            )}
                            {node.summary.detailLabel && (
                              <span className="tvm-control-flow-node-extra">
                                {highlightMatches(node.summary.detailLabel, searchTokens)}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="tvm-detail-muted">
            {nobranch
              ? "Instruction does not modify the current continuation."
              : "Control flow branches are not documented in the specification."}
          </p>
        )}
      </div>
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

  function renderInstructionDetail(instruction, options = {}) {
    const { isAnchorTarget = false, onOpenRawJson = () => {} } = options;
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

    const panelClassName = `tvm-detail-panel${
      isAnchorTarget ? " is-anchor-target" : ""
    }`;

    return (
      <div className={panelClassName}>
        <div className="tvm-detail-header">
          <div className="tvm-detail-heading">
            <div className="tvm-detail-header-main">
              <h4 className="tvm-detail-title">{instruction.mnemonic}</h4>
            </div>
          </div>
          <div className="tvm-detail-actions">
            <button
              type="button"
              className="tvm-button tvm-button--ghost"
              onClick={() => onOpenRawJson(instruction)}
            >
              Raw JSON
            </button>
          </div>
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

            <div className="tvm-detail-badges">{badgeNodes}</div>

            <div className="tvm-detail-block">
              <span className="tvm-detail-subtitle">Fift command</span>
              {instruction.fift ? (
                <code className="tvm-detail-code tvm-detail-code--inline">
                  {highlightMatches(String(instruction.fift), searchTokens)}
                </code>
              ) : (
                <span className="tvm-detail-muted">Not documented.</span>
              )}
            </div>

            <div className="tvm-detail-block">
              <span className="tvm-detail-subtitle">Control flow</span>
              {renderControlFlowSummary(instruction.controlFlow)}
            </div>

            {hasImplementation && (
              <div className="tvm-detail-block">
                <span className="tvm-detail-subtitle">Implementation</span>
                <div className="tvm-impl-badges">
                  {implementationRefs.map((ref, idx) => {
                    const filename = ref.file || "source";
                    const linePart =
                      typeof ref.line === "number" && ref.line > 0
                        ? `:${ref.line}`
                        : "";
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
              </div>
            )}

            {hasFiftExamples && (
              <section className="tvm-detail-section tvm-detail-section--wide">
                <h4 className="tvm-detail-title">Fift examples</h4>
                <div className="tvm-example-list">
                  {instruction.fiftExamples.map((example, idx) => {
                    const description =
                      typeof example.description === "string" ? example.description : "";
                    const fiftCode = typeof example.fift === "string" ? example.fift : "";
                    return (
                      <div
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
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {hasAliases && (
              <section className="tvm-detail-section tvm-detail-section--wide">
                <h4 className="tvm-detail-title">Aliases</h4>
                <div className="tvm-alias-list">
                  {instruction.aliases.map((alias) => {
                    const aliasDescriptionHtml = cleanAliasDescription(
                      alias.description || ""
                    );
                    const hasAliasMeta =
                      Boolean(alias.doc_fift) ||
                      (alias.operands && Object.keys(alias.operands).length > 0);

                    return (
                      <div key={alias.mnemonic} className="tvm-alias-item">
                        <div className="tvm-alias-headline">
                          <code>{alias.mnemonic}</code>
                          <span className="tvm-alias-meta">
                            alias of <code>{alias.alias_of}</code>
                          </span>
                        </div>
                        {aliasDescriptionHtml && (
                          <div
                            className="tvm-alias-description"
                            dangerouslySetInnerHTML={{
                              __html: aliasDescriptionHtml,
                            }}
                          />
                        )}
                        {hasAliasMeta && (
                          <div className="tvm-alias-meta-row">
                            {alias.doc_fift && (
                              <span className="tvm-alias-pill">
                                Fift <code>{alias.doc_fift}</code>
                              </span>
                            )}
                            {alias.operands && Object.keys(alias.operands).length > 0 && (
                              <span className="tvm-alias-pill">
                                Operands {formatAliasOperands(alias.operands)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
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
              <span className="tvm-side-title">Category</span>
              <div className="tvm-side-category-value">
                {highlightMatches(instruction.rawCategoryLabel, searchTokens)}
              </div>
            </div>

            <div className="tvm-side-block">
              <span className="tvm-side-title">Operands</span>
              {Array.isArray(instruction.operands) && instruction.operands.length > 0 ? (
                <div className="tvm-operands-list">
                  {instruction.operands.map((operand, idx) => {
                    if (!operand || typeof operand !== "object") return null;
                    const summary = highlightMatches(
                      formatOperandSummary(operand),
                      searchTokens
                    );
                    const hasRange =
                      operand.min_value !== undefined || operand.max_value !== undefined;
                    return (
                      <div key={`operand-${idx}`} className="tvm-operands-item">
                        <div className="tvm-operands-line">{summary}</div>
                        {hasRange && (
                          <div className="tvm-operands-detail">
                            Range {highlightMatches(String(operand.min_value ?? "?"), searchTokens)} – {highlightMatches(
                              String(operand.max_value ?? "?"),
                              searchTokens
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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

        
      </div>
    );
  }

  const [spec, setSpec] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [subcategory, setSubcategory] = useState("All");
  const [sortMode, setSortMode] = useState("opcode");
  const [expanded, setExpanded] = useState({});
  const [copied, setCopied] = useState({});
  const [activeAnchorId, setActiveAnchorId] = useState(null);
  const [rawModalInstruction, setRawModalInstruction] = useState(null);
  const [rawModalCopied, setRawModalCopied] = useState(false);
  const searchInputRef = useRef(null);
  const rawModalCopyTimeoutRef = useRef(null);
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
  --tvm-stack-array-bg: rgb(var(--primary) / 0.2);
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
  --tvm-control-height: 2.75rem;
  color: var(--tvm-text-primary);
  background: var(--tvm-surface);
  border: 1px solid var(--tvm-border);
  border-radius: 14px;
  padding: 1.5rem;
  box-shadow: 0 24px 60px -40px rgb(var(--gray-900) / 0.9);
}

.tvm-instruction-toolbar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.tvm-toolbar-search {
  display: flex;
}

.tvm-toolbar-search .tvm-field--search {
  flex: 1 1 auto;
}

.tvm-search-row {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}

.tvm-search-row .tvm-search-input {
  flex: 1 1 auto;
}

.tvm-search-row .tvm-toolbar-utilities {
  position: static;
  width: auto;
  align-self: stretch;
  align-items: stretch;
}

.tvm-search-row .tvm-toolbar-utilities .tvm-button {
  height: 100%;
}

.tvm-toolbar-utilities {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: flex-end;
  justify-self: end;
  align-self: end;
  width: max-content;
}

.tvm-toolbar-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, max-content));
  gap: 0.75rem;
  align-items: end;
  justify-content: flex-start;
}

.tvm-toolbar-filters .tvm-field {
  min-width: 0;
  width: min(280px, 100%);
}

.tvm-field--sort {
  width: min(240px, 100%);
}

.tvm-field--category {
  width: min(280px, 100%);
}

.tvm-field--subcategory {
  width: min(300px, 100%);
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
  min-height: var(--tvm-control-height);
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
  padding: 0 0.95rem;
  min-height: var(--tvm-control-height);
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
  background: rgb(var(--primary) / 0.22);
  color: inherit;
  border-radius: 4px;
  padding: 0 0.08em;
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

.tvm-spec-row.is-anchor-target {
  background: rgb(var(--primary) / 0.16);
  box-shadow: inset 0 0 0 1px var(--tvm-accent-strong);
}

.tvm-spec-row--detail.is-anchor-target {
  background: rgb(var(--primary) / 0.1);
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

.tvm-spec-row.is-anchor-target .tvm-row-indicator {
  color: var(--tvm-accent-strong);
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

.tvm-description p {
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

.tvm-detail-panel.is-anchor-target {
  border-color: var(--tvm-accent-strong);
  box-shadow: 0 0 0 2px var(--tvm-accent-soft), 0 18px 40px -30px rgb(var(--gray-900) / 0.7);
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

.tvm-detail-heading {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  align-items: flex-start;
  flex: 1 1 auto;
}

.tvm-detail-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
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
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.tvm-detail-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  background: var(--tvm-surface-secondary);
  border: 1px solid var(--tvm-border);
  border-radius: 12px;
  padding: 0.85rem 0.95rem;
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
  overflow-x: auto;
  max-width: 100%;
}

.tvm-detail-code--inline {
  display: block;
  padding: 0.5rem 0.6rem;
  word-break: break-word;
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

.tvm-side-category-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--tvm-text-primary);
}

.tvm-side-category-raw {
  font-size: 0.82rem;
  font-weight: 400;
  color: var(--tvm-text-secondary);
  margin-left: 0.3rem;
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
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tvm-operands-item {
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

.tvm-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
}

.tvm-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgb(var(--gray-900) / 0.45);
  backdrop-filter: blur(1px);
}

.tvm-modal-dialog {
  position: relative;
  background: var(--tvm-surface);
  border: 1px solid var(--tvm-border);
  border-radius: 14px;
  box-shadow: 0 32px 90px -40px rgb(var(--gray-900) / 0.9);
  width: min(720px, 100%);
  max-height: calc(100% - 2rem);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.1rem 1.2rem 1.3rem;
  color: var(--tvm-text-primary);
}

.tvm-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.tvm-modal-header-text {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tvm-modal-header-text h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--tvm-text-primary);
}

.tvm-modal-subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--tvm-text-secondary);
}

.tvm-modal-subtitle code {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.82rem;
  padding: 0.1rem 0.3rem;
  border-radius: 0.4rem;
  background: var(--tvm-pill-muted-bg);
  color: var(--tvm-text-primary);
}

.tvm-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-end;
}

.tvm-modal-code {
  flex: 1 1 auto;
  margin: 0;
  border: 1px solid var(--tvm-border-strong);
  border-radius: 10px;
  padding: 0.85rem 0.95rem;
  background: rgb(var(--gray-200) / 0.16);
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.82rem;
  line-height: 1.55;
  overflow: auto;
  white-space: pre;
  color: var(--tvm-text-primary);
  tab-size: 2;
}

@media (max-width: 1040px) {
  .tvm-instruction-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .tvm-toolbar-utilities {
    justify-content: flex-start;
    width: 100%;
  }
}

@media (max-width: 900px) {
  .tvm-spec-grid-scroll {
    overflow-x: visible;
  }

  .tvm-spec-header {
    display: none;
  }

  .tvm-spec-row,
  .tvm-spec-row--detail {
    --tvm-grid-template: 48px minmax(0, 1fr);
    grid-template-columns: var(--tvm-grid-template);
    min-width: 0;
    align-items: start;
  }

  .tvm-spec-row .tvm-spec-cell--anchor {
    grid-row: span 2;
  }

  .tvm-spec-row .tvm-spec-cell--opcode {
    grid-row: 1;
    grid-column: 2 / -1;
    justify-content: flex-start;
    align-items: baseline;
  }

  .tvm-spec-row .tvm-spec-cell--name {
    grid-column: 2 / -1;
  }

  .tvm-spec-row .tvm-spec-cell--description {
    grid-column: 1 / -1;
  }
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

  .tvm-detail-actions {
    width: 100%;
    justify-content: stretch;
  }

  .tvm-detail-actions .tvm-button {
    flex: 1 1 auto;
  }
}

@media (max-width: 640px) {
  .tvm-modal {
    padding: 0.75rem;
  }

  .tvm-modal-dialog {
    width: 100%;
    max-height: calc(100% - 1.5rem);
    padding: 1rem;
  }

  .tvm-modal-actions {
    width: 100%;
    justify-content: stretch;
  }

  .tvm-modal-actions .tvm-button {
    flex: 1 1 auto;
  }
}

.tvm-control-flow {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.75rem 0.8rem;
  border-radius: 12px;
  border: 1px solid var(--tvm-border);
  background: var(--tvm-surface-secondary);
}

.tvm-control-flow-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--tvm-text-secondary);
}

.tvm-control-flow-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tvm-control-flow-value {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.85rem;
  color: var(--tvm-text-primary);
}

.tvm-control-flow-branches {
  list-style: none;
  margin: 0;
  margin-top: 0.5rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.tvm-control-flow-branch {
  background: var(--tvm-surface);
  border: 1px solid rgb(var(--gray-400) / 0.35);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.tvm-control-flow-branch-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
}

.tvm-control-flow-branch-title {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--tvm-text-primary);
}

.tvm-control-flow-branch-condition {
  font-size: 0.76rem;
  color: var(--tvm-text-secondary);
}


.tvm-flow-graph-wrapper {
  position: relative;
  width: 100%;
  overflow-x: auto;
  padding: 0.35rem 0;
}

.tvm-flow-canvas {
  position: relative;
  display: inline-block;
  min-height: 120px;
  min-width: 100%;
}

.tvm-flow-canvas-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.tvm-flow-graph-line {
  fill: none;
  stroke: rgb(var(--primary) / 0.45);
  stroke-width: 1.6;
}


.tvm-flow-node {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}

.tvm-flow-edge-label {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.08rem 0.45rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--primary) / 0.2);
  background: var(--tvm-surface);
}

.tvm-flow-edge-label.has-secondary {
  background: linear-gradient(
    90deg,
    rgb(var(--primary) / 0.08) 0%,
    rgb(var(--primary) / 0.08) 50%,
    rgb(var(--primary) / 0.04) 50%,
    rgb(var(--primary) / 0.04) 100%
  );
}

.tvm-flow-edge-label-primary {
  color: rgb(var(--primary));
}

.tvm-flow-edge-label-secondary {
  color: rgb(var(--primary) / 0.55);
}

.tvm-control-flow-node-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid rgb(var(--primary) / 0.25);
  border-radius: 999px;
  padding: 0.18rem 0.65rem;
  background: rgb(var(--primary) / 0.05);
  white-space: nowrap;
}

.tvm-control-flow-node-type {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.66rem;
  font-weight: 600;
  color: rgb(var(--primary) / 0.9);
}

.tvm-control-flow-node-value {
  font-family: 'JetBrains Mono', 'Menlo', 'Monaco', monospace;
  font-size: 0.66rem;
  color: var(--tvm-text-primary);
}

.tvm-control-flow-node-extra {
  font-size: 0.72rem;
  color: var(--tvm-text-secondary);
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
  list-style: none;
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
  .tvm-field {
    width: 100%;
    min-width: 0;
  }

  .tvm-toolbar-filters {
    grid-template-columns: 1fr;
  }

  .tvm-toolbar-utilities {
    justify-self: stretch;
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
        if (
          typeof prefs.category === "string" &&
          (prefs.category === "All" || CATEGORY_GROUP_KEYS.has(prefs.category))
        ) {
          setCategory(prefs.category);
        }
        if (typeof prefs.subcategory === "string") {
          setSubcategory(prefs.subcategory);
        }
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
        subcategory,
        sortMode,
      });
      window.localStorage.setItem(PERSIST_KEY, payload);
    } catch (err) {
      // ignore persistence failures (private mode, etc.)
    }
  }, [search, category, subcategory, sortMode]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncHash = () => {
      const hash = window.location.hash ? window.location.hash.slice(1) : "";
      if (!hash) {
        setActiveAnchorId(null);
        return;
      }
      try {
        setActiveAnchorId(decodeURIComponent(hash));
      } catch (_err) {
        setActiveAnchorId(hash);
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
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

        const categoryKeyRaw = doc.category || "uncategorized";
        const categoryGroup = resolveCategoryGroup(categoryKeyRaw);
        const categoryGroupKey = categoryGroup.key;
        const categoryGroupLabel = categoryGroup.label;
        const rawCategoryLabel = humanizeCategoryKey(categoryKeyRaw);
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
        const anchorId = buildAnchorId({ opcode, mnemonic: raw.mnemonic });

        return {
          uid: `${raw.mnemonic}__${opcode || 'nop'}__${idx}`,
          mnemonic: raw.mnemonic,
          since: typeof raw.since_version === "number" ? raw.since_version : 0,
          anchorId,
          categoryKey: categoryGroupKey,
          categoryLabel: categoryGroupLabel,
          rawCategoryKey: categoryKeyRaw,
          rawCategoryLabel,
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
          rawSpec: raw,
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

  const anchorInstruction = useMemo(() => {
    if (!activeAnchorId) return null;
    return instructions.find((item) => item.anchorId === activeAnchorId) || null;
  }, [instructions, activeAnchorId]);

  useEffect(() => {
    if (!anchorInstruction) return;
    setExpanded((prev) => {
      if (prev[anchorInstruction.uid]) return prev;
      return {
        ...prev,
        [anchorInstruction.uid]: true,
      };
    });
  }, [anchorInstruction]);

  useEffect(() => {
    if (!anchorInstruction) return;
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (!anchorInstruction.anchorId) return;
    const frame =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (cb) => setTimeout(cb, 0);
    frame(() => {
      const element = document.getElementById(anchorInstruction.anchorId);
      if (element && typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, [anchorInstruction]);

  const subcategoryMap = useMemo(() => {
    const groups = new Map();
    instructions.forEach((item) => {
      if (!item || !item.categoryKey) return;
      const groupKey = item.categoryKey;
      const rawKey = item.rawCategoryKey || "uncategorized";
      const label = item.rawCategoryLabel || humanizeCategoryKey(rawKey);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, new Map());
      }
      const entries = groups.get(groupKey);
      if (!entries.has(rawKey)) {
        entries.set(rawKey, {
          value: rawKey,
          label,
          count: 0,
        });
      }
      const record = entries.get(rawKey);
      record.count += 1;
      if (!record.label && label) {
        record.label = label;
      }
    });
    const normalized = new Map();
    groups.forEach((entries, key) => {
      const list = Array.from(entries.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      );
      normalized.set(key, list);
    });
    return normalized;
  }, [instructions]);

  const categoryOptions = useMemo(() => {
    const present = new Set(subcategoryMap.keys());
    const ordered = CATEGORY_GROUPS.filter((group) => present.has(group.key)).map(
      (group) => ({ value: group.key, label: group.label })
    );
    return [
      { value: "All", label: "All categories" },
      ...ordered,
    ];
  }, [subcategoryMap]);

  const currentSubcategoryOptions = useMemo(() => {
    if (category === "All") return [];
    return subcategoryMap.get(category) || [];
  }, [subcategoryMap, category]);

  const showSubcategorySelect =
    category !== "All" && currentSubcategoryOptions.length > 1;

  useEffect(() => {
    if (category === "All") return;
    const hasSelection = categoryOptions.some(
      (option) => option.value === category
    );
    if (!hasSelection) {
      setCategory("All");
    }
  }, [categoryOptions, category]);

  useEffect(() => {
    if (category === "All") {
      if (subcategory !== "All") {
        setSubcategory("All");
      }
      return;
    }
    const options = currentSubcategoryOptions;
    if (!options || options.length <= 1) {
      if (subcategory !== "All") {
        setSubcategory("All");
      }
      return;
    }
    const hasSubcategory = options.some((option) => option.value === subcategory);
    if (!hasSubcategory) {
      setSubcategory("All");
    }
  }, [category, subcategory, currentSubcategoryOptions]);

  const filtered = useMemo(() => {
    const forcedUid = anchorInstruction?.uid ?? null;
    return instructions.filter((item) => {
      if (forcedUid && item.uid === forcedUid) return true;
      if (category !== "All" && item.categoryKey !== category) return false;
      if (
        category !== "All" &&
        subcategory !== "All" &&
        item.rawCategoryKey !== subcategory
      ) {
        return false;
      }
      return itemRelevanceScore(item, searchTokens) !== Infinity;
    });
  }, [
    instructions,
    category,
    subcategory,
    searchTokens,
    anchorInstruction,
  ]);

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
    } else if (sortMode !== "opcode") {
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
            return (b.since == 9999 ? -1 : b.since) -  (a.since == 9999 ? -1 : a.since);
          default:
            return (
              compareOpcodes(a.opcode, b.opcode) ||
              a.mnemonic.localeCompare(b.mnemonic)
            );
        }
      });
    }

    const forcedUid = anchorInstruction?.uid ?? null;
    if (forcedUid) {
      let forcedItem = null;
      const forcedIndex = copy.findIndex((item) => item.uid === forcedUid);
      if (forcedIndex >= 0) {
        [forcedItem] = copy.splice(forcedIndex, 1);
      } else if (anchorInstruction) {
        forcedItem = anchorInstruction;
      }
      if (forcedItem) {
        copy.unshift(forcedItem);
      }
    }

    return copy;
  }, [filtered, sortMode, searchTokens, anchorInstruction]);

  const hasActiveFilters = useMemo(
    () =>
      searchTokens.length > 0 ||
      category !== "All" ||
      subcategory !== "All" ||
      sortMode !== "opcode",
    [searchTokens, category, subcategory, sortMode]
  );

  const handleResetFilters = useCallback(() => {
    setSearch("");
    setCategory("All");
    setSubcategory("All");
    setSortMode("opcode");
  }, []);

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
    if (category !== "All" && subcategory !== "All") {
      const match = currentSubcategoryOptions.find(
        (option) => option.value === subcategory
      );
      const label = match ? match.label : humanizeCategoryKey(subcategory);
      chips.push({
        key: "subcategory",
        label: `Subcategory: ${label}`,
        ariaLabel: `Remove subcategory filter ${label}`,
        onRemove: () => setSubcategory("All"),
      });
    }
    if (sortMode !== "opcode") {
      const sortLabels = {
        since: "Newest",
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
    subcategory,
    categoryOptions,
    currentSubcategoryOptions,
    sortMode,
    setSearch,
    setCategory,
    setSubcategory,
    setSortMode,
  ]);

  const toggleRow = useCallback((uid) => {
    setExpanded((prev) => ({
      ...prev,
      [uid]: !prev[uid],
    }));
  }, []);

  const openRawJsonModal = useCallback(
    (instruction) => {
      if (!instruction) return;
      const payload = {
        mnemonic: instruction.mnemonic,
        opcode: instruction.opcode,
        anchorId: instruction.anchorId,
        raw: instruction.rawSpec || instruction,
      };
      setRawModalInstruction(payload);
      setRawModalCopied(false);
      if (rawModalCopyTimeoutRef.current) {
        clearTimeout(rawModalCopyTimeoutRef.current);
        rawModalCopyTimeoutRef.current = null;
      }
    },
    []
  );

  const closeRawJsonModal = useCallback(() => {
    setRawModalInstruction(null);
    setRawModalCopied(false);
    if (rawModalCopyTimeoutRef.current) {
      clearTimeout(rawModalCopyTimeoutRef.current);
      rawModalCopyTimeoutRef.current = null;
    }
  }, []);

  const handleCopyRawJson = useCallback((jsonText) => {
    copyPlainText(jsonText)
      .then(() => {
        setRawModalCopied(true);
        if (rawModalCopyTimeoutRef.current) {
          clearTimeout(rawModalCopyTimeoutRef.current);
        }
        rawModalCopyTimeoutRef.current = setTimeout(() => {
          setRawModalCopied(false);
          rawModalCopyTimeoutRef.current = null;
        }, 1500);
      })
      .catch(() => {
        // ignore clipboard failures
      });
  }, []);

  useEffect(() => {
    if (!rawModalInstruction) return;
    if (typeof window === "undefined") return;
    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRawJsonModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rawModalInstruction, closeRawJsonModal]);

  const rawModalJson = useMemo(() => {
    if (!rawModalInstruction) return "";
    try {
      return JSON.stringify(rawModalInstruction.raw ?? null, null, 2);
    } catch (err) {
      return "// Failed to serialize instruction";
    }
  }, [rawModalInstruction]);

  useEffect(() => {
    return () => {
      if (rawModalCopyTimeoutRef.current) {
        clearTimeout(rawModalCopyTimeoutRef.current);
        rawModalCopyTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div className="tvm-instruction-app">
      <style>{tableStyles}</style>

      <div className="tvm-instruction-toolbar">
        <div className="tvm-toolbar-search">
          <div className="tvm-field tvm-field--search">
            <label htmlFor="tvm-search">Search</label>
            <div className="tvm-search-row">
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
          </div>
        </div>

        <div className="tvm-toolbar-filters">
          <div className="tvm-field tvm-field--sort">
            <label htmlFor="tvm-sort">Sort</label>
            <select
              id="tvm-sort"
              value={sortMode}
              onChange={(event) => setSortMode(event.currentTarget.value)}
            >
              <option value="opcode">Opcode</option>
              <option value="since">Newest</option>
            </select>
          </div>

          <div className="tvm-field tvm-field--category">
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

          {showSubcategorySelect && (
            <div className="tvm-field tvm-field--subcategory">
              <label htmlFor="tvm-subcategory">Subcategory</label>
              <select
                id="tvm-subcategory"
                value={subcategory}
                onChange={(event) => setSubcategory(event.currentTarget.value)}
              >
                <option value="All">All subcategories</option>
                {currentSubcategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                  const anchorId = instruction.anchorId || buildAnchorId(instruction);
                  const isAnchorTarget =
                    anchorInstruction && anchorInstruction.uid === instruction.uid;
                  const rowClassName = [
                    "tvm-spec-row",
                    isExpanded ? "is-expanded" : "",
                    isAnchorTarget ? "is-anchor-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const descriptionHtml = highlightHtmlContent(
                    instruction.descriptionHtml || instruction.description || "",
                    searchTokens
                  );

                  const nodes = [
                    <div
                      key={instruction.uid}
                      id={anchorId}
                      className={rowClassName}
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
                              {instruction.since != 9999 ? `since v${instruction.since}` : 'unimplemented yet' }
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
                        className={`tvm-spec-row tvm-spec-row--detail ${
                          isAnchorTarget ? "is-anchor-target" : ""
                        }`}
                      >
                        <div
                          className="tvm-spec-cell tvm-spec-cell--full"
                          id={detailId}
                        >
                          {renderInstructionDetail(instruction, {
                            isAnchorTarget,
                            onOpenRawJson: openRawJsonModal,
                          })}
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

      {rawModalInstruction && (
        <div
          className="tvm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tvm-raw-json-title"
        >
          <div className="tvm-modal-backdrop" onClick={closeRawJsonModal} />
          <div
            className="tvm-modal-dialog"
            role="document"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tvm-modal-header">
              <div className="tvm-modal-header-text">
                <h3 id="tvm-raw-json-title">Raw instruction JSON</h3>
                <p className="tvm-modal-subtitle">
                  {rawModalInstruction.opcode ? (
                    <>
                      <code>{rawModalInstruction.opcode}</code>
                      {" "}
                    </>
                  ) : null}
                  {rawModalInstruction.mnemonic}
                </p>
              </div>
              <div className="tvm-modal-actions">
                <button
                  type="button"
                  className="tvm-button tvm-button--ghost"
                  onClick={() => handleCopyRawJson(rawModalJson)}
                >
                  {rawModalCopied ? "Copied" : "Copy JSON"}
                </button>
                <button
                  type="button"
                  className="tvm-button"
                  onClick={closeRawJsonModal}
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="tvm-modal-code">{rawModalJson}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default TvmInstructionTable;
