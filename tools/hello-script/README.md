# Hello script

The smallest possible [NextOS Script](https://www.jonkum.in/nextos): one command, one permission, one file. Run it and it writes a timestamped note to `~/Notes/hello.md` and shows a notification. It exists as a reference for writing your own - copy `script/files/src/index.ts` and go from there.

## Install it

In NextOS, open the App Store, add this repository as a source (see the root [README](https://github.com/kumin-consulting/nextos-community-tools#add-your-tool)), and install "Hello script" - or open [jonkum.in/os?install=script:hello-script](https://www.jonkum.in/os?install=script:hello-script) and NextOS installs and approves it for you.

## What it asks for

One permission, `fs:write:~/Notes`, so it can write the note - nothing else. It calls no tools and reaches no network.

## The trigger

A `command` trigger, bound to `Mod+Shift+H` and also reachable from the command bar and the Scripts app's Run button. See `script/files/script.json` for the manifest and `script/files/src/index.ts` for the whole script - about a dozen lines.
