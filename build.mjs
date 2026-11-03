// Inline src/*.js into src/page.html -> index.html (the published single-file game).
import fs from 'fs';
const tpl = fs.readFileSync('src/page.html', 'utf8');
const files = fs.readdirSync('src').filter(f => f.endsWith('.js')).sort();
const js = files.map(f => `// ==== ${f} ====\n` + fs.readFileSync('src/' + f, 'utf8')).join('\n');
fs.writeFileSync('index.html', tpl.replace('/*__GAME__*/', () => js));
console.log('index.html', (fs.statSync('index.html').size / 1024).toFixed(1), 'KB from', files.length, 'files');
