from __future__ import annotations

from random import Random
from typing import Dict, List, Tuple, Any

BOARD_SIZE = 6
ITEM_TYPES = [
    "beer",
    "liquor",
    "keg",
    "food",
    "snacks",
    "decor",
    "speakers",
    "drugs",
    "girls",
    "guys",
    "cups",
    "trashcans",
    "music",
]

ACTIVATION_DEPENDENCIES = {
    "beer": "cups",
    "liquor": "cups",
    "keg": "cups",
    "food": "trashcans",
    "snacks": "trashcans",
    "speakers": "music",
}
ACTIVATION_PERKS = {
    "beerNoCups": "beer",
    "liquorNoCups": "liquor",
    "foodNoTrashcan": "food",
}


def neighbors(x: int, y: int) -> List[Tuple[int, int]]:
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx, ny = x + dx, y + dy
            if 0 <= nx < BOARD_SIZE and 0 <= ny < BOARD_SIZE:
                out.append((nx, ny))
    return out


def dependency_for(item_type: str, activation_perks: Dict[str, bool]) -> str | None:
    dep = ACTIVATION_DEPENDENCIES.get(item_type)
    if not dep:
        return None
    for perk_name, perk_type in ACTIVATION_PERKS.items():
        if perk_type == item_type and activation_perks.get(perk_name):
            return None
    return dep


def evaluate(payload: Dict[str, Any]) -> Dict[str, Any]:
    board = payload["board"]
    prices = payload.get("prices", {})
    perks = payload.get("perks", {})
    activation_perks = perks.get("activation", {})

    items = {(it["x"], it["y"]): it for it in board.get("items", [])}
    active = {}
    global_counts = {t: 0 for t in ITEM_TYPES}

    for it in board.get("items", []):
        dep = dependency_for(it["type"], activation_perks)
        is_active = True
        if dep:
            is_active = any(items.get((nx, ny), {}).get("type") == dep for nx, ny in neighbors(it["x"], it["y"]))
        active[(it["x"], it["y"])] = is_active
        if is_active:
            global_counts[it["type"]] += 1

    satisfied = 0
    diagnostics = []
    for ch in board.get("characters", []):
        local_diag = []
        for need in ch.get("localNeeds", []):
            count = 0
            for nx, ny in neighbors(ch["x"], ch["y"]):
                it = items.get((nx, ny))
                if it and it["type"] == need["type"] and active.get((nx, ny), False):
                    count += 1
            ok = count >= int(need["required"])
            satisfied += int(ok)
            local_diag.append({**need, "count": count, "satisfied": ok})

        g = ch["globalNeed"]
        g_count = global_counts.get(g["type"], 0)
        ok = g_count == int(g["required"]) if g["operator"] == "eq" else g_count >= int(g["required"])
        satisfied += int(ok)
        diagnostics.append({"characterId": ch["id"], "local": local_diag, "global": {**g, "count": g_count, "satisfied": ok}})

    spent = sum(prices.get(it["type"], 0) for it in board.get("items", []))
    return {
        "satisfiedNeeds": satisfied,
        "multiplier": 1.0 + 0.25 * satisfied,
        "spent": spent,
        "globalCounts": global_counts,
        "activeItems": sum(1 for it in board.get("items", []) if active.get((it["x"], it["y"]), False)),
        "activeByCell": {f"{x},{y}": v for (x, y), v in active.items()},
        "diagnostics": diagnostics,
    }


def optimize(payload: Dict[str, Any]) -> Dict[str, Any]:
    mode = payload.get("mode", "unlimited")
    budget = payload.get("budget", 0)
    prices = payload.get("prices", {})
    iterations = int(payload.get("iterations", 5000))
    rnd = Random(int(payload.get("seed", 1234)))

    current = {
        "board": payload["board"],
        "perks": payload.get("perks", {}),
        "prices": prices,
    }
    current_eval = evaluate(current)
    best = {"board": {"characters": [*current["board"]["characters"]], "items": [*current["board"]["items"]]}, "perks": current["perks"], "prices": prices}
    best_eval = current_eval

    candidate_types = {"cups", "trashcans", "music"}
    for ch in current["board"]["characters"]:
        candidate_types.update(n["type"] for n in ch["localNeeds"])
        candidate_types.add(ch["globalNeed"]["type"])
    candidate_types = [t for t in candidate_types if t]

    def clone_state(st: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "board": {
                "characters": [dict(c) | {"localNeeds": [dict(n) for n in c["localNeeds"]], "globalNeed": dict(c["globalNeed"])} for c in st["board"]["characters"]],
                "items": [dict(it) for it in st["board"]["items"]],
            },
            "perks": st["perks"],
            "prices": st["prices"],
        }

    def score(ev: Dict[str, Any], item_count: int) -> Tuple[int, int, int]:
        return (ev["satisfiedNeeds"], -ev["spent"], -item_count)

    for _ in range(iterations):
        nxt = clone_state(current)
        items = nxt["board"]["items"]
        op = rnd.random()
        if op < 0.34 and items:
            items.pop(rnd.randrange(len(items)))
        elif op < 0.68:
            occupied = {(c["x"], c["y"]) for c in nxt["board"]["characters"]} | {(i["x"], i["y"]) for i in items}
            free = [(x, y) for y in range(BOARD_SIZE) for x in range(BOARD_SIZE) if (x, y) not in occupied]
            if free:
                x, y = free[rnd.randrange(len(free))]
                items.append({"id": f"it-{rnd.random()}", "x": x, "y": y, "type": candidate_types[rnd.randrange(len(candidate_types))]})
        elif items:
            idx = rnd.randrange(len(items))
            if rnd.random() < 0.5:
                items[idx]["type"] = candidate_types[rnd.randrange(len(candidate_types))]
            else:
                occupied = {(c["x"], c["y"]) for c in nxt["board"]["characters"]} | {(i["x"], i["y"]) for j, i in enumerate(items) if j != idx}
                free = [(x, y) for y in range(BOARD_SIZE) for x in range(BOARD_SIZE) if (x, y) not in occupied]
                if free:
                    items[idx]["x"], items[idx]["y"] = free[rnd.randrange(len(free))]

        nxt_eval = evaluate(nxt)
        if mode == "budgeted" and nxt_eval["spent"] > budget:
            continue

        if score(nxt_eval, len(items)) > score(current_eval, len(current["board"]["items"])) or rnd.random() < 0.08:
            current, current_eval = nxt, nxt_eval
        if score(nxt_eval, len(items)) > score(best_eval, len(best["board"]["items"])):
            best, best_eval = clone_state(nxt), nxt_eval

    return {"board": best["board"], "metrics": best_eval}
