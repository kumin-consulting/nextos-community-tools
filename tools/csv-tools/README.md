# CSV tools

A small [NextOS Extension](https://www.jonkum.in/nextos): open any `.csv` file as a sortable table, from Finder's context menu or straight in the Preview pane. Built as a reference for the four kinds of UI an extension can contribute - a context action, a file handler, a preview renderer, and the panel itself.

## Install it

In NextOS, open the App Store, add this repository as a source (see the root [README](https://github.com/kumin-consulting/nextos-community-tools#add-your-tool)), and install "CSV tools" - or open [jonkum.in/os?install=extension:csv-tools](https://www.jonkum.in/os?install=extension:csv-tools) and NextOS installs and approves it for you.

## What it contributes

- **A Finder context action**, "Open as table", on any `.csv` file.
- **A file handler**, so a `.csv` opens the table panel by default.
- **A preview renderer**, so Finder's Preview pane parses and shows the table instead of raw text.
- **One panel**, `panels/table.html` - a sandboxed webview rendering the parsed rows.

## What it asks for

One permission, `fs:read:home`, so its worker code (`extension/files/src/index.ts`) can read the file a panel or preview was opened for. It writes nothing and reaches no network.
