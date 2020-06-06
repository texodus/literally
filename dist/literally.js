const fs = require("fs");
const path = require("path");

const marked_ast = require("marked-ast");
const marked_ast_markdown = require("marked-ast-markdown");
const program = require("commander");
const glob = require("glob");
const handlebars = require("handlebars");

const PACKAGE = JSON.parse(fs.readFileSync("package.json").toString());

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
    .option("--watch", "Compile continuously")
    .action(run_compiler);

setTimeout(() => program.parse(process.argv));

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


function run_compiler(cli_files) {
    const cmd = program.opts();
    const config = load_config(cmd);
    const files = cli_files.length > 0 ? cli_files : config.files;
    const output = cmd.output || config.output || process.cwd() + "/";
    const watch = cmd.watch || config.watch;
    const format = cmd.format || config.format || "html";
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
                compile_to_blocks(file, output, name);
                if (watch) {
                    fs.watchFile(file, () => compile_to_blocks(file, output, name));
                }
            }
        }
    }
}

function compile_to_html(file, output, name) {
    const path_prefix = path.join(output, name || path.parse(file).name);
    const md = fs.readFileSync(file).toString();
    const js = extract(md, "javascript");
    const css = extract(md, "css");
    const html = extract(md, "html");
    const final = template({html, js, css});
    fs.writeFileSync(`${path_prefix}.html`, final);
    console.log(`Compiled ${path_prefix}.html`);
}

function compile_to_node(file, output, name) {
    const path_prefix = path.join(output, name || path.parse(file).name);
    const md = fs.readFileSync(file).toString();
    const js = extract(md, "javascript");
    const handlebars = extract(md, "handlebars");
    fs.writeFileSync(`${path_prefix}.js`, js);
    console.log(`Compiled ${path_prefix}.js`);
    if (handlebars.length > 0) {
        fs.writeFileSync(`${path_prefix}.handlebars`, handlebars);
        console.log(`Compiled ${path_prefix}.handlebars`);
    }
}

function compile_to_blocks(file, output, name) {
    const md = fs.readFileSync(file).toString();
    const js = extract(md, "javascript");
    const css = extract(md, "css");
    const html = extract(md, "html");
    const block = extract(md, "block");
    const final = template({html, js, css});
    fs.writeFileSync(path.join(output, "index.html"), final);
    console.log(`Compiled ${path.join(output, "index.html")}`);
    if (block.length > 0) {
        fs.writeFileSync(path.join(output, ".block"), block);
        console.log(`Compiled ${path.join(output, ".block")}`);
    }
    fs.writeFileSync(path.join(output, "README.md"), blocks_markdown(md));
    console.log(`Compiled ${path.join(output, "README.md")}`);
}

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

function blocks_markdown(txt) {
    const ast = marked_ast.parse(txt);
    for (const section of ast) {
        if (section.type === "paragraph") {
            section.text = section.text.map((x) => (x.replace ? x.replace(/\n/gm, " ") : x));
        }
    }

    return marked_ast_markdown.toMarkdown(ast);
}

const template_path = path.join(__dirname, "literally.handlebars");

const template_src = fs.readFileSync(template_path).toString();
const template = handlebars.compile(template_src);

function indent(txt, data) {
    const spaces = data.loc.start.column;
    return txt
        .split("\n")
        .map((line) => line.padStart(line.length + spaces, " "))
        .join("\n")
        .trimStart();
}

handlebars.registerHelper("indent", indent);