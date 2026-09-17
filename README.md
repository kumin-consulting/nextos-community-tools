# NextOS community tools

Community-built tools for [NextOS](https://www.jonkum.in/nextos): apps, agents, skills, MCP servers, CLIs, templates and whole departments. One folder per tool, one `tool.json` each, and a generated `manifest.json` the NextOS website reads to publish a page for every tool at `https://www.jonkum.in/community/<slug>`.

## Add your tool

1. Fork this repository.
2. Copy `tools/_template` to `tools/<slug>` (lowercase letters, digits and single hyphens; this becomes the page address).
3. Fill in `tools/<slug>/tool.json` and write `tools/<slug>/README.md` (the long description on your page - plain Markdown, no raw HTML).
4. Run `npm test`, then `npm run build` and commit the regenerated `manifest.json`.
5. Open a pull request. The check on the pull request validates every tool and confirms the manifest is up to date.

Your page goes live within an hour of the merge.

## Why these fields

A tool folder carries more than a NextOS app manifest does, because a page on the open web has to earn its place in search results. The extra fields are the ones a search engine and a person skimming results read first:

| Field | Used for |
| --- | --- |
| `summary` | The page's meta description and the card in the listing (60 to 160 characters, one plain sentence). |
| `seo.title` | The browser tab and the search result title (up to 60 characters). Defaults to `<name> - <summary>`. |
| `seo.keywords` | `<meta name="keywords">` and the listing's search box. |
| `seo.ogImage` | The card shown when the page is shared. 1200 x 630. |
| `screenshots` | Shown on the page with their `alt` text; the first one is the share image when `seo.ogImage` is absent. |
| `faq` | Rendered on the page and published as FAQ structured data. |
| `publishedAt`, `updatedAt` | The page's dates and the sitemap's `lastmod`. Bump `updatedAt` whenever the tool changes. |
| `categories`, `tags` | Listing filters and related-tool links. |
| `install` | The exact way to get the tool: a command, a URL, or numbered steps. |

Every other field mirrors what NextOS already knows about a native app (`name`, `version`, `kind`, `author`, `repository`, `homepage`, `license`, `permissions`).

## Field reference

See [`schema/tool.schema.json`](schema/tool.schema.json) - it is the single source of truth, and `npm test` checks every tool against it.

## Rules

- Only tools that exist and work today. A page for vapourware is removed.
- `summary` and `README.md` describe what the tool does in plain words. No keyword stuffing; a page that reads like one is removed.
- Screenshots and share images must be yours to publish, and must live in this repository under `tools/<slug>/` or at an `https://` address you control.
- No secrets, tokens or personal data anywhere in a tool folder.
- Keep `updatedAt` honest: it drives the sitemap.

## Licence

The manifest format, scripts and this README are MIT. Each tool keeps its own licence, declared in its `tool.json`.
