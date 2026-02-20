const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            if (!dirPath.includes('node_modules') && !dirPath.includes('.next')) {
                walk(dirPath, callback);
            }
        } else if (dirPath.endsWith('.ts') || dirPath.endsWith('.tsx')) {
            callback(path.join(dir, f));
        }
    });
}

function processDirectory(sourceDir) {
    walk(sourceDir, (filePath) => {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        // Replace strict matches for 'proposed' with 'QUALIFIED'
        content = content.replace(/'proposed'/g, "'QUALIFIED'");
        content = content.replace(/"proposed"/g, '"QUALIFIED"');

        if (content !== original) {
            fs.writeFileSync(filePath, content);
            console.log(`Updated enum in ${filePath}`);
        }
    });
}

processDirectory('lib');
processDirectory('app');
