.PHONY: dev build typecheck lint format format-check clean deploy

dev:
	pnpm dev

build:
	pnpm build

typecheck:
	pnpm typecheck

lint:
	pnpm lint

format:
	pnpm format

format-check:
	pnpm format:check

clean:
	rm -rf dist
