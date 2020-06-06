const fs = require("fs");
const child_process = require("child_process");
const rimraf = require("rimraf");
const pkg = JSON.parse(fs.readFileSync("package.json").toString());
const marked_ast = require("marked-ast");
const {toMarkdown} = require("marked-ast-markdown");
const program = require("commander");
const path = require("path");
const marked = require("marked");
const glob = require("glob");

const block = (tag, txt) => {
    const start = tag ? `    <${tag}>` : "";
    const end = tag ? `    </${tag}>` : "";
    return `${start}
${txt}
    ${end}
    `;
};

const extract = function (src, lang) {
    const renderer = new marked.Renderer();
    for (let i in renderer) {
        if ("function" === typeof renderer[i]) {
            renderer[i] = function () {
                return "";
            };
        }
    }
    renderer.code = function (src, language) {
        return language === lang ? src + "\n\n" : "";
    };
    renderer.listitem = function (text) {
        return text;
    };
    renderer.list = function (body) {
        return body;
    };
    let output = marked(src, {renderer: renderer});
    output = output.replace(/\n+$/g, "");
    return output;
};

const template_elem = (txt, tag) => (txt && txt.trim().length > 0 ? block(tag, txt) : "");

const template = (html, js, css) => `
<!DOCTYPE html>
<html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
    ${template_elem(css, "style")}</head>
    <body>
    ${template_elem(html)}${template_elem(js, "script")}</body>
</html>
`;

const indent = (txt, levels) =>
    txt
        .split("\n")
        .map((line) => line.padStart(line.length + levels * 4, " "))
        .join("\n");

function compile_to_html(name, output) {
    const file = fs.readFileSync(name).toString();
    const js = extract(file, "javascript");
    const css = extract(file, "css");
    const html = extract(file, "html");
    const final = template(indent(html, 2), indent(js, 3), indent(css, 3));

    const asset = path.join(output, `${path.parse(file).name}.html`);
    fs.writeFileSync(asset, final);
    console.log(`Compiled ${asset}`);
}

function compile_to_node(name, output) {
    const file = fs.readFileSync(name).toString();
    const js = extract(file, "javascript");

    const asset = path.join(output, `${path.parse(file).name}.js`);
    fs.writeFileSync(asset, js);
    console.log(`Compiled ${asset}`);
}

function clean(txt) {
    const ast = marked_ast.parse(txt);

    // Remove title
    ast.shift();

    // Fix paragraph sections to remove newlines for pretty bl.ocks
    for (const section of ast) {
        if (section.type === "paragraph") {
            section.text = section.text.map((x) => (x.replace ? x.replace(/\n/gm, " ") : x));
        }
    }

    const md = toMarkdown(ast);
    return md;
}

function wip(cmd) {
    const hashes = []; // eval(fs.readFileSync(cmd.config))("require(`../literally.config.js`);

    for (const file in hashes) {
        try {
            // Create project in a tmp directory
            if (fs.existsSync(`dist/${hashes[file]}`)) {
                console.log(`dist/${hashes[file]} exists, skipping checkout`);
            } else {
                child_process.execSync(`git clone https://gist.github.com/${hashes[file]}.git dist/${hashes[file]}`);
            }
            fs.copyFileSync(`images/${file}.preview.png`, `dist/${hashes[file]}/preview.png`);
            fs.copyFileSync(`images/${file}.thumbnail.png`, `dist/${hashes[file]}/thumbnail.png`);

            if (!fs.existsSync(`dist/${hashes[file]}/.block`)) {
                fs.writeFileSync(`dist/${hashes[file]}/.block`, "license: apache-2.0");
            }

            // Retarget source assets to jsdelivr
            let source = fs.readFileSync(`dist/examples/${file}.html`).toString();
            source = source.replace(/\.\.\/node_modules\//g, `https://cdn.jsdelivr.net/npm/`);
            source = source.replace(/\.\.\//g, `https://cdn.jsdelivr.net/npm/regular-table@${pkg.version}/`);

            // Clean markdown
            let md = fs.readFileSync(`examples/${file}.md`).toString();

            // Write
            fs.writeFileSync(`dist/${hashes[file]}/README.md`, clean(md));
            fs.writeFileSync(`dist/${hashes[file]}/index.html`, source.trim());

            // Update git
            process.chdir(`dist/${hashes[file]}`);
            child_process.execSync(`git add thumbnail.png preview.png index.html .block README.md`);
            console.log(child_process.execSync(`git status`).toString());
            console.log(child_process.execSync(`git commit -am"Auto update via sync_gist" --amend`).toString());

            // Run sub command
            const command = process.argv.slice(2);
            if (command.length > 0) {
                console.log(child_process.execSync(command.join(" ")).toString());
            }
            process.chdir("../..");
        } catch (e) {
            console.error(`${file} dist failed!`, e);
        } finally {
            rimraf(`dist/${hashes[file]}`, () => console.log(`Cleaned ${hashes[file]}`));
        }
    }

    let output = `||||
|:--|:--|:--|
`;
    let titles = "",
        links = "";
    for (let i = 0; i < Object.keys(hashes).length; i++) {
        if (i % 3 === 0) {
            if (i !== 0) {
                output += titles + "\n" + links + "\n";
            }
            titles = "|";
            links = "|";
        }
        titles += Object.keys(hashes)[i] + "|";
        links += `[![${Object.keys(hashes)[i]}](https://bl.ocks.org/texodus/raw/${hashes[Object.keys(hashes)[i]]}/thumbnail.png)](https://bl.ocks.org/texodus/${hashes[Object.keys(hashes)[i]]})|`;
    }

    output += titles + "\n" + links + "\n";
    console.log(output);
}

function load_config(cmd) {
    let {config} = cmd;
    if (!config.startsWith("/")) {
        config = path.join(process.cwd(), config);
    }
    return require(config);
}

program
    .version(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json")).toString()).version)
    .description("A tool for literate programming, which can be used to generate various executable assets from markdown files")
    .arguments("[inputs...]")
    .option("-o, --output <path>", "The output path to write result files to")
    .option("-c, --config <path>", "The path for your literal config", (x) => x, "literally.config.js")
    .option("-c, --config <path>", "The path for your literal config", (x) => x, "literally.config.js")
    .option("-f, --format <format>", "Which output format to use:  blocks, node.", /^(blocks|node)$/i, "blocks")
    .option("--watch", "Compile continuously")
    .action((inputs, cmd) => {
        const config = load_config(cmd);
        const output = cmd.output || config.output || process.cwd();
        const files = inputs.length > 0 ? inputs : config.files;
        const watch = cmd.watch || config.watch;
        const format = cmd.format || config.format;

        if (!fs.existsSync(output)) {
            fs.mkdirSync(output);
        }

        for (const name of files) {
            for (const file of glob.sync(name)) {
                if (format === "blocks") {
                    compile_to_html(file, output);
                    if (watch) {
                        fs.watchFile(file, () => compile_to_html(file, output));
                    }
                } else if (format === "node") {
                    compile_to_node(file, output);
                    if (watch) {
                        fs.watchFile(file, () => compile_to_node(file, output));
                    }
                }
            }
        }
    });

program.parse(process.argv);