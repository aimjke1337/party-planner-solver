(() => {
  const { BOARD_SIZE, ITEM_TYPES, LOCAL_TYPES, evaluateBoard, optimize } = window.PartyPlannerSolver;

  const DEFAULT_PRICES = {
    beer: 2, liquor: 3, keg: 5, food: 2, snacks: 2, decor: 1,
    speakers: 3, drugs: 4, girls: 2, guys: 2, cups: 1, trashcans: 1, music: 1,
  };

  const CHARACTER_TEMPLATES = [
    { name: 'Alex', avatar: '🧑‍🎤' },
    { name: 'Blair', avatar: '🧑‍💼' },
    { name: 'Casey', avatar: '🧑‍🍳' },
    { name: 'Drew', avatar: '🧑‍🚀' },
    { name: 'Elliot', avatar: '🧑‍🎧' },
    { name: 'Fran', avatar: '🧑‍🔬' },
  ];

  const NEED_OPERATORS = [
    { value: 'gte', label: '>= ' },
    { value: 'eq', label: '== ' },
  ];

  const state = {
    mode: 'unlimited',
    budget: 40,
    prices: { ...DEFAULT_PRICES },
    perks: {
      activation: { beerNoCups: false, liquorNoCups: false, foodNoTrashcan: false },
      cost: { drugsCheap: false, kegsCheap: false, speakersCheap: false },
    },
    board: { characters: [], items: [] },
    selectedCharacterId: null,
  };

  const boardEl = document.getElementById('board');
  const characterPaletteEl = document.getElementById('characterPalette');
  const itemPaletteEl = document.getElementById('itemPalette');
  const characterEditorEl = document.getElementById('characterEditor');
  const solverOutputEl = document.getElementById('solverOutput');

  function defaultCharacterNeedSet() {
    return {
      localNeeds: [
        { type: 'beer', required: 1 },
        { type: 'food', required: 1 },
        { type: 'speakers', required: 1 },
      ],
      globalNeed: { type: 'decor', operator: 'gte', required: 1 },
    };
  }

  function coordKey(x, y) { return `${x},${y}`; }

  function occupiedByCharacter(x, y) {
    return state.board.characters.find((c) => c.x === x && c.y === y);
  }

  function occupiedByItem(x, y) {
    return state.board.items.find((it) => it.x === x && it.y === y);
  }

  function effectivePrices() {
    const p = { ...state.prices };
    if (state.perks.cost.drugsCheap) p.drugs = Math.min(p.drugs, 1);
    if (state.perks.cost.kegsCheap) p.keg = Math.min(p.keg, 2);
    if (state.perks.cost.speakersCheap) p.speakers = Math.min(p.speakers, 1);
    return p;
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    const evaluation = evaluateBoard({ board: state.board, perks: state.perks, prices: effectivePrices() });

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.x = x;
        cell.dataset.y = y;

        const ch = occupiedByCharacter(x, y);
        const item = occupiedByItem(x, y);

        if (ch) {
          cell.classList.add('character');
          cell.textContent = `${ch.avatar} ${ch.name}`;
          cell.title = 'Click to edit character';
          cell.onclick = () => {
            state.selectedCharacterId = ch.id;
            renderCharacterEditor();
          };
        } else if (item) {
          const active = evaluation.activeByCell.get(coordKey(x, y));
          cell.classList.add(active ? 'item-active' : 'item-inactive');
          cell.textContent = item.type;
          cell.title = active ? 'Active item (click to remove)' : 'Inactive item (click to remove)';
          cell.onclick = () => {
            state.board.items = state.board.items.filter((it) => it.id !== item.id);
            renderAll();
          };
        }

        cell.addEventListener('dragover', (e) => {
          e.preventDefault();
          cell.classList.add('drag-over');
        });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          cell.classList.remove('drag-over');
          const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
          handleDrop(payload, x, y);
        });

        boardEl.appendChild(cell);
      }
    }
  }

  function handleDrop(payload, x, y) {
    if (payload.kind === 'character') {
      state.board.items = state.board.items.filter((it) => !(it.x === x && it.y === y));
      const existing = occupiedByCharacter(x, y);
      if (existing) {
        existing.name = payload.name;
        existing.avatar = payload.avatar;
        return renderAll();
      }
      const defaults = defaultCharacterNeedSet();
      state.board.characters.push({
        id: crypto.randomUUID(),
        x, y,
        name: payload.name,
        avatar: payload.avatar,
        localNeeds: defaults.localNeeds,
        globalNeed: defaults.globalNeed,
      });
    }

    if (payload.kind === 'item') {
      if (occupiedByCharacter(x, y)) return;
      state.board.items = state.board.items.filter((it) => !(it.x === x && it.y === y));
      state.board.items.push({ id: crypto.randomUUID(), x, y, type: payload.type });
    }

    renderAll();
  }

  function makeDraggableChip(label, payload) {
    const chip = document.createElement('div');
    chip.className = 'palette-item';
    chip.draggable = true;
    chip.textContent = label;
    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    });
    return chip;
  }

  function renderPalettes() {
    characterPaletteEl.innerHTML = '';
    CHARACTER_TEMPLATES.forEach((c) => {
      characterPaletteEl.appendChild(makeDraggableChip(`${c.avatar} ${c.name}`, { kind: 'character', ...c }));
    });

    itemPaletteEl.innerHTML = '';
    ITEM_TYPES.forEach((type) => {
      itemPaletteEl.appendChild(makeDraggableChip(type, { kind: 'item', type }));
    });
  }

  function renderCharacterEditor() {
    const ch = state.board.characters.find((c) => c.id === state.selectedCharacterId);
    if (!ch) {
      characterEditorEl.textContent = 'Click a character on the board to edit needs.';
      return;
    }

    const wrap = document.createElement('div');
    const title = document.createElement('div');
    title.innerHTML = `<strong>${ch.avatar} ${ch.name}</strong> @ (${ch.x},${ch.y})`;
    wrap.appendChild(title);

    const localHeader = document.createElement('div');
    localHeader.className = 'need-header';
    localHeader.textContent = 'Local Needs';
    wrap.appendChild(localHeader);

    ch.localNeeds.forEach((need, idx) => {
      const row = document.createElement('div');
      row.className = 'need-row';

      const typeSelect = document.createElement('select');
      LOCAL_TYPES.forEach((type) => {
        const o = document.createElement('option');
        o.value = type;
        o.textContent = type;
        if (need.type === type) o.selected = true;
        typeSelect.appendChild(o);
      });
      typeSelect.onchange = () => { ch.localNeeds[idx].type = typeSelect.value; };

      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '0';
      countInput.max = '8';
      countInput.value = need.required;
      countInput.onchange = () => { ch.localNeeds[idx].required = Number(countInput.value); };

      row.append(typeSelect, countInput);
      wrap.appendChild(row);
    });

    const globalHeader = document.createElement('div');
    globalHeader.className = 'need-header';
    globalHeader.textContent = 'Global Need';
    wrap.appendChild(globalHeader);

    const grow = document.createElement('div');
    grow.className = 'need-row';

    const gType = document.createElement('select');
    ITEM_TYPES.forEach((type) => {
      const o = document.createElement('option');
      o.value = type;
      o.textContent = type;
      if (ch.globalNeed.type === type) o.selected = true;
      gType.appendChild(o);
    });
    gType.onchange = () => { ch.globalNeed.type = gType.value; };

    const gOp = document.createElement('select');
    NEED_OPERATORS.forEach((op) => {
      const o = document.createElement('option');
      o.value = op.value;
      o.textContent = op.label;
      if (ch.globalNeed.operator === op.value) o.selected = true;
      gOp.appendChild(o);
    });
    gOp.onchange = () => { ch.globalNeed.operator = gOp.value; };

    const gCount = document.createElement('input');
    gCount.type = 'number';
    gCount.min = '0';
    gCount.value = ch.globalNeed.required;
    gCount.onchange = () => { ch.globalNeed.required = Number(gCount.value); };

    grow.append(gType, gOp);
    wrap.appendChild(grow);
    wrap.appendChild(gCount);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove Character';
    removeBtn.onclick = () => {
      state.board.characters = state.board.characters.filter((c) => c.id !== ch.id);
      state.selectedCharacterId = null;
      renderAll();
    };
    wrap.appendChild(removeBtn);

    characterEditorEl.innerHTML = '';
    characterEditorEl.appendChild(wrap);
  }

  function renderControls() {
    const modeSelect = document.getElementById('modeSelect');
    modeSelect.value = state.mode;
    modeSelect.onchange = () => {
      state.mode = modeSelect.value;
    };

    const budgetInput = document.getElementById('budgetInput');
    budgetInput.value = state.budget;
    budgetInput.onchange = () => {
      state.budget = Number(budgetInput.value);
    };

    const activationPerksEl = document.getElementById('activationPerks');
    activationPerksEl.innerHTML = '';
    [
      ['beerNoCups', 'Beer no Cups'],
      ['liquorNoCups', 'Liquor no Cups'],
      ['foodNoTrashcan', 'Food no Trashcan'],
    ].forEach(([key, label]) => {
      const l = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.perks.activation[key];
      cb.onchange = () => { state.perks.activation[key] = cb.checked; renderBoard(); };
      l.append(cb, label);
      activationPerksEl.appendChild(l);
    });

    const priceControls = document.getElementById('priceControls');
    priceControls.innerHTML = '';
    ITEM_TYPES.forEach((type) => {
      const l = document.createElement('label');
      l.textContent = type;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = state.prices[type];
      input.onchange = () => { state.prices[type] = Number(input.value); };
      l.appendChild(input);
      priceControls.appendChild(l);
    });

    [
      ['drugsCheap', 'Drugs cheap'],
      ['kegsCheap', 'Kegs cheap'],
      ['speakersCheap', 'Speakers cheap'],
    ].forEach(([key, label]) => {
      const l = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.perks.cost[key];
      cb.onchange = () => { state.perks.cost[key] = cb.checked; };
      l.append(cb, label);
      priceControls.appendChild(l);
    });

    document.getElementById('clearItemsBtn').onclick = () => {
      state.board.items = [];
      renderAll();
    };
    document.getElementById('clearAllBtn').onclick = () => {
      state.board.items = [];
      state.board.characters = [];
      state.selectedCharacterId = null;
      renderAll();
    };

    document.getElementById('solveBtn').onclick = () => {
      runSolve();
    };
  }

  function runSolve() {
    const iterations = Number(document.getElementById('iterationsInput').value);
    const seed = Number(document.getElementById('seedInput').value);
    const result = optimize({
      mode: state.mode,
      budget: state.budget,
      board: structuredClone(state.board),
      perks: structuredClone(state.perks),
      prices: effectivePrices(),
    }, { iterations, seed });

    state.board.items = result.board.items;
    const metrics = evaluateBoard({ board: state.board, perks: state.perks, prices: effectivePrices() });
    renderAll();

    solverOutputEl.textContent = JSON.stringify({
      satisfiedNeeds: metrics.satisfiedNeeds,
      multiplier: metrics.multiplier,
      spent: metrics.spent,
      activeItems: metrics.activeItems,
      globalCounts: metrics.globalCounts,
      items: state.board.items,
      diagnostics: metrics.diagnostics,
    }, null, 2);
  }

  function renderAll() {
    renderPalettes();
    renderBoard();
    renderCharacterEditor();
    renderControls();
  }

  renderAll();
})();
