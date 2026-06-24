import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase, createTestUser } from '../test-helper';

const testDb = createTestDatabase();
mock.module('../../src/config/database', () => ({ db: testDb }));

import { boardService } from '../../src/services/board.service';
import { commentService } from '../../src/services/comment.service';
import { labelService } from '../../src/services/label.service';
import { taskService } from '../../src/services/task.service';
import { teamService } from '../../src/services/team.service';

describe('Comments, labels, archive purge', () => {
  let userId: string;
  let teamId: string;
  let boardId: string;
  let taskId: string;

  beforeEach(async () => {
    testDb.run('DELETE FROM task_comments');
    testDb.run('DELETE FROM task_labels');
    testDb.run('DELETE FROM labels');
    testDb.run('DELETE FROM tasks');
    testDb.run('DELETE FROM columns');
    testDb.run('DELETE FROM boards');
    testDb.run('DELETE FROM team_members');
    testDb.run('DELETE FROM teams');
    testDb.run('DELETE FROM users');

    userId = createTestUser(testDb, {
      id: 'u-cl',
      email: 'cl@example.com',
      displayName: 'CL User',
    });
    const team = await teamService.createTeam({ name: 'CL Team', ownerId: userId });
    teamId = team.id;
    const board = await boardService.createBoard({ teamId, name: 'CL Board' });
    boardId = board.id;
    const col = boardService.getColumnsForBoard(boardId)[0];
    if (!col) throw new Error('no column');
    const task = await taskService.createTask({
      columnId: col.id,
      title: 'CL Task',
      createdBy: userId,
    });
    taskId = task.id;
  });

  test('comments can be added and listed', () => {
    commentService.add(taskId, userId, 'Hello world');
    const list = commentService.listForTask(taskId);
    expect(list).toHaveLength(1);
    expect(list[0]?.body).toBe('Hello world');
    expect(list[0]?.userName).toBe('CL User');
  });

  test('labels attach to tasks', () => {
    const label = labelService.create(teamId, 'Bug', '#ef4444');
    labelService.addToTask(taskId, label.id);
    const onTask = labelService.listForTask(taskId);
    expect(onTask.map((l) => l.name)).toEqual(['Bug']);
    labelService.removeFromTask(taskId, label.id);
    expect(labelService.listForTask(taskId)).toHaveLength(0);
  });

  test('labels cannot cross team boundaries and colors are validated', async () => {
    const otherOwner = createTestUser(testDb, {
      id: 'other-label-owner',
      email: 'other-label@example.com',
      displayName: 'Other Label Owner',
    });
    const otherTeam = await teamService.createTeam({
      name: 'Other Label Team',
      ownerId: otherOwner,
    });
    const foreignLabel = labelService.create(otherTeam.id, 'Foreign', '#123456');

    expect(() => labelService.addToTask(taskId, foreignLabel.id)).toThrow(/does not belong/);
    expect(() => labelService.create(teamId, 'Unsafe', 'url(https://example.test)')).toThrow(
      /Invalid label color/
    );
  });

  test('label names are capped at 40 characters', () => {
    expect(() => labelService.create(teamId, 'x'.repeat(41))).toThrow(/1-40 characters/);
    expect(() => labelService.create(teamId, '   ')).toThrow(/1-40 characters/);
    const ok = labelService.create(teamId, 'x'.repeat(40));
    expect(ok.name).toBe('x'.repeat(40));
  });

  test('comment delete enforces author-or-admin', () => {
    const otherId = createTestUser(testDb, {
      id: 'comment-other',
      email: 'comment-other@example.com',
      displayName: 'Other',
    });
    const comment = commentService.add(taskId, userId, 'Moderate me');

    expect(() => commentService.delete(comment.id, otherId, false)).toThrow(/Access Denied/);
    commentService.delete(comment.id, otherId, true); // admin can delete anyone's
    expect(commentService.listForTask(taskId)).toHaveLength(0);

    const own = commentService.add(taskId, otherId, 'Mine');
    commentService.delete(own.id, otherId, false); // author can delete own
    expect(commentService.listForTask(taskId)).toHaveLength(0);
  });

  test('removing a member unassigns team tasks and removes dashboard access', async () => {
    const memberId = createTestUser(testDb, {
      id: 'removed-member',
      email: 'removed@example.com',
      displayName: 'Removed Member',
    });
    teamService.addMember(teamId, memberId);
    await taskService.updateTask(taskId, { assigneeId: memberId });
    expect(taskService.getTasksAssignedToUser(memberId)).toHaveLength(1);

    teamService.removeMember(teamId, memberId);

    expect(taskService.getTasksAssignedToUser(memberId)).toHaveLength(0);
    expect(taskService.getById(taskId).assigneeId).toBeNull();
  });

  test('purge only deletes archived tasks', () => {
    taskService.archiveTask(taskId);
    expect(taskService.countArchivedOnBoard(boardId)).toBe(1);
    const n = taskService.purgeAllArchived(boardId);
    expect(n).toBe(1);
    expect(taskService.countArchivedOnBoard(boardId)).toBe(0);
  });

  test('invite token regenerate changes token', async () => {
    const team = teamService.getById(teamId);
    const a = teamService.getOrCreateInviteToken(teamId);
    const b = teamService.regenerateInviteToken(teamId);
    expect(b).not.toBe(a);
    expect(teamService.validateInviteToken(teamId, a)).toBe(false);
    expect(teamService.validateInviteToken(teamId, b)).toBe(true);
    void team;
  });
});
