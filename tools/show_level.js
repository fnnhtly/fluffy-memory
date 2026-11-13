const path = require('path');
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));
const lv = LEVELS.find(l => l.levelId === '1-4');
console.log('rows:');
lv.mapRows.forEach((r, i) => console.log(String(i).padStart(2), r));
console.log('materials', JSON.stringify(lv.materials));
