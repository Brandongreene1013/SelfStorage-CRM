import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  DATABASE_ROOT_ID,
  buildExplorerStats,
  duplicateSiblingName,
  folderBreadcrumbs,
  folderDescendantIds,
  searchExplorerItems,
  sortExplorerItems,
  validateFolderMove,
  validateFolderName,
} from '../src/lib/databaseExplorer.js';

const folders = [
  { id: 'a', name: 'Northeast', parentId: null },
  { id: 'b', name: 'New York', parentId: 'a' },
  { id: 'c', name: 'Long Island', parentId: 'b' },
  { id: 'd', name: 'Texas', parentId: null },
];
const lists = [
  { id: 'l1', name: 'Queens Owners', folderId: 'b', source: 'CoStar' },
  { id: 'l2', name: 'Dallas Callbacks', folderId: 'd', source: 'Salesforce' },
  { id: 'l3', name: 'Root Prospects', folderId: null, source: 'Manual' },
];

assert.deepEqual(folderBreadcrumbs(folders, 'c').map(item => item.name), ['Northeast', 'New York', 'Long Island']);
assert.deepEqual([...folderDescendantIds(folders, 'a')].sort(), ['b', 'c']);
assert.equal(validateFolderMove(folders, 'a', 'c').valid, false, 'cycles are rejected');
assert.equal(validateFolderMove(folders, 'c', 'd').valid, true, 'valid cross-tree moves are allowed');
assert.equal(validateFolderName('  Florida   Markets ').name, 'Florida Markets');
assert.equal(validateFolderName(' ').valid, false);
assert.equal(duplicateSiblingName(folders, ' northeast ', null), true);

const counts = new Map([['l1', 25], ['l2', 10], ['l3', 4]]);
const stats = buildExplorerStats(folders, lists, counts);
assert.equal(stats.get('a').totalLists, 1);
assert.equal(stats.get('a').totalRecords, 25);
assert.equal(stats.get(DATABASE_ROOT_ID).totalRecords, 39);
assert.deepEqual(searchExplorerItems(folders, lists, 'queen').map(item => item.id), ['l1']);
assert.deepEqual(searchExplorerItems(folders, lists, 'costar').map(item => item.id), ['l1']);
assert.deepEqual(
  sortExplorerItems([{ type: 'list', name: 'B', recordCount: 2 }, { type: 'list', name: 'A', recordCount: 9 }], 'records', 'desc')
    .map(item => item.name),
  ['A', 'B'],
);

const deepFolders = Array.from({ length: 10 }, (_, index) => ({
  id: `depth-${index + 1}`,
  name: `Level ${index + 1}`,
  parentId: index === 0 ? null : `depth-${index}`,
}));
assert.equal(validateFolderMove(deepFolders, 'depth-1', 'depth-10').valid, false);

const stressFolders = Array.from({ length: 2_000 }, (_, index) => ({
  id: `f${index}`,
  name: `Market Folder ${index}`,
  parentId: index < 100 ? null : `f${Math.floor((index - 100) / 20)}`,
}));
const stressLists = Array.from({ length: 10_000 }, (_, index) => ({
  id: `list${index}`,
  name: `Prospect List ${index}`,
  folderId: `f${index % stressFolders.length}`,
  source: index % 2 ? 'CoStar' : 'Salesforce',
}));
const started = performance.now();
const stressStats = buildExplorerStats(stressFolders, stressLists, new Map(stressLists.map(list => [list.id, 5])));
const results = searchExplorerItems(stressFolders, stressLists, 'Prospect List 999');
const elapsed = performance.now() - started;
assert.equal(stressStats.get(DATABASE_ROOT_ID).totalLists, 10_000);
assert.ok(results.length >= 1);
assert.ok(elapsed < 2_000, `Explorer stress operations took ${elapsed.toFixed(0)}ms`);

console.log('databaseExplorer tests passed');
