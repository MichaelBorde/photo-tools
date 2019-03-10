'use strict';

const fs = require('fs');
const glob = require('glob');

if (require.main === module) {
  const [, , source, destination] = process.argv;
  sanitizeScans(source, destination);
}

async function sanitizeScans(source, destination) {
  const files = await glob(`${source}/**/*.{jpeg|jpg}`);
  const filesWithCreation = files.reduce((result, file) => {
    result.push(
      Object.assign({ path: file, creation: fs.statSync(file).birthtimeMs })
    );
    return result;
  }, []);

  const orderedFiles = filesWithCreation
    .slice()
    .sort((f1, f2) => f1.creation - f2.creation);

  const filesToCopy = orderedFiles.reduce((result, file, index) => {
    const newName = `${(index + 1)
      .toString()
      .padStart(files.length.toString().length, '0')}.jpg`;
    result.push(
      Object.assign({}, file, { newPath: `${destination}/${newName}` })
    );
    return result;
  }, []);

  for (let file of filesToCopy) {
    await fs.copyFile(file.path, file.newPath);
  }
}

module.exports = { sanitizeScans };
