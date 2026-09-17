# Contributing

Add a tool by pull request - see the README's "Add your tool". Every pull request runs `npm test` (schema validation of every `tools/*/tool.json`, slug and folder checks, README presence) and `npm run check-manifest` (the committed `manifest.json` must match a fresh build).

Changes to the schema itself must keep every existing tool valid, or update those tools in the same pull request.
