.PHONY: dev build typecheck clean deploy

dev:
	pnpm dev

build:
	pnpm build

typecheck:
	pnpm typecheck

clean:
	rm -rf dist
