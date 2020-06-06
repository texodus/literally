const fs = require("fs");
const path = require("path");

const marked_ast = require("marked-ast");
//const {toMarkdown} = require("marked-ast-markdown");
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
    .option("-f, --format <format>", "Which output format to use:  blocks, node.", /^(blocks|node|html)$/i, "html")
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

function compile_to_html(name, path_prefix) {
    const file = fs.readFileSync(name).toString();
    const js = extract(file, "javascript");
    const css = extract(file, "css");
    const html = extract(file, "html");
    const final = template({html, js, css});
    fs.writeFileSync(`${path_prefix}.html`, final);
    console.log(`Compiled ${path_prefix}.html`);
}

function compile_to_node(name, path_prefix) {
    const file = fs.readFileSync(name).toString();
    const js = extract(file, "javascript");
    const handlebars = extract(file, "handlebars");
    fs.writeFileSync(`${path_prefix}.js`, js);
    console.log(`Compiled ${path_prefix}.js`);
    fs.writeFileSync(`${path_prefix}.handlebars`, handlebars);
    console.log(`Compiled ${path_prefix}.handlebars`);
}

async function capture_screenshot(output) {
    const puppeteer = require("puppeteer");
    const browser = await puppeteer.launch();
    const page = await brower.newPage();
    page.goto("http://localhost:8080/examples/perspective.html");
    const screenshot = await page.screenshot();
}

function compile_to_blocks(name, output) {
    compile_to_html(name, output);
    capture_screenshot(output);
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