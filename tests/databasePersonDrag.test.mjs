import assert from 'node:assert/strict';
import { parsePersonDropTarget, resolvePersonDragIds } from '../src/lib/databasePersonDrag.js';

assert.deepEqual(resolvePersonDragIds('a', ['a', 'b', 'b'], true), ['a', 'b']);
assert.deepEqual(resolvePersonDragIds('a', ['b', 'c'], false), ['a']);
assert.deepEqual(resolvePersonDragIds('a', ['b', 'c'], true), ['b', 'c']);
assert.deepEqual(parsePersonDropTarget('person-list:list-1'), { type: 'list', listId: 'list-1' });
assert.deepEqual(parsePersonDropTarget('list:master'), { type: 'list', listId: 'master' });
assert.deepEqual(parsePersonDropTarget('person-core-clients'), { type: 'core-clients' });
assert.deepEqual(parsePersonDropTarget('person-core-clients-sidebar'), { type: 'core-clients' });
assert.deepEqual(parsePersonDropTarget('person-pipeline'), { type: 'pipeline' });
assert.equal(parsePersonDropTarget('db-folder:abc'), null);

console.log('database person drag tests passed');
