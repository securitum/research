"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const acorn_1 = require("acorn");
const escodegen = require("escodegen");
const ast_types_1 = require("ast-types");
const fs_1 = require("fs");
const yargs = require("yargs");
const glob = require("glob");
const readline = require("readline");
const GET_PROP = '$_GET_PROP';
const IN_OPERATOR = '$_IN';
const PREAMBLE = `
window.$_SHOULD_LOG = true;
window.$_IGNORED_PROPS = new Set([]);
function $_GET_PROP(obj, prop) {
    if (window.$_SHOULD_LOG && !window.$_IGNORED_PROPS.has(prop) && obj instanceof Object && typeof obj === 'object' && !(prop in obj)) {
        console.group(\`obj[\${JSON.stringify(prop)}]\`);
        console.trace();
        console.groupEnd();
    }
    return obj[prop];
}
function $_IN(obj, prop) {
    const b = prop in obj;
    if (window.$_SHOULD_LOG && obj instanceof Object && !b) {
        console.group(\`\${JSON.stringify(prop)} in obj\`);
        console.trace();
        console.groupEnd();
    }
    return b;
}
`;
function isLeftInAssignment(path) {
    return (path.parentPath.value.type === 'AssignmentExpression'
        && path.name === 'left');
}
function parentIsCallExpression(path) {
    return (path.parentPath.value.type === 'CallExpression');
}
function isWithinDeleteExpression(path) {
    return (path.parentPath.value.type === 'UnaryExpression'
        && path.parentPath.value.operator === 'delete');
}
function isWithinUpdateExpression(path) {
    return (path.parentPath.value.type === 'UpdateExpression');
}
const IGNORED_MEMBER_EXPRESSIONS = [
    {
        object: /^self|top|window|parent$/,
        property: /^addEventListener|alert|atob|blur|btoa|cancelAnimationFrame|cancelIdleCallback|captureEvents|clearInterval|clearTimeout|clientInformation|close|closed|confirm|createImageBitmap|crypto|customElements|defaultStatus|defaultstatus|devicePixelRatio|dispatchEvent|document|external|fetch|find|focus|frameElement|frames|getComputedStyle|getSelection|history|indexedDB|innerHeight|innerWidth|isSecureContext|length|localStorage|location|locationbar|matchMedia|menubar|moveBy|moveTo|name|navigator|open|openDatabase|opener|origin|outerHeight|outerWidth|pageXOffset|pageYOffset|parent|performance|personalbar|postMessage|print|prompt|queueMicrotask|releaseEvents|removeEventListener|requestAnimationFrame|requestIdleCallback|resizeBy|resizeTo|screen|screenLeft|screenTop|screenX|screenY|scroll|scrollBy|scrollTo|scrollX|scrollY|scrollbars|self|sessionStorage|setInterval|setTimeout|speechSynthesis|status|statusbar|stop|styleMedia|toolbar|top|visualViewport|window$/
    },
    {
        property: 'prototype'
    },
    {
        object: 'document',
        property: /^body|documentElement|head|getElementById|querySelector|querySelectorAll$/
    },
    {
        object: 'Object',
        property: /^length|name|prototype|assign|getOwnPropertyDescriptor|getOwnPropertyDescriptors|getOwnPropertyNames|getOwnPropertySymbols|is|preventExtensions|seal|create|defineProperties|defineProperty|freeze|getPrototypeOf|setPrototypeOf|isExtensible|isFrozen|isSealed|keys|entries|fromEntries|values$/
    }
];
function ignored(path) {
    if (path.node.object.type !== 'Identifier') {
        return false;
    }
    const object = path.node.object.name;
    if (path.node.property.type !== 'Identifier') {
        return false;
    }
    const property = path.node.property.name;
    for (let rule of IGNORED_MEMBER_EXPRESSIONS) {
        let numRules = Number(rule.hasOwnProperty('object')) + Number(rule.hasOwnProperty('property'));
        ;
        let trueRules = 0;
        if (rule.hasOwnProperty('object')) {
            const r = rule.object;
            if (typeof r === 'string') {
                trueRules += object === r ? 1 : 0;
            }
            else {
                trueRules += r.test(object) ? 1 : 0;
            }
        }
        if (rule.hasOwnProperty('property')) {
            const r = rule.property;
            if (typeof r === 'string') {
                trueRules += property === r ? 1 : 0;
            }
            else {
                trueRules += r.test(property) ? 1 : 0;
            }
        }
        if (trueRules === numRules) {
            return true;
        }
    }
    return false;
}
function instrumentate(js) {
    let ast;
    try {
        ast = acorn_1.Parser.parse(js, { sourceType: 'module', 'locations': true });
    }
    catch (ex) {
        ast = acorn_1.Parser.parse(js, { sourceType: 'script', 'locations': true });
    }
    ast_types_1.visit(ast, {
        visitMemberExpression(path) {
            if (ignored(path)) {
                this.traverse(path);
                return;
            }
            let property;
            if (path.node.computed) {
                property = path.node.property;
            }
            else {
                property = ast_types_1.builders.literal(path.node.property['name']);
            }
            const n = ast_types_1.builders.callExpression(ast_types_1.builders.identifier(GET_PROP), [
                path.node['object'],
                property,
            ]);
            if (!isLeftInAssignment(path)
                && !parentIsCallExpression(path)
                && !isWithinDeleteExpression(path)
                && !isWithinUpdateExpression(path)) {
                path.parentPath.get(path.name).replace(n);
            }
            this.traverse(path);
        },
        visitBinaryExpression(path) {
            if (path.node.operator === 'in') {
                const n = ast_types_1.builders.callExpression(ast_types_1.builders.identifier(IN_OPERATOR), [
                    path.node.right,
                    path.node.left,
                ]);
                path.parentPath.get(path.name).replace(n);
            }
            this.traverse(path);
        }
    });
    return escodegen.generate(ast);
}
const args = yargs
    .command('$0 [filesOrDirs...]', 'Instrumentate JS code to simplify exploitation of prototype pollution issues', () => { })
    .option('e', {
    default: 'js',
    alias: 'extensions',
    help: 'Comma-separated list of extensions instrumentated in directories'
})
    .argv;
const allFiles = [];
for (let f of args.filesOrDirs) {
    if (!fs_1.existsSync(f)) {
        console.error(`Path ${f} does not exist.`);
        process.exit(1);
    }
    const stat = fs_1.lstatSync(f);
    if (stat.isDirectory()) {
        const files = glob.sync(`${f}/**/*.+(${args.e.split(",").join('|')})`);
        allFiles.push(...files);
    }
    else {
        allFiles.push(f);
    }
}
function input() {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin });
        rl.once('line', line => resolve(line));
    });
}
(async function () {
    const rl = readline.createInterface({
        input: process.stdin,
    });
    console.log(`About to instrumentate ${allFiles.length} JS files. These files will be modified *IN PLACE*. Are you sure `
        + `you want to do that?\nEnter "YES" if you are.`);
    const line = await input();
    if (line !== 'YES') {
        console.log('Not "YES". Exiting.');
        process.exit(0);
    }
    for (let file of allFiles) {
        const content = fs_1.readFileSync(file).toString('utf-8');
        const instrumentated = instrumentate(content);
        fs_1.writeFileSync(file, instrumentated);
        console.log(`Saved ${file}...`);
    }
    console.log(`Done! Don't forget to put the following script before loading instrumentated code:\n<script>${PREAMBLE}</script>`);
    process.exit(0);
})();
