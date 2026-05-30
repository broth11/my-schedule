const fs = require('fs');

function isOptionalCanvasWarning(message) {
    return message.includes('Cannot polyfill `DOMMatrix`') || message.includes('Cannot polyfill `Path2D`');
}

function requirePdfJs() {
    const originalWarn = console.warn;
    const originalLog = console.log;
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    console.warn = (...args) => {
        const message = args.join(' ');
        if (isOptionalCanvasWarning(message)) return;
        originalWarn(...args);
    };

    console.log = (...args) => {
        const message = args.join(' ');
        if (isOptionalCanvasWarning(message)) return;
        originalLog(...args);
    };

    process.stderr.write = (chunk, ...args) => {
        const message = String(chunk);
        if (isOptionalCanvasWarning(message)) return true;
        return originalStderrWrite(chunk, ...args);
    };

    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    console.warn = originalWarn;
    console.log = originalLog;

    return pdfjsLib;
}

const pdfjsLib = requirePdfJs();

async function extractTextFromPdfFile(filePath) {
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
    const pages = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(' '));
    }

    return pages.join('\n');
}

module.exports = {
    extractTextFromPdfFile
};
