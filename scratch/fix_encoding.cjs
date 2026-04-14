const fs = require('fs');
const path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.split('\n').map(line => {
    if (line.includes('Tenés que iniciar sesión primero')) {
        return line.replace(/alert\('.+Tenés/, "alert('⚠️ Tenés");
    }
    return line;
}).join('\n');
fs.writeFileSync(path, content);
console.log('Fixed App.tsx');
