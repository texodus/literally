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
            "The asset name (`html` and `node` format only)"
        )
        .option(
            "-c, --config <path>",
            "The path for your literal config, defaults to literally.config.js"
        )
        .option(
            "-f, --format <format>",
            "Which output format to use:  block, node, html."
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
function run_compiler(cli_files) {
    const cmd = program.opts();
    const config = load_config(cmd);
    const files = cli_files.length > 0 ? cli_files : config.files;
    const output = cmd.output || config.output || process.cwd() + "/";
    const watch = cmd.watch || config.watch;
    const format = cmd.format || config.format || "html";
    const name = cmd.name || config.name;
    const screenshot = cmd.screenshot || config.screenshot;
    const retartget = config.retarget || [];
    if (!files || !(files.length > 0)) {
        console.error("No input files!");
        return;
    }
    if (!fs.existsSync(output)) {
        fs.mkdirSync(output);
    }
    for (const term of files) {
        for (const file of glob.sync(path.join(process.cwd(), term))) {
            const compiler = COMPILERS[format];
            compiler(watch, file, output, name, retartget, screenshot);
        }
    }
}
function runwatch(watch, file, ...args) {
    this(file, ...args);
    if (watch) {
        fs.watchFile(file, () => this(file, ...args));
    }
}
const COMPILERS = {
    inlinehtml: runwatch.bind(compile_to_inlinehtml),
    html: runwatch.bind(compile_to_html),
    node: runwatch.bind(compile_to_node),
    block: runwatch.bind(compile_to_blocks),
};
function compile_to_node(file, output, name) {
    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const path_prefix = path.join(output, out_name);
    const md = fs.readFileSync(file).toString();
    const {javascript, handlebars} = extract(md_name, out_name, md);
    fs.writeFileSync(`${path_prefix}.js`, javascript);
    console.log(`Literally compiled ${path_prefix}.js`);
    if (handlebars.length > 0) {
        fs.writeFileSync(`${path_prefix}.handlebars`, handlebars);
        console.log(`Literally compiled ${path_prefix}.handlebars`);
    }
}
async function compile_to_blocks(file, output, name, retarget, is_screenshot) {
    let md = fs.readFileSync(file).toString();
    for (const {rule, value} of retarget) {
        md = md.replace(new RegExp(rule, "gm"), value);
    }
    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const parsed = extract(md_name, out_name, md);
    const {javascript, css, html, block, markdown} = parsed;
    const final = template({html, javascript, css});
    fs.writeFileSync(path.join(output, "index.html"), final);
    console.log(`Literally compiled ${path.join(output, "index.html")}`);
    if (block.length > 0) {
        fs.writeFileSync(path.join(output, ".block"), block);
        console.log(`Literally compiled ${path.join(output, ".block")}`);
    }
    fs.writeFileSync(path.join(output, "README.md"), markdown);
    console.log(`Literally compiled ${path.join(output, "README.md")}`);
    if (is_screenshot) {
        await screenshot(output, out_name);
    }
}
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
        path: path.join(output, "preview.png"),
    });
    console.log(`Captured preview.png`);
    sharp(path.join(output, "preview.png"))
        .resize(230, 120)
        .toFile(path.join(output, "thumbnail.png"));
    console.log(`Captured thumbnail.png`);
    server.close();
    await browser.close();
}
function compile_to_inlinehtml(file, output, name) {
    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const path_prefix = path.join(output, out_name);
    const md = fs.readFileSync(file).toString();
    const {javascript, css, html} = extract(md_name, out_name, md);
    const final = template({html, javascript, css});
    fs.writeFileSync(`${path_prefix}.html`, final);
    console.log(`Literally compiled ${path_prefix}.html`);
}
function compile_to_html(file, output, name) {
    const md_name = path.parse(file).name;
    const out_name = name || md_name;
    const path_prefix = path.join(output, out_name);
    const md = fs.readFileSync(file).toString();
    let {javascript, sourcemap, css, html} = extract(md_name, out_name, md);
    javascript += `\n\n//# sourceMappingURL=${out_name}.js.map`;
    fs.writeFileSync(`${path_prefix}.js`, javascript || "");
    console.log(`Literally compiled ${path_prefix}.js`);
    fs.writeFileSync(`${path_prefix}.js.map`, sourcemap || "");
    console.log(`Literally compiled ${path_prefix}.js.map`);
    const final = template({html, src: `${out_name}.js`, css});
    fs.writeFileSync(`${path_prefix}.html`, final);
    console.log(`Literally compiled ${path_prefix}.html`);
}
function template(...args) {
    const template_path = path.join(__dirname, "literally.handlebars");
    const template_src = fs.readFileSync(template_path).toString();
    handlebars.registerHelper("indent", indent);
    return handlebars.compile(template_src)(...args);
}
function indent(txt, data) {
    const spaces = data.loc.start.column;
    return txt
        .split("\n")
        .map((line) => line.padStart(line.length + spaces, " "))
        .join("\n")
        .trimStart();
}
function extract(md_name, out_name, src, is_blocks = false) {
    let ast = marked_ast.parse(src);
    const blocks = {markdown: "", javascript: []};
    for (const index in ast) {
        const section = ast[index];
        blocks[section.lang] = blocks[section.lang] || "";
        if (section.lang === "javascript") {
            for (node of extract_js(blocks, md_name, section)) {
                blocks.javascript.push(node);
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
function extract_sourcemap(md_name, out_name, blocks) {
    const {javascript, markdown} = blocks;
    const sm = new sourceMap.SourceNode(1, 1, `${md_name}.md`, javascript);
    sm.setSourceContent(`${md_name}.md`, markdown);
    const {code, map} = sm.toStringWithSourceMap({file: `${out_name}.js`});
    return {...blocks, javascript: code, sourcemape: map.toString()};
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
function get_package() {
    const pkg_path = path.join(__dirname, "../package.json");
    return JSON.parse(fs.readFileSync(pkg_path).toString());
}
const fs = require("fs");
const path = require("path");
const marked_ast = require("marked-ast");
const marked_ast_markdown = require("marked-ast-markdown");
const program = require("commander");
const glob = require("glob");
const handlebars = require("handlebars");
const sourceMap = require("source-map");
