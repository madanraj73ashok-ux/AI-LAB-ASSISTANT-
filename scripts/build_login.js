const fs = require('fs');
const path = require('path');
const CleanCSS = require('clean-css');
const terser = require('terser');

async function build() {
    const rootDir = path.join(__dirname, '..');
    const cssPath = path.join(rootDir, 'frontend', 'static', 'css', 'login.css');
    const minCssPath = path.join(rootDir, 'frontend', 'static', 'css', 'login.min.css');
    const jsPath = path.join(rootDir, 'frontend', 'static', 'js', 'app.js');
    const minJsPath = path.join(rootDir, 'frontend', 'static', 'js', 'app.min.js');

    console.log('⚡ Minifying CSS...');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const cssOutput = new CleanCSS({ level: 2 }).minify(cssContent);
    if (cssOutput.errors && cssOutput.errors.length) {
        throw new Error('CSS Minify Errors: ' + cssOutput.errors.join(', '));
    }
    fs.writeFileSync(minCssPath, cssOutput.styles, 'utf8');
    console.log(`✅ Minified CSS written to ${minCssPath} (${cssOutput.styles.length} bytes)`);

    console.log('⚡ Minifying & mangling JavaScript (no source maps, no console logs)...');
    const jsContent = fs.readFileSync(jsPath, 'utf8');
    const jsOutput = await terser.minify(jsContent, {
        mangle: {
            toplevel: true
        },
        compress: {
            drop_console: true,
            drop_debugger: true,
            passes: 2
        },
        format: {
            comments: false
        },
        sourceMap: false
    });
    if (!jsOutput.code) {
        throw new Error('JS Minify produced empty output');
    }
    fs.writeFileSync(minJsPath, jsOutput.code, 'utf8');
    console.log(`✅ Minified JS written to ${minJsPath} (${jsOutput.code.length} bytes)`);

    console.log('⚡ Processing HTML (stripping comments, removing inline handlers)...');
    const htmlPath = path.join(rootDir, 'frontend', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // 1. Remove inline onselectstart and ondragstart
    html = html.replace(/\s*onselectstart="[^"]*"/gi, '');
    html = html.replace(/\s*ondragstart="[^"]*"/gi, '');

    // 2. Replace inline <style>...</style> with external link
    html = html.replace(/<style>[\s\S]*?<\/style>/i, '<link rel="stylesheet" href="/static/css/login.min.css">');

    // 3. Replace inline <script>...</script> with external script
    html = html.replace(/<script>[\s\S]*?<\/script>/i, '<script src="/static/js/app.min.js" defer></script>');

    // 4. Strip all HTML comments
    html = html.replace(/<!--[\s\S]*?-->/g, '');

    // 5. Clean up redundant blank lines
    html = html.split('\n').filter(line => line.trim().length > 0 || line === '').join('\n');
    html = html.replace(/\n{3,}/g, '\n\n');

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ Cleaned HTML written to ${htmlPath}`);
    console.log('🚀 Build completed successfully!');
}

build().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
