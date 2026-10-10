.PHONY: build preview publish deploy clean

node_modules: package-lock.json
	npm install
	@touch node_modules

build: node_modules
	npm run build

# watch + live reload on http://localhost:3000
preview: build
	node server.js

# npm publish (builds first)
publish: node_modules
	npm run release

# docs to GitHub Pages (builds first)
deploy: node_modules
	npm run deploy

clean:
	rm -rf dist
