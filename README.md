<img src="https://raw.githubusercontent.com/texodus/literally/master/literally.png"></img>

![npm](https://img.shields.io/npm/v/literally-cli?color=brightgreen)
[![Build Status](https://travis-ci.org/texodus/literally.svg?branch=master)](https://travis-ci.org/texodus/literally)

`literally` is a tool for literate programming in Javascript, the source code
for which you are _literally_ reading right now.  Given a
Markdown input file with various `javascript`, `css`, `html`,
`handlebars` or `block` code sections throughout (such as this `README.md`),
`literally` will extract, clean and generate assets for each, with a few
project template formats to choose from. 

It is particularly well-suited for
creating literate examples for Browser libraries, and has a dedicated project
template for [bl.ocks](https://bl.ocks.org/), which will also generate a clean
README.md from the source itself, as well as take thumbnail screenshots via
`puppeteer`.  For local development, you can switch to `html` format to
generate debug-able Source Maps to the original Markdown.  All in all,
`literally` can generate:

* `.js`
* `.js.map` source maps to Markdown
* `.css`
* `.html`
* `.md` cleaned Markdown
* `.block` bl.ocks metadata
* `preview.png` and `thumbnail.png` screenshots via `puppeteer`.

The `literally` "compiler" is itself an example of literate programming, and
this `README.md` is its source.  What follows begins as documentation, but
gradually incorporates the implementation itself, and is organized in sections:

- [Installation](#installation)
- [Development and Bootstrapping](#development-and-bootstrapping)
- [Command Line Interface](#command-line-interface)
  - [`commonjs` Format](#commonjs-format)
  - [`inline-html` Format](#inline-html-format)
  - [`html` Format](#html-format)
  - [`block` Format](#block-format)
- [Markdown Parsing](#markdown-parsing)
- [Javascript and Source Maps](#javascript-and-source-maps)
- [Handlebars](#handlebars)
- [Screenshots](#screenshots)
- [Appendix (Utilities)](#appendix-utilities)
- [Appendix (Imports)](#appendix-imports)
- [Appendix (Metadata)](#appendix-metadata)
# Installation

You can add `literally` to your project via `yarn`:

```bash
yarn add literally-cli
```

Next, using the `literally` script, compile markdown to a HTML templated with
the source's extracted CSS, Javascript and HTML blocks.

```bash
yarn literally my_literate_module.md
```

You should now have a `my_literate_module.html` file in your working directory,
with the original markdown source's CSS, Javascript and HTML blocks inlined
in their proper locations.  This is the default output format, `inline-html`,
but literally has several other output formats available via the `--format`
flag.

# Development and Bootstrapping

If you are developing/hacking on `literally` itself, you can build this
`README.md` locally, using the `yarn`-installed copy `/node_modules/literally`
(yes, `literally` is in its own `package.json`'s `"devDependencies"`):

```bash
yarn build
```

Once built, you can run your locally-built `literally` compiler:

```bash
yarn literally-dev
```

For example, to _bootstrap_ the compiler by compiling itself (this `README.md`):

```bash
yarn literally-dev --output dist --name literally --format commonjs README.md
```

# Command Line Interface

`literally` uses [`commander`](https://github.com/tj/commander.js/) for its
Command Line Interface.  We're looking for an API something along the lines of
`literally [options] [inputs...]` which is exactly what `literally --help`
describes.  The `commander` API is quite declarative and documents itself well
(though a [name clash](https://github.com/tj/commander.js/#avoiding-option-name-clashes)
requires we pass some esoteric options):

```javascript
function init_cli() {
    const pkg = get_package();
    program
        .storeOptionsAsProperties(false)
        .passCommandToAction(false)
        .version(pkg.version)
        .description(pkg.description);

    program
        .arguments("[inputs...]")
        .option(
            "-o, --output <path>",
            "The output path to write result files to"
        )
        .option(
            "-n, --name <name>",
            "The asset name (`html` and `commonjs` format only)"
        )
        .option(
            "-c, --config <path>",
            "The path for your literal config, defaults to literally.config.js"
        )
        .option(
            "-f, --format <format>",
            "Which output format to use:  block, commonjs, html."
        )
        .option(
            "-s, --screenshot",
            "Should screenshots be captured also? (`block` mode only`)"
        )
        .option("--watch", "Compile continuously")
        .action(run_compiler);

    program.parse(process.argv);
}

setTimeout(init_cli);
```

Options can also come from a config file - some can _only_ come from a config
file.

```javascript
function load_config(cmd) {
    let {config = "literally.config.js"} = cmd;
    if (!config.startsWith("/")) {
        config = path.join(process.cwd(), config);
    }
    try {
        return require(config);
    } catch (e) {
        return {};
    }
}
```

An example config file in JSON format, which uses the config file _only_
`retarget` parameter to map dependencies in `node_modules` to their 
[JSDelivr](https://jsdelivr.com) counterparts instead:

```json
{
    "files": ["*.md"],
    "output": "dist/",
    "format": "blocks",
    "retarget": [
        {
            "rule": "node_modules", 
            "value": "https://cdn.jsdelivr.net/npm/"
        }
    ]
}
```

The CLI and config file parameters are merged and then iterated over, creating
compiled assets from the resulting `"files"`:

```javascript
function run_compiler(cli_files) {
    const cmd = program.opts();
    const config = load_config(cmd);
    const files = cli_files.length > 0 ? cli_files : config.files;
    const output = cmd.output || config.output || process.cwd() + "/";
    const watch = cmd.watch || config.watch;
    const format = cmd.format || config.format || "inline-html";
    const name = cmd.name || config.name;
    const screenshot = cmd.screenshot || config.screenshot;
    const retartget = config.retarget || [];
    if (!files || !(files.length > 0)) {
        console.error("No input files!");
        return;
    }

    if (!fs.existsSync(output)) {
        fs.mkdirSync(output, {recursive: true});
    }

    for (const term of files) {
        for (const file of glob.sync(path.join(process.cwd(), term))) {
            const compiler = COMPILERS[format];
            compiler(watch, file, output, name, retartget, screenshot);
        }
    }
}
```

These formats are availble for output:

```javascript
const COMPILERS = {
    js: runwatch.bind(compile_to_js),
    html: runwatch.bind(compile_to_html),
    "inline-html": runwatch.bind(compile_to_inlinehtml),
    block: runwatch.bind(compile_to_blocks),
};
```


## `js` Format

```javascript
function compile_to_js(file, output, name) {
    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const path_prefix = path.join(output, out_name);
    const md = fs.readFileSync(file).toString();
    const {javascript, handlebars, css, sourcemap} = extract(
        md_name,
        out_name,
        md
    );

    if (javascript && javascript.length > 0) {
        write_asset(`${path_prefix}.js`, javascript || "");
        write_asset(`${path_prefix}.js.map`, sourcemap || "");
    }

    if (css && css.length > 0) {
        write_asset(`${path_prefix}.css`, css);
    }

    if (handlebars.length > 0) {
        write_asset(`${path_prefix}.handlebars`, handlebars);
    }
}
```

## `inline-html` Format

```javascript
function compile_to_inlinehtml(file, output, name) {
    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const path_prefix = path.join(output, out_name);
    const md = fs.readFileSync(file).toString();
    const {javascript, css, html} = extract(md_name, out_name, md);
    const final = template({html, javascript, css});
    write_asset(`${path_prefix}.html`, final);
}
```

## `html` Format

```javascript
function compile_to_html(file, output, name) {
    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const path_prefix = path.join(output, out_name);
    const md = fs.readFileSync(file).toString();
    let {javascript, sourcemap, css, html} = extract(md_name, out_name, md);
    if (javascript && javascript.length > 0) {
        write_asset(`${path_prefix}.js`, javascript || "");
        write_asset(`${path_prefix}.js.map`, sourcemap || "");
    }

    if (css && css.length > 0) {
        write_asset(`${path_prefix}.css`, css);
    }

    const final = template({
        html,
        src: javascript && javascript.length > 0 && `${out_name}.js`,
        href: css && css.length > 0 && `${out_name}.css`,
    });

    write_asset(`${path_prefix}.html`, final);
}
```

## `block` Format

[`https://bl.ocks.org`](https://bl.ocks.org)

```javascript
async function compile_to_blocks(file, output, name, retarget, is_screenshot) {
    let md = fs.readFileSync(file).toString();
    for (const {rule, value} of retarget) {
        md = md.replace(new RegExp(rule, "gm"), value);
    }

    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const parsed = extract(md_name, out_name, md, true);
    const {javascript, css, html, block, markdown} = parsed;
    const final = template({
        html,
        src: javascript && javascript.length > 0 && `index.js`,
        href: css && css.length > 0 && `index.css`,
    });

    write_asset(path.join(output, "index.html"), final);

    if (block && block.length > 0) {
        write_asset(path.join(output, ".block"), block);
    }

    if (javascript && javascript.length > 0) {
        write_asset(path.join(output, "index.js"), javascript);
    }

    if (css && css.length > 0) {
        write_asset(path.join(output, "index.css"), css);
    }

    write_asset(path.join(output, "README.md"), markdown);
    if (is_screenshot) {
        await screenshot(output, out_name);
    }
}
```

# Markdown Parsing

We'll need some helpers for dealing with markdown

```javascript
function extract(md_name, out_name, src, is_blocks = false) {
    let ast = marked_ast.parse(src);
    const blocks = {markdown: "", javascript: []};

    for (const index in ast) {
        const section = ast[index];
        blocks[section.lang] = blocks[section.lang] || "";
        if (section.lang === "javascript") {
            let node;
            for (node of extract_js(blocks, md_name, section)) {
                blocks.javascript.push(node);
            }
            if (node) {
                node.add("\n");
            }
        } else if (section.type === "code") {
            blocks[section.lang] += section.code + "\n\n";
        } else if (section.type === "paragraph" && is_blocks) {
            section.text = section.text.map((x) =>
                x.replace ? x.replace(/\n/gm, " ") : x
            );
        }
        const clean_md = marked_ast_markdown.writeNode(section, index, ast);
        blocks.markdown += clean_md.trim() + "\n\n";
    }

    return extract_sourcemap(md_name, out_name, blocks);
}
```

# Javascript and Source Maps

Javascript requires special handling to support source maps - they need the
original Markdown so the generated Javascript can be annotated with it's
source for debugging.  The `source-map` module makes this pretty
straightforward, though unfortunately since we do not actually parse the input
Javascript, we are restricted to line granularity, which interferes somewhat
with Chrome's inter-line debugging.

```javascript
function extract_sourcemap(md_name, out_name, blocks) {
    const {javascript, markdown} = blocks;
    const sm = new sourceMap.SourceNode(1, 1, `${md_name}.md`, javascript);
    sm.setSourceContent(`${md_name}.md`, markdown);
    const {code, map} = sm.toStringWithSourceMap({file: `${out_name}.js`});
    const output_js = babel.transformSync(code, get_babel_options(map));
    return {
        ...blocks,
        javascript: module_template(out_name, output_js.code),
        sourcemap: JSON.stringify(output_js.map),
    };
}

function* extract_js(blocks, md_name, section) {
    let ln = blocks.markdown.split("\n").length + 1;
    for (const line of section.code.split("\n")) {
        if (line.length > 0) {
            yield new sourceMap.SourceNode(ln, 1, `${md_name}.md`, line + "\n");
        }
        ln++;
    }
}
```

We'd like to use `babel` to use features like ES-modules transparently, but
without imposing our own babel config on a user's project;  for this we can use
[`'loadPartialConfig()`](https://babeljs.io/docs/en/babel-core#loadpartialconfig)
from the `babel` API.

```javascript
function get_babel_options(map) {
    return Object.assign(babel.loadPartialConfig().options, {
        inputSourceMap: map,
        sourceMaps: true,
    });
}
```

We'll also need to manually append the `sourceMappingURL` trailing comment, for
`bl.ocks` and local testing where the resulting `literally` JavaScript output is
used directly in the browser (_sans_-webpack)well as set the ).

```javascript
function module_template(out_name, src) {
    return `${src}\n//# sourceMappingURL=${out_name}.js.map`;
}
```

# Handlebars

`literally` supports [handlerbars]() templates and renders to either a file
`${name}.handlebars` when format is `commonjs`, or a script tag with type
`text/handlebars` otherwise.  In fact, `literally` itself uses such a template
for its own `html` output formats:

```handlebars
<!DOCTYPE html>
<html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
    </head>
    <body>
        {{#if html}}

        {{{indent html}}}

        {{/if}}
        {{#if css}}
        <style>
            {{{indent css}}}
        </style>
        {{/if}}
        {{#if href}}
        <link rel="stylesheet" href="{{{href}}}">
        {{/if}}
        {{#if javascript}}
        <script type="module">
            {{{indent javascript}}}
        </script>
        {{/if}}
        {{#if src}}
        <script type="module" src="{{{src}}}"></script>
        {{/if}}
    </body>
</html>
```

Since this is a node.js script, it can be read back into Javascript by file name.
`literally` doesn't currently support parameterization for this name, so be
sure to take into account your compiler settings - in this case the template
name is `literally.handlerbars` and it lives parallel to the executing module.
The `template()` function itself is created statically from the `handlebars`
module:

```javascript
function template(...args) {
    const template_path = path.join(__dirname, "literally.handlebars");
    const template_src = fs.readFileSync(template_path).toString();
    handlebars.registerHelper("indent", indent);
    return handlebars.compile(template_src)(...args);
}
```

The `literally.handlebars` template has a custom helper, `indent()`, which
keeps blocks at the proper indentation using the parse state from `handlebars`.
This function has to be registered with `handlebars.registerHelper()` to be
visible to the template.

```javascript
function indent(txt, data) {
    const spaces = data.loc.start.column;
    return txt
        .trim()
        .split("\n")
        .map((line) => line.padStart(line.length + spaces, " "))
        .join("\n")
        .trimStart();
}
```

# Screenshots

The `block` format supports taking screenshots of your built app via `puppeteer`,
using the `--screenshot` CLI flag.  This feature requires `peerDependencies` of
`puppeteer` and `http-server`; feel free to skip these if you are not planning
on generating `bl.ocks` output.

```javascript
async function screenshot(output, name) {
    const {createServer} = require("http-server");
    const sharp = require("sharp");
    const server = createServer({root: process.cwd()});
    server.listen();
    const port = server.server.address().port;
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({width: 960, height: 500});
    await page.goto(`http://localhost:${port}/${output}/index.html`);
    //await page.waitForNavigation({waitUntil: "networkidle2"});
    await page.waitFor(1000);
    await page.screenshot({path: path.join(output, "preview.png")});
    log_asset(`preview.png`, undefined, output);
    await sharp(path.join(output, "preview.png"))
        .resize(230, 120)
        .toFile(path.join(output, "thumbnail.png"));
    log_asset(`thumbnail.png`, undefined, output);
    server.close();

    await browser.close();
}
```

# Appendix (Utilities)

Write to disk:

```javascript
const num_formatter = new Intl.NumberFormat("en-us", {
    style: "decimal",
    maximumFractionDigits: 2,
});

function log_asset(name, asset, output) {
    let size = asset
        ? Buffer.byteLength(asset, "utf8")
        : fs.statSync(path.join(output, name)).size;
    size = num_formatter.format(size / 1024);
    console.log(
        chalk`{italic literally} compiled {green ${name}}  {yellow ${size} KB}`
    );
}

function write_asset(name, asset) {
    fs.writeFileSync(name, asset);
    log_asset(name, asset);
}
```

Run-and-watch a compile command.

```javascript
function runwatch(watch, file, ...args) {
    this(file, ...args);
    if (watch) {
        fs.watchFile(file, () => this(file, ...args));
    }
}
```

Re-use metadata from `package.json`.

```javascript
function get_package() {
    const pkg_path = path.join(__dirname, "../package.json");
    return JSON.parse(fs.readFileSync(pkg_path).toString());
}
```

# Appendix (Imports)

These node.js builtins:

```javascript
const fs = require("fs");
const path = require("path");
```

These dependencies from `package.json`:

```javascript
const marked_ast = require("marked-ast");
const marked_ast_markdown = require("marked-ast-markdown");
const program = require("commander");
const glob = require("glob");
const handlebars = require("handlebars");
const sourceMap = require("source-map");
const chalk = require("chalk");
const babel = require("@babel/core");
```

# Appendix (Metadata)

```block
license: MIT
```

