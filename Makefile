install:
	pip install -e .[all]
	pip install -r requirements.txt
	pip install -r docs/requirements.txt
	pip install -r tests/requirements.txt

doc: build-doc

build-doc:
	sphinx-build -W --color -c docs/ -b html docs/ _build/html

serve-doc:
	sphinx-serve

update-doc: build-doc serve-doc

# ── Development ───────────────────────────────────────────

front:
	cd freemace/ui && npm run dev

back:
	(. ./.venv/bin/activate && uv pip install -e .)
	.venv/bin/uvicorn freemace.server:create_app --factory --reload --host 0.0.0.0 --port 5002

# ── Build ─────────────────────────────────────────────────

build-ui:
	cd freemace/ui && npm ci && VITE_API_URL= npx vite build --outDir ../server/static

build-wheel: build-ui
	python -m build

build: build-wheel

clean:
	rm -rf freemace/server/static dist build *.egg-info

# ── Alembic ───────────────────────────────────────────────

alembic_gen:
	cd freemace/alembic && alembic revision -m "create account table"

alembic-autogen:
	cd freemace/alembic && alembic revision --autogenerate -m "makefile"

alembic-update:
	cd freemace/alembic && alembic upgrade head
