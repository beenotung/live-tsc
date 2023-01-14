# live-tsc

A lightweight esbuild-based implementation of tsc that trim off the types (without type checking)

Intended to be used by [ts-liveview](https://github.com/beenotung/ts-liveview) but it should be generic enough as an alternative to "tsc --watch"

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
  --src     ./ \
  --dest    ./dist \
  --exclude ./scripts \
  --exclude ./public \
  --exclude ./data \
  --exclude ./db/data \
  --post-hook "npx fix-esm-import-path dist/db/proxy.js" \
  --server  ./dist/server/index.js \
  --open "https://localhost:8100"
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
    Default: tsconfig.json

  --watch
    Watch for changes and rerun
    Alias: -w

  --format <cjs|esm|iife>
    Sets the output format for the generated JavaScript files
    Alias: -f
    Default: esm

  --post-hook <command>
    Add command to run after initial scan and subsequence updates;
    Can be specified multiple times;

  --server <file>
    Specify the path of server js file

  --cwd <dir>
    Specify the current working directory for the server and postHooks
    Alias: -c
    Default: sample as process.cwd

  --open <url>
    Open the url in the default browser after initial scanning
    Alias: -o

  --help
    Show help message
    Alias: -h
```

## Why skip type checking?

This tool is intended to be used by the development server (potentially behind nodemon)

Running tsc on slow machine can takes some time.

Developers can get type checking error messages from the editor in realtime, so skipping type check on the build-flow should speed up iteration cycle without compromise.

It is a waste to do type checking twice in the cli build watcher and editor's language server.

## Speed Comparison

Tested with ts-liveview v5

### Environments

**Env [1]**:

- archlinux Desktop
- btrfs on HDD

**Env [2]**:

- Mac mini (2014)
- 2.6 GHz Dual-Core Intel i5
- Macintosh HD (1TB SATA Disk)

**Env [3]**:

- Kudu3 laptop
- archlinux
- 6th Gen 2.6 GHz 4 Core Intel i7
- zfs on top of lvm

### Run Type

**Fresh Build**:
Removed the outDir before run

**Incremental Build**:
Keep the outDir from previous run

### Comparison

| Env | Tool     | Fresh Build | Incremental Build | Improvement |
| --- | -------- | ----------- | ----------------- | ----------- |
| [1] | tsc      | ?           | 4.3s              | ?           |
| [1] | live-tsc | ?           | 0.1s              | ?           |
| [2] | tsc      | 11.2s       | 2.8s              | 4x          |
| [2] | live-tsc | 0.36s       | 0.22s             | 1.6x        |
| [3] | tsc      | 3.2s        | 1.9s              | 1.6x        |
| [3] | live-tsc | 0.152s      | 0.148s            | 1.02        |

| Env | Fresh bulid Speedup Rate | Incremtntal Build Speedup Rate |
| --- | ------------------------ | ------------------------------ |
| [2] | 31x                      | 12x                            |
| [3] | 21x                      | 12x                            |

The time used is the average of multiple runs. In practice, the cold-start run time of fresh build is much longer if the Typescript files are not already cached by the OS.

You can run the speed test on your machine by running `npx ts-node src/test/measure-speed.ts`

## Todo

The watch mode seems not working on mac mini, maybe use polling as fallback.

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
