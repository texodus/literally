# Literally
`literally` is a tool for literate programming in Javascript.  The `literally`
"compiler" is itself an example of literate programming, and this `README.md` is
its source.  You can install `literally` and use it to compile from markdown:

```bash
yarn add literally
yarn literally my_literate_module.md
```

If you are developing/hacking on `literally` itself, you can build this
`README.md` on top of your local build's compiler (aliased to `yarn build`).
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
//const {toMarkdown} = require("marked-ast-markdown");
const program = require("commander");
const glob = require("glob");
const handlebars = require("handlebars");
```

## Command line interface

Re-use metadata from `package.json`.

```javascript
const PACKAGE = JSON.parse(fs.readFileSync("package.json").toString());
```

Uses `commander`.

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
    .option("-f, --format <format>", "Which output format to use:  blocks, node.", /^(blocks|node|html)$/i, "html")
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
    const format = cmd.format || config.format;
    const name = cmd.name || config.name;

    if (!files || !(files.length > 0)) {
        console.error("No input files!");
        return;
    }

    if (output.endsWith("/") && !fs.existsSync(output)) {
        fs.mkdirSync(output);
    }

    for (const term of files) {
        for (const file of glob.sync(path.join(process.cwd(), term))) {
            const path_prefix = path.join(output, name || path.parse(file).name);
            if (format === "html") {
                compile_to_html(file, path_prefix);
                if (watch) {
                    fs.watchFile(file, () => compile_to_html(file, path_prefix));
                }
            } else if (format === "node") {
                compile_to_node(file, path_prefix);
                if (watch) {
                    fs.watchFile(file, () => compile_to_node(file, path_prefix));
                }
            } else if (format === "blocks") {
                compile_to_blocks(file, path_prefix);
                if (watch) {
                    fs.watchFile(file, () => compile_to_blocks(file, path_prefix));
                }
            }
        }
    }
}
```

it has two formats

```javascript
function compile_to_html(name, path_prefix) {
    const file = fs.readFileSync(name).toString();
    const js = extract(file, "javascript");
    const css = extract(file, "css");
    const html = extract(file, "html");
    const final = template({html, js, css});
    fs.writeFileSync(`${path_prefix}.html`, final);
    console.log(`Compiled ${path_prefix}.html`);
}
```

```javascript
function compile_to_node(name, path_prefix) {
    const file = fs.readFileSync(name).toString();
    const js = extract(file, "javascript");
    const handlebars = extract(file, "handlebars");
    fs.writeFileSync(`${path_prefix}.js`, js);
    console.log(`Compiled ${path_prefix}.js`);
    fs.writeFileSync(`${path_prefix}.handlebars`, handlebars);
    console.log(`Compiled ${path_prefix}.handlebars`);
}
```

```javascript
async function capture_screenshot(output) {
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch();
    const page = await brower.newPage();
    page.goto("http://localhost:8080/examples/perspective.html");
    const screenshot = await page.screenshot();
}
```

```javascript
function compile_to_blocks(name, output) {
    compile_to_html(name, output);
    capture_screenshot(output);
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

## bl.ocks

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
