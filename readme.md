# Party Planner Solver

Теперь проект разделен на **frontend (React)** и **backend (Python solver API)**.

## Архитектура

- `frontend/` — UI на React (без сборки, через CDN + Babel).
- `backend/solver.py` — движок оценки и оптимизации.
- `backend/server.py` — HTTP сервер, который:
  - отдает frontend статику,
  - предоставляет API `POST /api/evaluate` и `POST /api/solve`.

## Запуск

```bash
python3 backend/server.py
```

Открыть: `http://localhost:8000`

## Что реализовано

- Полная логика активации предметов (зависимости + perks).
- Подсчет локальных/глобальных нужд только по активным предметам.
- Режимы `unlimited` и `budgeted`.
- Оптимизация с учетом бюджета и tie-break по стоимости/количеству предметов.
- Диагностика удовлетворенных и неудовлетворенных нужд.
