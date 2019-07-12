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

const extensions = ['jpg', 'jpeg', 'png'];

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
  const files = await globAsync(`${fullSource}/**/*.*`, {
    nocase: true,
    realpath: true
  });
  await renameFiles(files, fullSource, fullDestination);
}

async function renameFiles(files, fullSource, fullDestination) {
  for (const file of files) {
    await renameFile(file, fullSource, fullDestination);
  }
}

async function renameFile(file, source, destination) {
  console.log(`Renaming ${file}`);
  try {
    const basename = await computeNewBaseName(file);
    const destinationDir = getDestinationDir(file, source, destination);
    const finalName = path.join(destinationDir, basename);
    await mkdirpAsync(destinationDir);
    await copyUniqueFile(file, finalName);
  } catch (error) {
    console.error(`Impossible to rename file ${file}: ${error.message}`);
  }
}

async function computeNewBaseName(file) {
  const originalBaseName = path.basename(file);
  const extension = file.split('.').pop().toLowerCase();
  if (!isAnImage(extension)) {
    console.log(`${file} will be ignored`)
    return originalBaseName;
  }
  const creationDate = await readCreationDate(file);
  if (!creationDate) {
    console.log(`${file} has no creation date`)
    return originalBaseName;
  }
  const formattedDate = formatDate(creationDate);
  return `${formattedDate}.${extension}`;
}

function isAnImage(extension) {
  for (const relevantExtension of extensions) {
    if (relevantExtension.toUpperCase() === extension.toUpperCase()) {
      return true;
    }
  }
  return false;
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
    return parseDate(metadata.data[0].DateTimeOriginal);
  } finally {
    if (ep && ep.isOpen) {
      await ep.close();
    }
  }
}

function parseDate(dateString) {
  const currentMoment = moment.utc(dateString, 'YYYY:MM:DD HH:mm:ss');
  if (!currentMoment.isValid()) {
    return null;
  }
  return currentMoment.toDate();
}

function formatDate(date) {
  return moment.utc(date).format('YYYYMMDD_HHmmss');
}

function getDestinationDir(file, source, destination) {
  const dirname = path.dirname(file);
  return dirname.replace(source, destination);
}

async function copyUniqueFile(source, destination) {
  for (let i = 1; i <= 100; i++) {
    try {
      const index = ('000' + i).substr(-3, 3);
      const indexedDestination = destination.replace('.jpg', `_${index}.jpg`);
      await copyFile(source, indexedDestination);
      return;
    } catch (error) {
      console.error(`Impossible to rename file ${source}: ${error.message}`);
    }
  }
}

async function copyFile(source, destination) {
  console.log(`Copying to ${destination}`);
  await copyFileAsync(source, destination, fs.constants.COPYFILE_EXCL);
}

module.exports = { renameBasedOnDate };
