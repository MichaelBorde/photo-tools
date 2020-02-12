'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const glob = require('glob');
const mkdirp = require('mkdirp');
const exiftool = require('node-exiftool');
const exiftoolBin = require('dist-exiftool');
const moment = require('moment');

const mkdirpAsync = util.promisify(mkdirp);
const copyFileAsync = util.promisify(fs.copyFile);
const statAsync = util.promisify(fs.stat);
const globAsync = util.promisify(glob);

const imageExtensions = ['jpg', 'jpeg'];
const videoExtensions = ['mp4'];

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
  const extension = getExtension(file);
  if (isAnImage(extension)) {
    return computeNewImageName(file);
  } else if (isAVideo(extension)) {
    return computeNewVideoName(file);
  }
  console.log(`${file} will be ignored`);
  return path.basename(file);
}

function isAnImage(extension) {
  return imageExtensions.some(
    relevantExtension =>
      relevantExtension.toUpperCase() === extension.toUpperCase()
  );
}

function isAVideo(extension) {
  return videoExtensions.some(
    relevantExtension =>
      relevantExtension.toUpperCase() === extension.toUpperCase()
  );
}

async function computeNewImageName(file) {
  const originalBaseName = path.basename(file);
  const extension = getExtension(file);
  const creationDate = await readExifCreationDate(file);
  if (!creationDate) {
    console.log(`${file} has no creation date`);
    return originalBaseName;
  }
  const formattedDate = formatDate(creationDate);
  return `${formattedDate}.${extension}`;
}

async function readExifCreationDate(file) {
  let ep = null;
  try {
    ep = new exiftool.ExiftoolProcess(exiftoolBin);
    await ep.open();
    const metadata = await ep.readMetadata(file, ['-File:all']);
    if (!metadata.data || metadata.data.length === 0) {
      return null;
    }
    return parseExifDate(metadata.data[0].DateTimeOriginal);
  } finally {
    if (ep && ep.isOpen) {
      await ep.close();
    }
  }
}

function parseExifDate(dateString) {
  const currentMoment = moment.utc(dateString, 'YYYY:MM:DD HH:mm:ss');
  if (!currentMoment.isValid()) {
    return null;
  }
  return currentMoment.toDate();
}

async function computeNewVideoName(file) {
  const extension = getExtension(file);
  const creationDate = await readFsCreationDate(file);
  const formattedDate = formatDate(creationDate);
  return `${formattedDate}.${extension}`;
}

async function readFsCreationDate(file) {
  const info = await statAsync(file);
  return info.mtime;
}

function formatDate(date) {
  return moment.utc(date).format('YYYYMMDD_HHmmss');
}

function getDestinationDir(file, source, destination) {
  const dirname = path.dirname(file);
  return dirname.replace(source, destination);
}

async function copyUniqueFile(source, destination) {
  for (let i = 0; i < 100; i++) {
    try {
      const normalisedDestination = normaliseFileName(destination);
      const indexedDestination = indexFileName(normalisedDestination, i);
      await copyFile(source, indexedDestination);
      return;
    } catch (error) {
      console.error(`Impossible to rename file ${source}: ${error.message}`);
    }
  }
}

function normaliseFileName(fileName) {
  const extension = getExtension(fileName);
  return fileName.replace(`.${extension}`, `.${extension.toLowerCase()}`);
}

function indexFileName(fileName, index) {
  if (index === 0) {
    return fileName;
  }
  const suffix = ('000' + index).substr(-3, 3);
  const extension = getExtension(fileName);
  return fileName.replace(`.${extension}`, `_${suffix}.${extension}`);
}

async function copyFile(source, destination) {
  console.log(`Copying to ${destination}`);
  await copyFileAsync(source, destination, fs.constants.COPYFILE_EXCL);
}

function getExtension(fileName) {
  return fileName.split('.').pop();
}

module.exports = { renameBasedOnDate };
