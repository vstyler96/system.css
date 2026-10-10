#!/usr/bin/env node
const dedent = require("dedent");
const ejs = require("ejs");
const fs = require("fs");
const glob = require("glob");
const hljs = require("highlight.js");
const mkdirp = require("mkdirp");
const path = require("path");
const postcss = require("postcss");
const plugins = [
  require("cssnano"),
  require("autoprefixer"),
  require("postcss-import"),
  require("postcss-nested"),
  require("postcss-calc"),
  require("postcss-base64")({
    root: process.cwd() + "/gui",
    extensions: [".png", ".svg", ".gif"],
  }),
];

const { homepage, version } = require("./package.json");

/**
 *
 * @param {Object} options
 * @param {boolean} [options.usePrefix] - Whether to apply a prefix for the CSS selectors.
 * @param {boolean} [options.useInlineVars] - Whether to inline CSS variables.
 */
async function buildCSS({ usePrefix, useInlineVars } = {}) {
  const input = `/*! system.css v${version} - ${homepage} */\n` + fs.readFileSync("gui/index.scss");

  let targetFile = "dist/system.css";
  let parser = postcss(plugins);

  if (usePrefix) {
    targetFile = "dist/system.scoped.css";
    parser = postcss([
      ...plugins,
      require("postcss-prefix-selector")({
        prefix: ".sys",
        transform: (prefix, selector, prefixed) => {
          if ("body" === selector) return selector + prefix;
          if (":root" === selector) return prefix;
          return prefixed;
        },
      }),
    ]);
  }
  if (useInlineVars) {
    targetFile = "dist/system.inline.css";
    parser = postcss([...plugins, require("postcss-css-variables")]);
  }

  const result = await parser.process(input, {
    from: "gui/index.scss",
    to: targetFile,
    map: { inline: false },
  });

  mkdirp.sync("dist");
  fs.writeFileSync(targetFile, result.css);
  fs.writeFileSync(targetFile + ".map", result.map.toString());
}

async function buildComponents() {
  const targetFolder = "dist/gui";
  const variablesFile = "_variables.scss";

  const files = fs.readdirSync("gui").filter((file) => file.startsWith("_") && file !== variablesFile);
  const results = await Promise.all(
    files.map((file) => {
      const target = targetFolder + "/" + file.slice(1).replace("scss", "css");
      const content = fs.readFileSync("gui/" + variablesFile) + fs.readFileSync("gui/" + file);
      return postcss([...plugins, require("postcss-css-variables")])
        .process(content, { from: "gui/" + file, to: target, map: { inline: false } })
        .then((parsed) => ({ target, parsed }));
    })
  );

  mkdirp.sync(targetFolder);
  results.forEach(({ target, parsed }) => fs.writeFileSync(target, parsed.css));
}

// Fonts are referenced as ./fonts/* from both dist/ and dist/gui/
function copyFonts() {
  for (const dir of ["dist/fonts", "dist/gui/fonts"]) {
    mkdirp.sync(dir);
    fs.readdirSync("gui/fonts").forEach((f) => fs.copyFileSync(path.join("gui/fonts", f), path.join(dir, f)));
  }
}

function buildDocs() {
  let id = 0;
  function getNewId() {
    return ++id;
  }
  function getCurrentId() {
    return id;
  }

  const template = fs.readFileSync("docs/index.html.ejs", "utf-8");
  function example(code) {
    const magicBrackets = /\[\[(.*)\]\]/g;
    const dedented = dedent(code);
    const inline = dedented.replace(magicBrackets, "$1");
    const escaped = hljs.highlight("html", dedented.replace(magicBrackets, ""))
      .value;

    return `<div class="example">
      ${inline}
      <details>
        <summary>Show code</summary>
        <pre><code>${escaped}</code></pre>
      </details>
    </div>`;
  }

  glob("docs/*", { ignore: ["docs/*.ejs"] }, (err, files) => {
    if (!err) {
      files.forEach((srcFile) =>
        fs.copyFileSync(srcFile, path.join("dist", path.basename(srcFile)))
      );
    } else throw "error globbing dist directory.";
  });
  fs.writeFileSync(
    path.join(__dirname, "/dist/index.html"),
    ejs.render(template, { getNewId, getCurrentId, example })
  );
}


async function build(mode) {
  try {
    await buildCSS();
    copyFonts();
    buildDocs();

    if (mode === "production") {
      await Promise.all([buildCSS({ usePrefix: true }), buildCSS({ useInlineVars: true }), buildComponents()]);
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}
module.exports = build;

if (require.main === module) build("production");
