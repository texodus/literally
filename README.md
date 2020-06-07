
<img src="literally.png"></img>

![npm](https://img.shields.io/npm/v/literally-cli?color=brightgreen)

`literally` is a tool for literate programming in Javascript.  The `literally`
"compiler" is itself an example of literate programming, and this `README.md` is
its source.  You can install `literally` and use it to compile from markdown:

```bash
yarn add literally-cli
yarn literally my_literate_module.md
```

If you are developing/hacking on `literally` itself, you can build this
`README.md` on top of your local build's compiler (aliased to `yarn bootstrap`).
You'll need to run this command twice to _bootstrap_, or compile the
compiler with the compiler you just compiled.

```bash
./literally -o dist -n literally -f node README.md
./literally -o dist -n literally -f node README.md
```

## Environment

These node builtins:

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
```

## Command line interface

Re-use metadata from `package.json`.

```javascript
const PACKAGE = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json")).toString());
```

Uses [`commander`](https://github.com/tj/commander.js/) for the CLI.  We're
looking for an API something along the lines of
`literally [options] [inputs...]` which is exactly what `literally --help`
describes:


[bug](https://github.com/tj/commander.js/#avoiding-option-name-clashes)

```javascript
program
    .storeOptionsAsProperties(false)
    .passCommandToAction(false)
    .version(PACKAGE.version)
    .description(PACKAGE.description)
    .arguments("[inputs...]")
    .option("-o, --output <path>", "The output path to write result files to")
    .option("-n, --name <name>", "The asset name (`html` and `node` format only)")
    .option("-c, --config <path>", "The path for your literal config", (x) => x, "literally.config.js")
    .option("-c, --config <path>", "The path for your literal config", (x) => x, "literally.config.js")
    .option("-f, --format <format>", "Which output format to use:  block, node, html.")
    .option("-s, --screenshot", "Should screenshots be captured also? (`block` mode only`)")
    .option("--watch", "Compile continuously")
    .action(run_compiler);

setTimeout(() => program.parse(process.argv));
```

Options can also come from a config file - some can _only_ come from a config
file.

```javascript
function load_config(cmd) {
    let {config} = cmd;
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

There is only one task

```javascript

function run_compiler(cli_files) {
    const cmd = program.opts();
    const config = load_config(cmd);
    const files = cli_files.length > 0 ? cli_files : config.files;
    const output = cmd.output || config.output || process.cwd() + "/";
    const watch = cmd.watch || config.watch;
    const format = cmd.format || config.format || "html";
    const name = cmd.name || config.name;
    const screenshot = cmd.screenshot;
    const retartget = config.retarget || [];

    if (!files || !(files.length > 0)) {
        console.error("No input files!");
        return;
    }

    if (output.endsWith("/") && !fs.existsSync(output)) {
        fs.mkdirSync(output);
    }

    for (const term of files) {
        for (const file of glob.sync(path.join(process.cwd(), term))) {
            if (format === "html") {
                compile_to_html(file, output, name);
                if (watch) {
                    fs.watchFile(file, () => compile_to_html(file, output, name));
                }
            } else if (format === "node") {
                compile_to_node(file, output, name);
                if (watch) {
                    fs.watchFile(file, () => compile_to_node(file, output, name));
                }
            } else if (format === "block") {
                compile_to_blocks(file, output, name, retartget, screenshot);
                if (watch) {
                    fs.watchFile(file, () => compile_to_blocks(file, output, name, retartget, screenshot));
                }
            }
        }
    }
}
```

it has two formats

```javascript
function compile_to_html(file, output, name) {
    const path_prefix = path.join(output, name || path.parse(file).name);
    const md = fs.readFileSync(file).toString();
    const js = extract(md, "javascript");
    const css = extract(md, "css");
    const html = extract(md, "html");
    const final = template({html, js, css});
    fs.writeFileSync(`${path_prefix}.html`, final);
    console.log(`Literally compiled ${path_prefix}.html`);
}
```

```javascript
function compile_to_node(file, output, name) {
    const path_prefix = path.join(output, name || path.parse(file).name);
    const md = fs.readFileSync(file).toString();
    const js = extract(md, "javascript");
    const handlebars = extract(md, "handlebars");
    fs.writeFileSync(`${path_prefix}.js`, js);
    console.log(`Literally compiled ${path_prefix}.js`);
    if (handlebars.length > 0) {
        fs.writeFileSync(`${path_prefix}.handlebars`, handlebars);
        console.log(`Literally compiled ${path_prefix}.handlebars`);
    }
}
```

```javascript
function retarget() {}
async function compile_to_blocks(file, output, name, retarget, is_screenshot) {
    let md = fs.readFileSync(file).toString();
    for (const {rule, value} of retarget) {
        md = md.replace(new RegExp(rule, "gm"), value);
    }
    const js = extract(md, "javascript");
    const css = extract(md, "css");
    const html = extract(md, "html");
    const block = extract(md, "block");
    const final = template({html, js, css});
    fs.writeFileSync(path.join(output, "index.html"), final);
    console.log(`Literally compiled ${path.join(output, "index.html")}`);
    if (block.length > 0) {
        fs.writeFileSync(path.join(output, ".block"), block);
        console.log(`Literally compiled ${path.join(output, ".block")}`);
    }
    fs.writeFileSync(path.join(output, "README.md"), blocks_markdown(md));
    console.log(`Literally compiled ${path.join(output, "README.md")}`);
    if (is_screenshot) {
        await screenshot(output, name);
    }
}
```

## Screenshots

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
    await page.screenshot({
        //  fullPage: true,
        path: path.join(output, "preview.png"),
    });
    console.log(`Captured preview.png`);
    sharp(path.join(output, "preview.png")).resize(230, 120).toFile(path.join(output, "thumbnail.png"));
    console.log(`Captured thumbnail.png`);
    server.close();

    await browser.close();
}
```

## Markdown

We'll need some helpers for dealing with markdown

```javascript
function extract(src, lang) {
    let output = marked_ast.parse(src);
    let js = [];
    for (const section of output) {
        if (section.type === "code" && section.lang === lang) {
            js.push(section.code);
        }
    }
    return js.join("\n\n");
}
```

Clean markdown to `bl.ocks` format

```javascript
function blocks_markdown(txt) {
    const ast = marked_ast.parse(txt);
    for (const section of ast) {
        if (section.type === "paragraph") {
            section.text = section.text.map((x) => (x.replace ? x.replace(/\n/gm, " ") : x));
        }
    }

    return marked_ast_markdown.toMarkdown(ast);
}
```

## HTML

`literally` supports [handlerbars]() templates and renders to either a file
`${name}.handlebars` when format is `node`, or a script tag with type
`text/handlebars` otherwise.  This is the template for `html` format:

```handlebars
<!DOCTYPE html>
<html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
        {{#if css}}
        <style>
            {{{indent css}}}
        </style>
        {{/if}}
    </head>
    <body>
        {{#if html}}

        {{{indent html}}}

        {{/if}}
        {{#if js}}
        <script>
            {{{indent js}}}
        </script>
        {{/if}}
    </body>
</html>
```

Since this is a node script, it can be read back into Javascript by file name.
`literally` doesn't currently support parameterization for this name, so be
sure to take into account your compiler settings - in this case the template
name is `literally.handlerbars` and it lives parallel to the executing module.

```javascript
const template_path = path.join(__dirname, "literally.handlebars");
```

The `template()` function itself is created statically from `handlebars`

```javascript
const template_src = fs.readFileSync(template_path).toString();
const template = handlebars.compile(template_src);
```

The `literally.handlebars` template has a custom helper, `indent()`, which
keeps blocks at the proper indentation using the parse state from `handlebars`.

```javascript
function indent(txt, data) {
    const spaces = data.loc.start.column;
    return txt
        .split("\n")
        .map((line) => line.padStart(line.length + spaces, " "))
        .join("\n")
        .trimStart();
}
```

This functio has to be registered with `handlebars.registerHelper()` to be
visible to the template.

```javascript
handlebars.registerHelper("indent", indent);
```

# Appendix

```block
license: MIT
```