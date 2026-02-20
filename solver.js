(function () {
  const BOARD_SIZE = 6;
  const ITEM_TYPES = [
    'beer','liquor','keg','food','snacks','decor','speakers','drugs','girls','guys','cups','trashcans','music'
  ];

  const ACTIVATION_DEPENDENCIES = {
    beer: 'cups',
    liquor: 'cups',
    keg: 'cups',
    food: 'trashcans',
    snacks: 'trashcans',
    speakers: 'music',
  };

  const ACTIVATION_PERK_MAP = {
    beerNoCups: 'beer',
    liquorNoCups: 'liquor',
    foodNoTrashcan: 'food',
  };

  const LOCAL_TYPES = ITEM_TYPES.filter((t) => !['cups','trashcans','music'].includes(t));

  function key(x, y) { return `${x},${y}`; }

  function inBounds(x, y) { return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE; }

  function neighbors(x, y) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny)) out.push({ x: nx, y: ny });
      }
    }
    return out;
  }

  function dependencyFor(type, perks) {
    const dep = ACTIVATION_DEPENDENCIES[type];
    if (!dep) return null;
    for (const perkName of Object.keys(ACTIVATION_PERK_MAP)) {
      if (ACTIVATION_PERK_MAP[perkName] === type && perks[perkName]) {
        return null;
      }
    }
    return dep;
  }

  function buildMaps(board) {
    const chars = new Map();
    const items = new Map();
    for (const c of board.characters) chars.set(key(c.x, c.y), c);
    for (const i of board.items) items.set(key(i.x, i.y), i);
    return { chars, items };
  }

  function isItemActive(item, itemsMap, perks) {
    const dep = dependencyFor(item.type, perks);
    if (!dep) return true;
    return neighbors(item.x, item.y).some(({ x, y }) => {
      const other = itemsMap.get(key(x, y));
      return other && other.type === dep;
    });
  }

  function evaluateBoard(state) {
    const { board, perks } = state;
    const { items } = buildMaps(board);
    const activeByCell = new Map();
    const globalCounts = Object.fromEntries(ITEM_TYPES.map((t) => [t, 0]));

    for (const it of board.items) {
      const active = isItemActive(it, items, perks.activation);
      activeByCell.set(key(it.x, it.y), active);
      if (active) globalCounts[it.type] += 1;
    }

    let satisfied = 0;
    const diagnostics = [];

    for (const ch of board.characters) {
      const localDetails = ch.localNeeds.map((need) => {
        let count = 0;
        for (const n of neighbors(ch.x, ch.y)) {
          const it = items.get(key(n.x, n.y));
          if (!it) continue;
          if (it.type !== need.type) continue;
          if (!activeByCell.get(key(n.x, n.y))) continue;
          count += 1;
        }
        const ok = count >= need.required;
        if (ok) satisfied += 1;
        return { ...need, count, satisfied: ok };
      });

      const g = ch.globalNeed;
      const count = globalCounts[g.type] || 0;
      const ok = g.operator === 'eq' ? count === g.required : count >= g.required;
      if (ok) satisfied += 1;

      diagnostics.push({
        characterId: ch.id,
        local: localDetails,
        global: { ...g, count, satisfied: ok },
      });
    }

    const multiplier = 1 + 0.25 * satisfied;
    const spent = board.items.reduce((acc, it) => acc + (state.prices[it.type] ?? 0), 0);

    return {
      satisfiedNeeds: satisfied,
      multiplier,
      spent,
      activeByCell,
      diagnostics,
      globalCounts,
      activeItems: board.items.filter((it) => activeByCell.get(key(it.x, it.y))).length,
    };
  }

  function freeCells(board) {
    const blocked = new Set();
    for (const c of board.characters) blocked.add(key(c.x, c.y));
    for (const i of board.items) blocked.add(key(i.x, i.y));
    const out = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (!blocked.has(key(x, y))) out.push({ x, y });
      }
    }
    return out;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ t >>> 15, t | 1);
      r ^= r + Math.imul(r ^ r >>> 7, r | 61);
      return ((r ^ r >>> 14) >>> 0) / 4294967296;
    };
  }

  function optimize(initial, options = {}) {
    const iterations = options.iterations ?? 2500;
    const rng = mulberry32(options.seed ?? 1234);
    const budget = initial.mode === 'budgeted' ? initial.budget : Infinity;

    function score(evalRes) {
      return [
        evalRes.satisfiedNeeds,
        -evalRes.spent,
        -initial.board.items.length,
      ];
    }

    function better(a, b) {
      for (let i = 0; i < a.length; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
      }
      return false;
    }

    let current = structuredClone(initial);
    let currentEval = evaluateBoard(current);
    let best = structuredClone(current);
    let bestEval = currentEval;

    const candidatePool = new Set(['cups', 'trashcans', 'music']);
    for (const ch of initial.board.characters) {
      ch.localNeeds.forEach((n) => candidatePool.add(n.type));
      candidatePool.add(ch.globalNeed.type);
    }
    const candidates = [...candidatePool].filter(Boolean);

    for (let step = 0; step < iterations; step++) {
      const next = structuredClone(current);
      const op = rng();

      if (op < 0.34 && next.board.items.length) {
        next.board.items.splice(Math.floor(rng() * next.board.items.length), 1);
      } else if (op < 0.68) {
        const free = freeCells(next.board);
        if (free.length) {
          const pos = free[Math.floor(rng() * free.length)];
          const type = candidates[Math.floor(rng() * candidates.length)];
          next.board.items.push({ id: crypto.randomUUID(), ...pos, type });
        }
      } else if (next.board.items.length) {
        const idx = Math.floor(rng() * next.board.items.length);
        if (rng() < 0.5) {
          const type = candidates[Math.floor(rng() * candidates.length)];
          next.board.items[idx].type = type;
        } else {
          const occupied = new Set(next.board.characters.map((c) => key(c.x, c.y)));
          next.board.items.forEach((it, i) => { if (i !== idx) occupied.add(key(it.x, it.y)); });
          const spots = [];
          for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) if (!occupied.has(key(x, y))) spots.push({ x, y });
          if (spots.length) {
            const spot = spots[Math.floor(rng() * spots.length)];
            next.board.items[idx].x = spot.x;
            next.board.items[idx].y = spot.y;
          }
        }
      }

      const nextEval = evaluateBoard(next);
      if (nextEval.spent > budget) continue;

      const nScore = score(nextEval);
      const cScore = score(currentEval);
      if (better(nScore, cScore) || rng() < 0.08) {
        current = next;
        currentEval = nextEval;
      }
      const bScore = score(bestEval);
      if (better(nScore, bScore)) {
        best = structuredClone(next);
        bestEval = nextEval;
      }
    }

    return {
      board: best.board,
      metrics: bestEval,
    };
  }

  window.PartyPlannerSolver = {
    BOARD_SIZE,
    ITEM_TYPES,
    LOCAL_TYPES,
    ACTIVATION_DEPENDENCIES,
    evaluateBoard,
    optimize,
  };
})();
