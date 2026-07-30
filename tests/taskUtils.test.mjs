import assert from 'node:assert/strict';
import {
  getNextOpenTask,
  taskEditDefaults,
} from '../src/components/tasks/taskUtils.js';

const tasks = [
  {
    id: 'later',
    title: 'Later task',
    status: 'open',
    dueDate: '2026-08-15',
    taskType: 'email',
    priority: 'normal',
    description: '',
  },
  {
    id: 'next',
    title: 'Call owner',
    status: 'open',
    dueDate: '2026-08-01',
    taskType: 'call',
    priority: 'high',
    description: 'Discuss pricing expectations.',
  },
];

const nextTask = getNextOpenTask(tasks);
assert.equal(nextTask.id, 'next');
assert.deepEqual(taskEditDefaults(nextTask), {
  id: 'next',
  title: 'Call owner',
  taskType: 'call',
  priority: 'high',
  dueDate: '2026-08-01',
  description: 'Discuss pricing expectations.',
});
assert.deepEqual(taskEditDefaults(null), {});

console.log('task utility tests passed');
