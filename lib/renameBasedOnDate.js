'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const glob = require('glob');
const mkdirp = require('mkdirp');
const exiftool = require('node-exiftool');
const moment = require('moment');

const mkdirpAsync = util.promisify(mkdirp);
const copyFileAsync = util.promisify(fs.copyFile);
const globAsync = util.promisify(glob);

if (require.main === module) {
  const [, , source, destination] = process.argv;
  renameBasedOnDate(source, destination);
}

async function renameBasedOnDate(source, destination) {
  const fullSource = path.resolve(source);
  const fullDestination = path.resolve(destination);
  console.log(
    `Renaming files in ${fullSource} and saving in ${fullDestination}`
  );
  const files = await globAsync(`${fullSource}/**/*.jpg`, {
    nocase: true,
    realpath: true
  });
  for (const file of files) {
    await renameFile(file, fullSource, fullDestination);
  }
}

async function renameFile(file, source, destination) {
  console.log(`Renaming ${file}`);
  const creationDate = await readCreationDate(file);
  const formattedDate = formatDate(creationDate);
  const destinationDir = getDestinationDir(file, source, destination);
  const basename = `${formattedDate}.jpg`;
  await mkdirpAsync(destinationDir);
  const finalName = path.join(destinationDir, basename);
  console.log(`Copying to ${finalName}`);
  await copyFileAsync(file, finalName);
}

async function readCreationDate(file) {
  let ep = null;
  try {
    ep = new exiftool.ExiftoolProcess();
    await ep.open();
    const metadata = await ep.readMetadata(file, ['-File:all']);
    if (!metadata.data || metadata.data.length === 0) {
      return null;
    }
    return parseDate(metadata.data[0].CreateDate);
  } finally {
    if (ep && ep.isOpen) {
      await ep.close();
    }
  }
}

function parseDate(dateString) {
  return moment.utc(dateString, 'YYYY:MM:DD HH:mm:ss').toDate();
}

function formatDate(date) {
  return moment.utc(date).format('YYYYMMDD_HHmmss');
}

function getDestinationDir(file, source, destination) {
  const dirname = path.dirname(file);
  return dirname.replace(source, destination);
}

module.exports = { renameBasedOnDate };
