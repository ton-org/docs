const extract = require('extract-zip')
const path = require('node:path');

async function main() {
    const currentDir = __dirname;
    const target = path.join(currentDir, 'dist');
    try {
        await extract('export.zip', { dir: target })
        console.log('Extraction complete')
    } catch (err) {
        console.error(err)
    }
}

main()