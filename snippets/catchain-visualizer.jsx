const React =
  typeof globalThis !== "undefined" && globalThis.React
    ? globalThis.React
    : (() => {
        throw new Error(
          "React global missing. CatchainVisualizer must run inside a React-powered environment."
        );
      })();

export const CatchainVisualizer = () => {
  const MESSAGE_COLORS = {
    Submit: "#6366f1",
    Approve: "#22c55e",
    Vote: "#0ea5e9",
    VoteFor: "#06b6d4",
    Precommit: "#f59e0b",
    Commit: "#3b82f6",
  };

  const MESSAGE_LABELS = {
    Submit: "Submit",
    Approve: "Approve",
    Vote: "Vote",
    VoteFor: "VoteFor",
    Precommit: "PreCommit",
    Commit: "Commit",
  };

  const LAYOUT = {
    centerX: 230,
    centerY: 200,
    nodeRing: 150,
    backdropRadius: 170,
    svgWidth: 520,
    svgHeight: 380,
    nodeRadius: 30,
    ringRadius: 34,
  };

  const LOG_LIMIT = 14;
  const PRIORITY_MOD = 1000;
  const PRIORITY_LAG_FACTOR = 18;
  const APPROVAL_JITTER_MIN = 25;
  const APPROVAL_JITTER_MAX = 180;
  const NULL_PRIORITY = 9999;
  const VOTEFOR_RETRY_MS = 400;
  const PROPOSER_SELF_APPROVE_EXTRA_MS = 120;
  const CANVAS_ARROW_MARKER = { width: 6, height: 6, refX: 5, refY: 3 };
  const LOGO_TEXT_OFFSET = 24;
  const LAGGING_DROP_PROBABILITY = 0.5;
  const VOTEFOR_INITIAL_DELAY_MS = 500;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function createPositions(count) {
    const cx = LAYOUT.centerX;
    const cy = LAYOUT.centerY;
    const r = LAYOUT.nodeRing;
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
      result.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    }
    return result;
  }

  function createNode(index, pos) {
    return {
      id: `V${index + 1}`,
      label: `S${index + 1}`,
      pos,
      approved: new Set(),
      voted: new Set(),
      precommitted: new Set(),
      receivedEvents: {},
      committedTo: null,
      voteTarget: null,
      crashed: false,
      pendingActions: [],
      flushScheduled: false,
      votedThisAttempt: false,
      precommittedThisAttempt: false,
      lastVotedFor: null,
      lastPrecommitFor: null,
      lockedCandidate: null,
      lockedAtAttempt: 0,
      status: "good",
    };
  }

  function makeCandidate(round, attempt, proposerIndex, proposerId) {
    const short = `${round}.${attempt}`;
    return {
      id: `R${round}-P${proposerIndex + 1}`,
      short,
      round,
      attempt,
      proposerIndex,
      proposerId,
      approvals: new Set(),
      votes: new Set(),
      precommits: new Set(),
      commits: new Set(),
      createdAt: null,
      priority: (proposerIndex + round - 1) % PRIORITY_MOD,
    };
  }

  function logEvent(model, text) {
    model.log.unshift({ t: model.time, text });
    if (model.log.length > LOG_LIMIT) {
      model.log = model.log.slice(0, LOG_LIMIT);
    }
  }

  function scheduleTask(model, delayMs, fn, label = "") {
    model.tasks.push({
      runAt: model.time + delayMs,
      fn,
      label,
    });
  }

  function getNode(model, nodeId) {
    return model.nodes.find((n) => n.id === nodeId);
  }

  function chooseVoteTarget(model, node) {
    const eligible = Object.values(model.candidates).filter((c) => {
      const state = c.approvals.size >= model.config.quorum;
      // this node has seen this
      const hasCurrentSeen = !node.receivedEvents[c.id]
        ? false
        : node.receivedEvents[c.id].approved >= model.config.quorum;

      console.log(node.id, c.id, node.receivedEvents[c.id]);
      return state && hasCurrentSeen;
    });

    if (eligible.length === 0) return null;

    if (model.isSlow) {
      if (!node.voteTarget) return null;
      const target = model.candidates[node.voteTarget];
      return target && target.approvals.size >= model.config.quorum
        ? target
        : null;
    }

    // fast attempt
    if (node.lockedCandidate) {
      const locked = model.candidates[node.lockedCandidate];
      if (locked && locked.approvals.size >= model.config.quorum) return locked;
    }
    if (node.lastVotedFor) {
      const prev = model.candidates[node.lastVotedFor];
      if (prev && prev.approvals.size >= model.config.quorum) return prev;
    }

    return eligible.reduce((best, cand) => {
      if (!best) return cand;
      return cand.priority < best.priority ? cand : best;
    }, null);
  }

  function broadcastBlock(model, options) {
    const { from, actions, delay = 0, includeSelf = false } = options;
    if (!actions || actions.length === 0) return;
    const sender = getNode(model, from);
    if (!sender || sender.status === "crashed") return;
    model.nodes.forEach((node) => {
      if (!includeSelf && node.id === from) return;
      if (
        sender.status === "lagging" &&
        Math.random() < LAGGING_DROP_PROBABILITY
      ) {
        return;
      }
      const latency = randomBetween(
        model.config.latency[0],
        model.config.latency[1]
      );
      const sendAt = model.time + delay;
      const primary = actions[0]?.type || "Block";
      model.messages.push({
        id: `${primary}-${from}-${node.id}-${Math.random()
          .toString(16)
          .slice(2, 6)}`,
        type: "Block",
        primary,
        actions,
        from,
        to: node.id,
        sendTime: sendAt,
        recvTime: sendAt + latency,
      });
    });
  }

  function addEvent(node, candidateId, eventType) {
    if (!node.receivedEvents[candidateId]) {
      node.receivedEvents[candidateId] = {
        approved: 0,
        voted: 0,
        precommitted: 0,
        commited: 0,
      };
    }

    switch (eventType) {
      case "approve": {
        node.receivedEvents[candidateId].approved += 1;
        break;
      }
      case "vote": {
        node.receivedEvents[candidateId].voted += 1;
        break;
      }
      case "precommit": {
        node.receivedEvents[candidateId].precommitted += 1;
        break;
      }
      case "commit": {
        node.receivedEvents[candidateId].commited += 1;
        break;
      }
    }
  }

  function enqueueAction(model, node, action, delay = 0, includeSelf = false) {
    scheduleTask(
      model,
      delay,
      () => {
        if (action.type === "Submit") {
          const cand = model.candidates[action.candidateId];
          if (cand && !cand.createdAt) {
            cand.createdAt = model.time;
          }
        }
        broadcastBlock(model, {
          from: node.id,
          actions: [action],
          includeSelf,
        });
      },
      "flush-block"
    );
  }

  function issueApproval(model, node, candidateId, opts = {}) {
    const candidate = model.candidates[candidateId];
    if (
      !candidate ||
      node.status === "crashed" ||
      node.approved.has(candidateId)
    )
      return;
    node.approved.add(candidateId);
    // event for this view
    addEvent(node, candidateId, "approve");
    candidate.approvals.add(node.id);
    if (!candidate.createdAt && candidate.approvals.size === 1) {
      candidate.createdAt = model.time;
    }
    logEvent(
      model,
      `${node.label} approved ${candidate.short} (approvals ${candidate.approvals.size}/${model.config.quorum})`
    );
    enqueueAction(
      model,
      node,
      { type: "Approve", candidateId },
      opts.delay || 0
    );
    tryVote(model, candidateId);
  }

  function issueVote(model, node, candidateId) {
    const candidate = model.candidates[candidateId];
    if (!candidate || node.status === "crashed" || node.votedThisAttempt)
      return;
    if (candidate.approvals.size < model.config.quorum) return;
    node.votedThisAttempt = true;
    node.lastVotedFor = candidateId;
    node.voted.add(candidateId);
    addEvent(node, candidateId, "vote");
    candidate.votes.add(node.id);
    logEvent(
      model,
      `${node.label} voted ${candidate.short} (votes ${candidate.votes.size}/${model.config.quorum})`
    );
    enqueueAction(model, node, { type: "Vote", candidateId });
    tryPrecommit(model, node, candidateId);
  }

  function issuePrecommit(model, node, candidateId) {
    const candidate = model.candidates[candidateId];
    if (!candidate || node.status === "crashed" || node.precommittedThisAttempt)
      return;
    if (candidate.votes.size < model.config.quorum) return;
    if (node.lastVotedFor !== candidateId) return;
    node.precommittedThisAttempt = true;
    node.lastPrecommitFor = candidateId;
    node.lockedCandidate = candidateId;
    node.lockedAtAttempt = model.attempt;
    node.precommitted.add(candidateId);
    addEvent(node, candidateId, "precommit");
    candidate.precommits.add(node.id);
    logEvent(
      model,
      `${node.label} precommitted ${candidate.short} (precommits ${candidate.precommits.size}/${model.config.quorum})`
    );
    enqueueAction(model, node, { type: "Precommit", candidateId });
    tryCommit(model, node, candidateId);
  }

  function issueCommit(model, node, candidateId) {
    const candidate = model.candidates[candidateId];
    if (
      !candidate ||
      node.status === "crashed" ||
      node.committedTo === candidateId
    )
      return;
    if (!node.precommittedThisAttempt || node.lastPrecommitFor !== candidateId)
      return;
    node.committedTo = candidateId;
    candidate.commits.add(node.id);
    addEvent(node, candidateId, "commit");
    logEvent(
      model,
      `${node.label} committed ${candidate.short} (commits ${candidate.commits.size}/${model.config.quorum})`
    );
    enqueueAction(model, node, { type: "Commit", candidateId });
    if (
      !model.committedCandidate &&
      candidate.commits.size >= model.config.quorum
    ) {
      model.committedCandidate = candidateId;
      model.nextRoundAt = model.time + model.config.roundGap;
      logEvent(
        model,
        `✔️ Round ${model.round} locked on ${candidate.short}, starting next round soon`
      );
    }
  }

  function tryVote(model) {
    model.nodes.forEach((node) => {
      if (node.votedThisAttempt) return;
      const target = chooseVoteTarget(model, node);
      if (!target) return;
      scheduleTask(
        model,
        model.config.simDelay,
        () => issueVote(model, node, target.id),
        "vote"
      );
    });
  }

  function tryPrecommit(model, node, candidateId) {
    const candidate = model.candidates[candidateId];
    if (!candidate || candidate.votes.size < model.config.quorum) return;

    // check that this node have seen quorum for votes
    if (
      !node.receivedEvents[candidateId] ||
      node.receivedEvents[candidateId].voted < model.config.quorum
    ) {
      return;
    }

    scheduleTask(
      model,
      model.config.simDelay,
      () => issuePrecommit(model, node, candidateId),
      "precommit"
    );

    // candidate.votes.forEach((nodeId) => {
    //   const node = getNode(model, nodeId);
    //   if (!node || node.precommitted.has(candidateId)) return;
    //   scheduleTask(
    //     model,
    //     model.config.simDelay,
    //     () => issuePrecommit(model, node, candidateId),
    //     "precommit"
    //   );
    // });
  }

  function tryCommit(model, node, candidateId) {
    const candidate = model.candidates[candidateId];
    if (!candidate || candidate.precommits.size < model.config.quorum) return;

    // check that this node have seen quorum for precommits so we can vote
    if (
      !node.receivedEvents[candidateId] ||
      node.receivedEvents[candidateId].precommitted < model.config.quorum
    ) {
      return;
    }

    scheduleTask(
      model,
      model.config.simDelay,
      () => issueCommit(model, node, candidateId),
      "commit"
    );

    // candidate.precommits.forEach((nodeId) => {
    //   const node = getNode(model, nodeId);
    //   if (!node || node.committedTo === candidateId) return;
    //   scheduleTask(
    //     model,
    //     model.config.simDelay,
    //     () => issueCommit(model, node, candidateId),
    //     "commit"
    //   );
    // });
  }

  function calcApprovalDelay(model, node, candidate, isSlow) {
    const base = isSlow ? model.config.DeltaInfinity : model.config.Delta;
    const priorityLag =
      (candidate.proposerIndex + node.label.length) * PRIORITY_LAG_FACTOR;
    const jitter = randomBetween(APPROVAL_JITTER_MIN, APPROVAL_JITTER_MAX);
    return base + priorityLag + jitter;
  }

  function getSimDelay() {
    // TODO: check proposer delay, ensure it with async scheduling
    return randomBetween(APPROVAL_JITTER_MIN, APPROVAL_JITTER_MAX);
  }

  function pickCoordinator(model, attempt) {
    const idx = attempt % model.nodes.length;
    return model.nodes[idx];
  }

  function getNodePriority(round, idx, total, C) {
    const start = (round - 1 + total) % total;
    let adj = idx;
    if (adj < start) adj += total;
    const prio = adj - start;
    return prio < C ? prio : -1;
  }

  function ensureNullCandidate(model) {
    if (model.nullCandidateId) return;
    const id = `R${model.round}-NULL`;
    const candidate = {
      id,
      short: `${model.round}.⊥`,
      round: model.round,
      attempt: model.attempt,
      proposerIndex: -1,
      proposerId: "NULL",
      approvals: new Set(),
      votes: new Set(),
      precommits: new Set(),
      commits: new Set(),
      createdAt: model.time,
      priority: NULL_PRIORITY,
    };
    model.candidates[id] = candidate;
    model.nullCandidateId = id;
    model.nodes.forEach((node) => {
      scheduleTask(
        model,
        model.config.DeltaInfinity,
        () => issueApproval(model, node, id),
        "null-approve"
      );
    });
  }

  function sendVoteFor(model) {
    if (!model.isSlow) return;
    const coord = pickCoordinator(model, model.attempt);
    const candidates = Object.values(model.candidates).filter(
      (c) => !!c.createdAt
    );
    if (candidates.length === 0) {
      scheduleTask(
        model,
        VOTEFOR_RETRY_MS,
        () => sendVoteFor(model),
        "voteFor-retry"
      );
      return;
    }
    const eligible = candidates.filter(
      (c) => c.approvals.size >= model.config.quorum
    );
    if (eligible.length === 0) return;
    const choice = eligible[Math.floor(Math.random() * eligible.length)];
    model.voteForTarget = choice.id;
    logEvent(
      model,
      `${coord.label} suggests ${choice.short} for slow attempt via VoteFor`
    );
    enqueueAction(model, coord, { type: "VoteFor", candidateId: choice.id });
  }

  function handleAction(model, node, action, fromId) {
    let candidate = model.candidates[action.candidateId];
    switch (action.type) {
      case "Submit": {
        if (!candidate) {
          const existing = Object.values(model.candidates).find(
            (c) =>
              c.proposerId === (action.proposerId || fromId) &&
              c.round === (action.round || model.round)
          );
          if (existing) {
            candidate = existing;
          } else {
            candidate = makeCandidate(
              action.round || model.round,
              action.attempt || model.attempt,
              action.proposerIndex ?? 0,
              action.proposerId || fromId
            );
            model.candidates[action.candidateId] = candidate;
          }
        }
        if (!candidate.createdAt) candidate.createdAt = model.time;
        // const delay = calcApprovalDelay(model, node, candidate, model.isSlow);
        if (node.id === candidate.proposerId) {
          scheduleTask(
            model,
            // TODO: fix this const
            500,
            () => issueApproval(model, node, candidate.id),
            "proposer-self-approve"
          );
        } else if (!model.isSlow) {
          scheduleTask(
            model,
            getSimDelay(),
            () => issueApproval(model, node, candidate.id),
            "auto-approve"
          );
        }
        break;
      }
      case "VoteFor": {
        node.voteTarget = action.candidateId;
        if (candidate && !node.approved.has(candidate.id)) {
          const delay = calcApprovalDelay(model, node, candidate, true);
          scheduleTask(
            model,
            delay,
            () => issueApproval(model, node, candidate.id),
            "voteFor-approve"
          );
        }
        tryVote(model);
        break;
      }
      case "Approve": {
        if (candidate && !candidate.approvals.has(fromId)) {
          candidate.approvals.add(fromId);
        }

        addEvent(node, candidate.id, "approve");
        tryVote(model);
        break;
      }
      case "Vote": {
        if (candidate && !candidate.votes.has(fromId)) {
          candidate.votes.add(fromId);
          if (candidate.votes.size >= model.config.quorum) {
            model.nodes.forEach((n) => {
              if (
                n.lockedCandidate &&
                n.lockedCandidate !== candidate.id &&
                model.attempt > n.lockedAtAttempt
              ) {
                // TODO: add quorum check, any vote arrival in a later attempt clears your lock,
                n.lockedCandidate = null;
                n.lockedAtAttempt = 0;
              }
            });
          }
        }

        addEvent(node, candidate.id, "vote");
        tryPrecommit(model, node, candidate.id);
        break;
      }
      case "Precommit": {
        if (candidate && !candidate.precommits.has(fromId)) {
          candidate.precommits.add(fromId);
        }

        addEvent(node, candidate.id, "precommit");
        tryCommit(model, node, candidate.id);
        break;
      }
      case "Commit": {
        // TODO: fix next round individual start
        addEvent(node, candidate.id, "commit");

        if (candidate && node.committedTo !== candidate.id) {
          node.committedTo = candidate.id;
          candidate.commits.add(node.id);
          if (
            !model.committedCandidate &&
            candidate.commits.size >= model.config.quorum
          ) {
            if (
              !node.receivedEvents[candidate.id] ||
              node.receivedEvents[candidate.id] < model.config.quorum
            ) {
              break;
            }

            model.committedCandidate = candidate.id;
            model.nextRoundAt = model.time + model.config.roundGap;
            logEvent(
              model,
              `✔️ Round ${model.round} locked on ${candidate.short}, starting next round soon`
            );
          }
        }
        break;
      }
      default:
        break;
    }
  }

  function handleMessage(model, message) {
    const node = getNode(model, message.to);
    if (!node || node.status === "crashed") return;
    if (node.status === "lagging" && Math.random() < LAGGING_DROP_PROBABILITY)
      return;
    if (message.type !== "Block") return;
    message.actions.forEach((action) =>
      handleAction(model, node, action, message.from)
    );
  }

  function deliverMessages(model) {
    const ready = [];
    const pending = [];
    model.messages.forEach((msg) => {
      if (msg.recvTime <= model.time) {
        ready.push(msg);
      } else {
        pending.push(msg);
      }
    });
    model.messages = pending;
    ready.forEach((msg) => handleMessage(model, msg));
  }

  function runTasks(model) {
    const ready = [];
    const future = [];
    model.tasks.forEach((task) => {
      if (task.runAt <= model.time) {
        ready.push(task);
      } else {
        future.push(task);
      }
    });
    model.tasks = future;
    ready.forEach((task) => {
      try {
        task.fn();
      } catch (err) {
        logEvent(model, `Task error: ${err?.message || err}`);
      }
    });
  }

  function startAttempt(model, options = {}) {
    const forced = options.forceSlow === true;
    model.attempt = options.attempt || model.attempt + 1;
    model.isSlow = forced || model.attempt > model.config.Y;
    model.attemptStartedAt = model.time;
    model.messages = [];
    model.tasks = [];
    model.voteForTarget = null;
    model.nodes.forEach((node) => {
      node.voted = new Set();
      node.precommitted = new Set();
      node.votedThisAttempt = false;
      node.precommittedThisAttempt = false;
      node.lastVotedFor = null;
      node.lastPrecommitFor = null;
      node.voteTarget = null;
    });
    Object.values(model.candidates).forEach((cand) => {
      cand.votes = new Set();
      cand.precommits = new Set();
    });

    const proposerSet = [];
    for (let i = 0; i < model.nodes.length; i += 1) {
      const prio = getNodePriority(
        model.round,
        i,
        model.nodes.length,
        model.config.C
      );
      if (prio >= 0) {
        proposerSet.push({
          node: model.nodes[i],
          priority: prio,
          proposerIndex: i,
        });
      }
    }
    proposerSet.sort((a, b) => a.priority - b.priority);

    proposerSet.forEach(({ node: proposer, priority, proposerIndex }) => {
      let cand = Object.values(model.candidates).find(
        (c) => c.proposerId === proposer.id && c.round === model.round
      );
      if (!cand) {
        cand = makeCandidate(
          model.round,
          model.attempt,
          proposerIndex,
          proposer.id
        );
        cand.priority = priority;
        model.candidates[cand.id] = cand;
      } else {
        cand.priority = priority;
      }
      const submitDelay = Math.max(0, priority * model.config.Delta);
      enqueueAction(
        model,
        proposer,
        {
          type: "Submit",
          candidateId: cand.id,
          round: model.round,
          attempt: model.attempt,
          proposerId: proposer.id,
          proposerIndex,
          priority,
        },
        submitDelay
      );
      scheduleTask(
        model,
        submitDelay + PROPOSER_SELF_APPROVE_EXTRA_MS,
        () => issueApproval(model, proposer, cand.id),
        "proposer-instant-approve"
      );
    });

    const best = proposerSet.find(() => true);
    model.activeCandidateId = best
      ? Object.values(model.candidates).find(
          (c) => c.proposerId === best.node.id && c.round === model.round
        )?.id || ""
      : "";

    logEvent(
      model,
      `▶️ Round ${model.round}, attempt ${model.attempt} (${
        model.isSlow ? "slow" : "fast"
      }), proposer window size ${model.config.C}`
    );
    if (model.isSlow) {
      scheduleTask(
        model,
        VOTEFOR_INITIAL_DELAY_MS,
        () => sendVoteFor(model),
        "voteFor"
      );
    }
    ensureNullCandidate(model);
    scheduleTask(model, model.config.K, () => {
      if (!model.committedCandidate) {
        logEvent(model, `⏱️ Attempt ${model.attempt} timed out, moving on`);
        startAttempt(model, { attempt: model.attempt + 1 });
      }
    });
    tryVote(model);
  }

  function startRound(model, resetRoundNumber = false) {
    if (!resetRoundNumber) {
      model.round += 1;
    }
    model.attempt = 0;
    model.candidates = {};
    model.messages = [];
    model.tasks = [];
    model.committedCandidate = null;
    model.nextRoundAt = null;
    model.nullCandidateId = null;
    model.nodes.forEach((node) => {
      node.approved = new Set();
      node.voted = new Set();
      node.precommitted = new Set();
      node.committedTo = null;
      node.voteTarget = null;
      node.pendingActions = [];
      node.flushScheduled = false;
      node.votedThisAttempt = false;
      node.precommittedThisAttempt = false;
      node.lastVotedFor = null;
      node.lastPrecommitFor = null;
      node.lockedCandidate = null;
    });
    startAttempt(model, { attempt: 1 });
  }

  function createModel(config) {
    const positions = createPositions(config.numNodes);
    const nodes = positions.map((pos, idx) => createNode(idx, pos));
    const model = {
      config,
      time: 0,
      nodes,
      messages: [],
      tasks: [],
      candidates: {},
      activeCandidateId: "",
      attempt: 0,
      round: 1,
      attemptStartedAt: 0,
      isSlow: false,
      committedCandidate: null,
      nextRoundAt: null,
      log: [],
      voteForTarget: null,
      nullCandidateId: null,
    };
    startRound(model, true);
    return model;
  }

  function stepModel(model, dt) {
    model.time += dt;
    runTasks(model);
    deliverMessages(model);
    if (model.nextRoundAt && model.time >= model.nextRoundAt) {
      startRound(model);
    }
    return model;
  }

  const { useEffect, useMemo, useRef, useState } = React;
  const config = useMemo(
    () => ({
      numNodes: 5,
      latency: [420, 900],
      K: 8000, // 8 seconds per attempt
      roundGap: 1000,
      Delta: 2000, // Δ_i = 2(i-1) seconds -> base 2s
      DeltaInfinity: 4000, // 2*C seconds with C=2
      Y: 3, // fast attempts
      C: 2, // round candidates
      simDelay: 250, // local processing/animation delay for follow-up actions
      frameMs: 90,
      quorum: 4,
    }),
    []
  );

  const modelRef = useRef(null);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(0.1);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);

  if (!modelRef.current) {
    modelRef.current = createModel(config);
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (!running) return;
      stepModel(modelRef.current, config.frameMs * speed);
      setTick((t) => t + 1);
    }, config.frameMs);
    return () => clearInterval(id);
  }, [config.frameMs, running, speed]);

  const model = modelRef.current;
  const activeCandidate = model.activeCandidateId
    ? model.candidates[model.activeCandidateId]
    : null;
  const candidates = Object.values(model.candidates)
    .filter((c) =>
      c.proposerId === "NULL" ? c.approvals.size > 0 : !!c.createdAt
    )
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const elapsedAttempt = Math.max(
    0,
    model.time - (model.attemptStartedAt || 0)
  );
  const attemptProgress = clamp(elapsedAttempt / (model.config.K || 1), 0, 1);
  const attemptRemaining = Math.max(0, (model.config.K || 0) - elapsedAttempt);

  const reset = () => {
    modelRef.current = createModel(config);
    setTick((t) => t + 1);
    setSelectedNodeId(null);
    setSelectedMessage(null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <p className="text-base font-semibold">Catchain + BCP visualizer</p>
          <p className="text-sm text-slate-600">
            Fast attempts follow proposer priority; slow attempts follow VoteFor
            guidance and precommit locking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            onClick={() => setRunning((v) => !v)}
          >
            <span>{running ? "Pause" : "Resume"}</span>
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            onClick={reset}
          >
            Restart round
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-100 bg-slate-50 px-2 py-3">
          <svg
            viewBox={`0 0 ${LAYOUT.svgWidth} ${LAYOUT.svgHeight}`}
            className="w-full h-[360px]"
          >
            <defs>
              <marker
                id="arrow-head"
                markerWidth={CANVAS_ARROW_MARKER.width}
                markerHeight={CANVAS_ARROW_MARKER.height}
                refX={CANVAS_ARROW_MARKER.refX}
                refY={CANVAS_ARROW_MARKER.refY}
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L6,3 z" fill="#1e293b" />
              </marker>
            </defs>
            <circle
              cx={LAYOUT.centerX}
              cy={LAYOUT.centerY}
              r={LAYOUT.backdropRadius}
              fill="#f8fafc"
              stroke="#e2e8f0"
              strokeWidth="2"
            />
            {model.nodes.map((node) => {
              const committed =
                node.committedTo === model.committedCandidate &&
                model.committedCandidate;
              const precommitted =
                !committed &&
                activeCandidate &&
                node.precommitted.has(activeCandidate.id)
                  ? true
                  : false;
              const approved =
                !committed &&
                activeCandidate &&
                node.approved.has(activeCandidate.id);
              const ring = committed
                ? "#3b82f6"
                : precommitted
                ? "#f59e0b"
                : approved
                ? "#22c55e"
                : node.status === "lagging"
                ? "#eab308"
                : node.status === "crashed"
                ? "#ef4444"
                : "#94a3b8";
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.pos.x}, ${node.pos.y})`}
                  onClick={() => setSelectedNodeId(node.id)}
                  className="cursor-pointer"
                >
                  <circle
                    r={LAYOUT.nodeRadius}
                    fill={
                      node.status === "crashed"
                        ? "#fee2e2"
                        : node.status === "lagging"
                        ? "#fef3c7"
                        : "#e5e7eb"
                    }
                    stroke="#334155"
                    strokeWidth="3"
                  />
                  <circle
                    r={LAYOUT.ringRadius}
                    fill="none"
                    stroke={ring}
                    strokeWidth="4"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="font-semibold"
                    fill="#0f172a"
                  >
                    {node.label}
                  </text>
                  {node.committedTo && (
                    <text
                      y={LOGO_TEXT_OFFSET}
                      textAnchor="middle"
                      className="text-[9px]"
                      fill="#0f172a"
                    >
                      {node.committedTo}
                    </text>
                  )}
                </g>
              );
            })}

            {model.messages.map((msg) => {
              const fromNode = getNode(model, msg.from);
              const toNode = getNode(model, msg.to);
              if (!fromNode || !toNode) return null;
              const duration = msg.recvTime - msg.sendTime || 1;
              const progress = clamp(
                (model.time - msg.sendTime) / duration,
                0,
                1
              );
              const x =
                fromNode.pos.x + (toNode.pos.x - fromNode.pos.x) * progress;
              const y =
                fromNode.pos.y + (toNode.pos.y - fromNode.pos.y) * progress;
              const primary = msg.primary || msg.type;
              const color = MESSAGE_COLORS[primary] || "#0ea5e9";
              const label =
                msg.actions && msg.actions.length > 1
                  ? `${MESSAGE_LABELS[primary] || primary}+${
                      msg.actions.length - 1
                    }`
                  : MESSAGE_LABELS[primary] || primary;
              return (
                <g
                  key={msg.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedMessage(msg);
                    setSelectedNodeId(null);
                  }}
                >
                  <line
                    x1={fromNode.pos.x}
                    y1={fromNode.pos.y}
                    x2={toNode.pos.x}
                    y2={toNode.pos.y}
                    stroke="#cbd5e1"
                    strokeDasharray="4 6"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="6"
                    fill={color}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    className="text-[9px]"
                    fill="#0f172a"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-inner">
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Round</span>
              <span className="text-slate-700">#{model.round}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Attempt</span>
              <span className="text-slate-700">
                {model.attempt} ({model.isSlow ? "slow" : "fast"})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Proposer</span>
              <span className="text-slate-700">
                {activeCandidate
                  ? `S${activeCandidate.proposerIndex + 1}`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Coordinator</span>
              <span className="text-slate-700">
                {model.isSlow
                  ? pickCoordinator(model, model.attempt).label
                  : "N/A (fast)"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">
                VoteFor target
              </span>
              <span className="text-slate-700">
                {model.voteForTarget || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Committed</span>
              <span className="text-slate-700">
                {model.committedCandidate || "—"}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2">
            <p className="text-xs font-semibold text-slate-700 mb-1">
              Candidates
            </p>
            <div className="flex flex-col gap-2">
              {candidates.slice(0, 4).map((cand) => (
                <div
                  key={cand.id}
                  className="rounded-md bg-white border border-slate-200 p-2"
                >
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>{cand.id}</span>
                    <span className="text-xs text-slate-600">
                      #{cand.short}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-4 gap-2 text-[11px] text-slate-700">
                    <div>
                      <span className="font-semibold text-green-600">
                        {cand.approvals.size}
                      </span>{" "}
                      Approve
                    </div>
                    <div>
                      <span className="font-semibold text-cyan-600">
                        {cand.votes.size}
                      </span>{" "}
                      Vote
                    </div>
                    <div>
                      <span className="font-semibold text-amber-600">
                        {cand.precommits.size}
                      </span>{" "}
                      PreCommit
                    </div>
                    <div>
                      <span className="font-semibold text-blue-600">
                        {cand.commits.size}
                      </span>{" "}
                      Commit
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-700 mb-1">
              Event log
            </p>
            <div className="h-32 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-800">
              {model.log.length === 0 ? (
                <p className="text-slate-500">Simulation warming up…</p>
              ) : (
                model.log.map((item, idx) => (
                  <p key={`${item.t}-${idx}`} className="leading-tight">
                    <span className="text-slate-500 mr-1">
                      t+{Math.round(item.t)}ms
                    </span>
                    {item.text}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
            <span>Attempt timer</span>
            <span className="text-slate-700">
              {attemptRemaining > 0
                ? `${(attemptRemaining / 1000).toFixed(1)}s left`
                : "next attempt soon"}
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-[width]"
              style={{ width: `${Math.min(100, attemptProgress * 100)}%` }}
            />
          </div>
        </div>

        <div
          className="flex items-center gap-3 relative z-50"
          style={{ pointerEvents: "auto" }}
        >
          <span className="text-sm font-semibold text-slate-800">Speed</span>
          <input
            type="range"
            min="0.0001"
            max="1"
            step="0.01"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="flex-1"
            style={{ position: "relative", zIndex: 60, pointerEvents: "auto" }}
          />
          <span className="text-sm text-slate-700">{speed.toFixed(2)}x</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            onClick={() => {
              startAttempt(modelRef.current, {
                forceSlow: true,
                attempt: modelRef.current.attempt + 1,
              });
              setTick((t) => t + 1);
            }}
          >
            Start slow attempt
          </button>
          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            {Object.entries(MESSAGE_COLORS).map(([key, color]) => (
              <span key={key} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: color }}
                ></span>
                {MESSAGE_LABELS[key] || key}
              </span>
            ))}
          </div>
        </div>
      </div>
      {selectedNodeId && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-[380px] max-w-full p-5 space-y-4">
            {(() => {
              const node = model.nodes.find((n) => n.id === selectedNodeId);
              if (!node) return null;
              const setStatus = (status) => {
                node.status = status;
                if (status === "crashed") {
                  node.pendingActions = [];
                  node.flushScheduled = false;
                }
                setTick((t) => t + 1);
              };
              return (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-base font-semibold text-slate-800">
                        {node.label}
                        <span className="ml-2 text-sm font-normal">
                          Status:{" "}
                          <span
                            className={
                              node.status === "crashed"
                                ? "text-red-600"
                                : node.status === "lagging"
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }
                          >
                            {node.status}
                          </span>
                        </span>
                      </p>
                    </div>
                    <button
                      className="text-slate-500 hover:text-slate-800"
                      onClick={() => setSelectedNodeId(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <dl className="text-sm text-slate-700 grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
                    <dt className="font-semibold text-slate-800">Committed</dt>
                    <dd>{node.committedTo || "—"}</dd>
                    <dt className="font-semibold text-slate-800">Locked</dt>
                    <dd>{node.lockedCandidate || "—"}</dd>
                    <dt className="font-semibold text-slate-800">Vote target</dt>
                    <dd>{node.voteTarget || "—"}</dd>
                    <dt className="font-semibold text-slate-800">Approvals</dt>
                    <dd>{node.approved.size}</dd>
                    <dt className="font-semibold text-slate-800">Votes</dt>
                    <dd>{node.voted.size}</dd>
                    <dt className="font-semibold text-slate-800">Precommits</dt>
                    <dd>{node.precommitted.size}</dd>
                  </dl>
                  <div className="flex flex-col gap-2">
                    <button
                      className="rounded-lg border px-3 py-2 text-sm font-medium shadow-sm bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                      onClick={() => setStatus("good")}
                    >
                      Make good
                    </button>
                    <button
                      className="rounded-lg border px-3 py-2 text-sm font-medium shadow-sm bg-red-50 border-red-200 text-red-800 hover:bg-red-100"
                      onClick={() => setStatus("crashed")}
                    >
                      Crash
                    </button>
                    <button
                      className="rounded-lg border px-3 py-2 text-sm font-medium shadow-sm bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                      onClick={() => setStatus("lagging")}
                    >
                      Lagging (50% drop)
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      {selectedMessage && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-[380px] max-w-full p-5 space-y-4">
            {(() => {
              const fromNode = getNode(model, selectedMessage.from);
              const toNode = getNode(model, selectedMessage.to);
              const actions = selectedMessage.actions || [];
              return (
                <>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-base font-semibold text-slate-800">
                        Message
                        <span className="ml-2 text-sm font-normal text-slate-600 align-middle">
                          {selectedMessage.id}
                        </span>
                      </p>
                      <br/>
                      <p className="text-sm text-slate-700 font-semibold">
                        Type: <span className="font-normal">{selectedMessage.primary || selectedMessage.type}</span>
                      </p>
                    </div>
                    <button
                      className="text-slate-500 hover:text-slate-800"
                      onClick={() => setSelectedMessage(null)}
                    >
                      ✕
                    </button>
                  </div>
                  <dl className="text-sm text-slate-700">
                    <div className="flex items-center justify-between py-1">
                      <dt className="font-semibold text-slate-800">From</dt>
                      <dd className="text-right">{fromNode ? fromNode.label : selectedMessage.from}</dd>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <dt className="font-semibold text-slate-800">To</dt>
                      <dd className="text-right">{toNode ? toNode.label : selectedMessage.to}</dd>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <dt className="font-semibold text-slate-800">Send → Receive</dt>
                      <dd className="text-right">
                        {Math.round(selectedMessage.sendTime)} → {Math.round(selectedMessage.recvTime)} ms
                      </dd>
                    </div>
                  </dl>
                  <div className="text-sm text-slate-800">
                    <p className="font-semibold mb-1">Actions</p>
                    {actions.length === 0 ? (
                      <p className="text-slate-600">—</p>
                    ) : (
                      <ul className="list-disc pl-4 space-y-1">
                        {actions.map((act, idx) => (
                          <li key={`${act.type}-${idx}`} className="text-slate-700">
                            {act.type} {act.candidateId ? `→ ${act.candidateId}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
