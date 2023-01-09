# live-tsc

A lightweight esbuild-based implementation of tsc that trim off the types (without type checking)

Intended to be used by ts-liveview

[![npm Package Version](https://img.shields.io/npm/v/live-tsc)](https://www.npmjs.com/package/live-tsc)

## Installation

```bash
npm i -D live-tsc
```

## Command Line Usage

Usage Example:

```bash
npx live-tsc \
  --watch \
  --project ../ts-liveview/tsconfig.json \
  --src     ../ts-liveview \
  --dest    ../ts-liveview/dist \
  --exclude ../ts-liveview/scripts \
  --exclude ../ts-liveview/public \
  --post-hook "npx fix-esm-import-path ../ts-liveview/dist/db/proxy.js"
```

Options:

```
  --src <dir|file>
    Specify the source directory/file
    Alias: -s

  --dest <dir|file>
    Specify the destination directory/file
    Alias: -d

  --exclude <dir|file>
    Specify the path to be excluded;
    Can be specified multiple times;
    The destination directory is excluded by default
    Alias: -e

  --project <file>
    Specify the path of tsconfig file
    Alias: -p

  --watch
    Watch for changes and rerun
    Alias: -w

  --post-hook <command>
    Add command to run after initial scan and subsequence updates;
    Can be specified multiple times;

  --help
    Show help message
    Alias: -h
```

## Why skip type checking?

This tool is intended to be used by the development server (potentially behind nodemon)

Running tsc on slow machine can takes some time.

Developers can get type checking errors from the editor in realtime.

It is a waste to do type checking twice on the cli and editor's language server.

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
