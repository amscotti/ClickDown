import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestColumn, createTestDatabase, createTestUser } from '../test-helper';

const testDb = createTestDatabase();

mock.module('../../src/config/database', () => ({
  db: testDb,
}));

import { activityService } from '../../src/services/activity.service';
import { boardService } from '../../src/services/board.service';
import { taskService } from '../../src/services/task.service';
import { teamService } from '../../src/services/team.service';

describe('Extended Service Unit Tests', () => {
  let userId: string;

  beforeAll(() => {
    testDb.run('DELETE FROM users');
    userId = createTestUser(testDb, {
      id: 'ext-user-id',
      email: 'ext@example.com',
      displayName: 'Ext User',
    });
  });

  beforeEach(() => {
    testDb.run('DELETE FROM tasks');
    testDb.run('DELETE FROM columns');
    testDb.run('DELETE FROM boards');
    testDb.run('DELETE FROM team_members');
    testDb.run('DELETE FROM teams');
  });

  describe('TaskService.reorderTasks', () => {
    test('should rewrite positions to match the provided order', async () => {
      const team = await teamService.createTeam({ name: 'Reorder Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Board' });
      const cols = boardService.getColumnsForBoard(board.id);
      const columnId = cols[0]?.id ?? '';

      const t1 = await taskService.createTask({ columnId, title: 'T1', createdBy: userId });
      const t2 = await taskService.createTask({ columnId, title: 'T2', createdBy: userId });
      const t3 = await taskService.createTask({ columnId, title: 'T3', createdBy: userId });

      await taskService.reorderTasks(columnId, [t3.id, t1.id, t2.id]);

      const reordered = taskService.getTasksForColumn(columnId).map((t) => t.title);
      expect(reordered).toEqual(['T3', 'T1', 'T2']);

      const positions = taskService.getTasksForColumn(columnId).map((t) => t.position);
      expect(positions).toEqual([0, 1, 2]);
    });

    test('should move tasks into the target column when reordering', async () => {
      const team = await teamService.createTeam({ name: 'Cross Col Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Board' });
      const cols = boardService.getColumnsForBoard(board.id);
      const colA = cols[0]?.id ?? '';
      const colB = cols[1]?.id ?? '';

      const t1 = await taskService.createTask({ columnId: colA, title: 'A1', createdBy: userId });
      const t2 = await taskService.createTask({ columnId: colB, title: 'B1', createdBy: userId });

      await taskService.reorderTasks(colA, [t1.id, t2.id]);

      expect(taskService.getTasksForColumn(colA).map((t) => t.title)).toEqual(['A1', 'B1']);
      expect(taskService.getTasksForColumn(colB)).toHaveLength(0);
    });

    test('should reject an incomplete task order', async () => {
      const team = await teamService.createTeam({ name: 'Empty Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Board' });
      const cols = boardService.getColumnsForBoard(board.id);
      const columnId = cols[0]?.id ?? '';
      await taskService.createTask({ columnId, title: 'Keep', createdBy: userId });

      await expect(taskService.reorderTasks(columnId, [])).rejects.toThrow(/missing|incomplete/i);
    });

    test('should reject task IDs that do not belong to the board', async () => {
      const teamA = await teamService.createTeam({ name: 'Board A Team', ownerId: userId });
      const teamBOwner = createTestUser(testDb, {
        id: 'other-board-owner',
        email: 'other-board@example.com',
        displayName: 'Other',
      });
      const teamB = await teamService.createTeam({ name: 'Board B Team', ownerId: teamBOwner });
      const boardA = await boardService.createBoard({ teamId: teamA.id, name: 'A' });
      const boardB = await boardService.createBoard({ teamId: teamB.id, name: 'B' });
      const colA = boardService.getColumnsForBoard(boardA.id)[0]?.id ?? '';
      const colB = boardService.getColumnsForBoard(boardB.id)[0]?.id ?? '';

      const local = await taskService.createTask({
        columnId: colA,
        title: 'Local',
        createdBy: userId,
      });
      const foreign = await taskService.createTask({
        columnId: colB,
        title: 'Foreign',
        createdBy: teamBOwner,
      });

      await expect(taskService.reorderTasks(colA, [local.id, foreign.id])).rejects.toThrow(
        /Invalid task/
      );
    });
  });

  describe('TaskService.getTasksAssignedToUser', () => {
    test('should return only tasks assigned to the given user with context', async () => {
      const team = await teamService.createTeam({ name: 'Assign Team', ownerId: userId });
      const board = await boardService.createBoard({
        teamId: team.id,
        name: 'Assign Board',
      });
      const cols = boardService.getColumnsForBoard(board.id);
      const columnId = cols[0]?.id ?? '';

      const coworkerId = createTestUser(testDb, {
        id: 'coworker-assign',
        email: 'coworker@example.com',
        displayName: 'Coworker',
      });

      const mine = await taskService.createTask({
        columnId,
        title: 'My Task',
        createdBy: userId,
      });
      await taskService.assignTask(mine.id, userId);

      const theirs = await taskService.createTask({
        columnId,
        title: 'Their Task',
        createdBy: userId,
      });
      await taskService.assignTask(theirs.id, coworkerId);

      const unassigned = await taskService.createTask({
        columnId,
        title: 'Unassigned',
        createdBy: userId,
      });

      const assigned = taskService.getTasksAssignedToUser(userId);

      expect(assigned).toHaveLength(1);
      expect(assigned[0]?.title).toBe('My Task');
      expect(assigned[0]?.columnName).toBe('Backlog');
      expect(assigned[0]?.boardName).toBe('Assign Board');
      expect(assigned[0]?.teamName).toBe('Assign Team');
      expect(assigned[0]?.teamSlug).toBe('assign-team');
      expect(theirs.id).not.toBe(unassigned.id);
    });
  });

  describe('TeamService.getTeamsForUser', () => {
    test('should aggregate member and board counts per team', async () => {
      const coworkerId = createTestUser(testDb, {
        id: 'coworker-teams',
        email: 'team-coworker@example.com',
        displayName: 'Team Coworker',
      });

      const teamA = await teamService.createTeam({ name: 'Alpha', ownerId: userId });
      const teamB = await teamService.createTeam({ name: 'Beta', ownerId: userId });

      teamService.addMember(teamA.id, coworkerId, 'member');
      await boardService.createBoard({ teamId: teamA.id, name: 'A Board 1' });
      await boardService.createBoard({ teamId: teamA.id, name: 'A Board 2' });
      await boardService.createBoard({ teamId: teamB.id, name: 'B Board 1' });

      const teams = teamService.getTeamsForUser(userId);
      expect(teams).toHaveLength(2);
      expect(teams.map((t) => t.name)).toEqual(['Alpha', 'Beta']);

      const alpha = teams.find((t) => t.name === 'Alpha');
      expect(alpha?.memberCount).toBe(2);
      expect(alpha?.boardCount).toBe(2);

      const beta = teams.find((t) => t.name === 'Beta');
      expect(beta?.memberCount).toBe(1);
      expect(beta?.boardCount).toBe(1);
    });

    test('should not return teams the user is not a member of', async () => {
      const ownerId = createTestUser(testDb, {
        id: 'other-owner',
        email: 'other-owner@example.com',
        displayName: 'Other Owner',
      });
      await teamService.createTeam({ name: 'Excluded', ownerId });

      expect(teamService.getTeamsForUser(userId)).toHaveLength(0);
    });
  });

  describe('Slug collision handling', () => {
    test('TeamService.createTeam should throw when slug is taken', async () => {
      await teamService.createTeam({ name: 'Design', ownerId: userId });

      await expect(teamService.createTeam({ name: 'Design!', ownerId: userId })).rejects.toThrow(
        'Team URL already taken'
      );
    });

    test('TeamService.updateTeam should throw when renaming to a conflicting slug', async () => {
      const team1 = await teamService.createTeam({ name: 'Marketing', ownerId: userId });
      await teamService.createTeam({ name: 'Sales', ownerId: userId });

      await expect(teamService.updateTeam(team1.id, { name: 'Sales' })).rejects.toThrow(
        'Team URL already taken'
      );
    });

    test('BoardService.createBoard should throw when slug is taken within a team', async () => {
      const team = await teamService.createTeam({ name: 'Eng', ownerId: userId });
      await boardService.createBoard({ teamId: team.id, name: 'Sprint' });

      await expect(boardService.createBoard({ teamId: team.id, name: 'Sprint?' })).rejects.toThrow(
        'Board URL already taken for this team'
      );
    });

    test('BoardService should allow the same board slug in different teams', async () => {
      const teamA = await teamService.createTeam({ name: 'Team A', ownerId: userId });
      const teamB = await teamService.createTeam({ name: 'Team B', ownerId: userId });

      const boardA = await boardService.createBoard({ teamId: teamA.id, name: 'Backlog' });
      const boardB = await boardService.createBoard({ teamId: teamB.id, name: 'Backlog' });

      expect(boardA.slug).toBe('backlog');
      expect(boardB.slug).toBe('backlog');
      expect(boardA.id).not.toBe(boardB.id);
    });
  });

  describe('BoardService.getBySlug / getBoardsForTeam', () => {
    test('getBySlug should resolve within a team and throw when missing', async () => {
      const team = await teamService.createTeam({ name: 'Slug Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'My Board' });

      expect(boardService.getBySlug(team.id, 'my-board').id).toBe(board.id);
      expect(() => boardService.getBySlug(team.id, 'nope')).toThrow('Board not found');
    });

    test('getBoardsForTeam should include column and task counts', async () => {
      const team = await teamService.createTeam({ name: 'Counts Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Counted' });
      const cols = boardService.getColumnsForBoard(board.id);
      const columnId = cols[0]?.id ?? '';
      await taskService.createTask({ columnId, title: 'T1', createdBy: userId });
      await taskService.createTask({ columnId, title: 'T2', createdBy: userId });

      const boards = boardService.getBoardsForTeam(team.id);
      expect(boards).toHaveLength(1);
      expect(boards[0]?.columnCount).toBe(4);
      expect(boards[0]?.taskCount).toBe(2);
    });
  });

  describe('BoardService.getColumnById', () => {
    test('should throw when the column does not exist', () => {
      expect(() => boardService.getColumnById('missing-column')).toThrow('Column not found');
    });

    test('should respect the provided column position on create', async () => {
      const team = await teamService.createTeam({ name: 'Pos Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Pos Board' });

      const custom = await boardService.createColumn({
        boardId: board.id,
        name: 'Custom',
        position: 10,
        color: '#abc',
        wipLimit: 4,
      });

      expect(custom.position).toBe(10);
      expect(custom.color).toBe('#abc');
      expect(custom.wipLimit).toBe(4);

      const reused = createTestColumn(testDb, board.id, { name: 'Reused' });
      expect(reused).toBeTruthy();
    });
  });

  // ─── Coverage gap fillers: error paths & remaining branches ───

  describe('TaskService remaining branches', () => {
    test('getByIdWithDetails should throw when the task does not exist', () => {
      expect(() => taskService.getByIdWithDetails('missing-task')).toThrow('Task not found');
    });

    test('getTasksForBoard should return every task ordered by column then position', async () => {
      const team = await teamService.createTeam({ name: 'Board Tasks Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Multi' });
      const cols = boardService.getColumnsForBoard(board.id);
      const backlog = cols[0]?.id ?? '';
      const todo = cols[1]?.id ?? '';

      await taskService.createTask({ columnId: todo, title: 'T1', createdBy: userId });
      await taskService.createTask({ columnId: backlog, title: 'B1', createdBy: userId });
      await taskService.createTask({ columnId: backlog, title: 'B2', createdBy: userId });

      const tasks = taskService.getTasksForBoard(board.id);
      expect(tasks.map((t) => t.title)).toEqual(['B1', 'B2', 'T1']);
      expect(tasks.every((t) => t.columnBoardId === board.id)).toBe(true);
      expect(tasks.every((t) => t.columnTeamId === team.id)).toBe(true);
      expect(tasks[0]?.creatorName).toBe('Ext User');
    });

    test('updateTask should clear nullable fields and move column/position', async () => {
      const team = await teamService.createTeam({ name: 'Update Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Update Board' });
      const cols = boardService.getColumnsForBoard(board.id);
      const colA = cols[0]?.id ?? '';
      const colB = cols[1]?.id ?? '';

      const task = await taskService.createTask({
        columnId: colA,
        title: 'Original',
        description: 'desc',
        priority: 'low',
        createdBy: userId,
      });
      await taskService.assignTask(task.id, userId);

      // Move to colB at position 0, update description, and clear assignee
      const updated = await taskService.updateTask(task.id, {
        columnId: colB,
        position: 0,
        assigneeId: null,
        description: 'updated',
      });

      expect(updated.columnId).toBe(colB);
      expect(updated.position).toBe(0);
      expect(updated.assigneeId).toBeNull();
      expect(updated.description).toBe('updated');
    });

    test('updateTask should clear a due date when passed null', async () => {
      const team = await teamService.createTeam({ name: 'Due Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Due Board' });
      const columnId = boardService.getColumnsForBoard(board.id)[0]?.id ?? '';

      const task = await taskService.createTask({
        columnId,
        title: 'Due',
        dueDate: new Date('2026-12-31'),
        createdBy: userId,
      });
      expect(task.dueDate).not.toBeNull();

      const cleared = await taskService.updateTask(task.id, { dueDate: null });
      expect(cleared.dueDate).toBeNull();
    });

    test('assignTask should support unassigning via null', async () => {
      const team = await teamService.createTeam({ name: 'Assign Null Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'AN Board' });
      const columnId = boardService.getColumnsForBoard(board.id)[0]?.id ?? '';

      const task = await taskService.createTask({ columnId, title: 'T', createdBy: userId });
      await taskService.assignTask(task.id, userId);
      expect(taskService.getByIdWithDetails(task.id).assigneeName).toBe('Ext User');

      const unassigned = await taskService.assignTask(task.id, null);
      expect(unassigned.assigneeId).toBeNull();
      expect(taskService.getByIdWithDetails(task.id).assigneeName).toBeNull();
    });
  });

  describe('TeamService remaining branches', () => {
    test('getBySlug should throw when the team does not exist', () => {
      expect(() => teamService.getBySlug('does-not-exist')).toThrow('Team not found');
    });

    test('addMember should be idempotent when the user is already a member', async () => {
      const team = await teamService.createTeam({ name: 'Idem Team', ownerId: userId });

      // Owner is already a member; adding again should not throw and should not duplicate
      const result = teamService.addMember(team.id, userId, 'member');
      expect(result).toBeDefined();
      expect(teamService.getTeamMembers(team.id)).toHaveLength(1);
      expect(teamService.isTeamMember(team.id, userId)).toBe(true);
    });

    test('getMemberRole should return null for a non-member', async () => {
      const team = await teamService.createTeam({ name: 'Role Team', ownerId: userId });
      const outsiderId = createTestUser(testDb, {
        id: 'outsider-role',
        email: 'outsider-role@example.com',
        displayName: 'Outsider',
      });

      expect(teamService.getMemberRole(team.id, outsiderId)).toBeNull();
    });

    test('isTeamOwner should be true for the owner and false for others', async () => {
      const team = await teamService.createTeam({ name: 'Owner Team', ownerId: userId });
      const coworkerId = createTestUser(testDb, {
        id: 'coworker-owner',
        email: 'coworker-owner@example.com',
        displayName: 'Coworker',
      });
      teamService.addMember(team.id, coworkerId, 'admin');

      expect(teamService.isTeamOwner(team.id, userId)).toBe(true);
      expect(teamService.isTeamOwner(team.id, coworkerId)).toBe(false);
    });
  });

  describe('BoardService remaining branches', () => {
    test('updateBoard should throw when renaming to a conflicting slug', async () => {
      const team = await teamService.createTeam({ name: 'Conflict Team', ownerId: userId });
      const boardA = await boardService.createBoard({ teamId: team.id, name: 'Alpha' });
      await boardService.createBoard({ teamId: team.id, name: 'Beta' });

      await expect(boardService.updateBoard(boardA.id, { name: 'Beta' })).rejects.toThrow(
        'Board URL already taken for this team'
      );
    });

    test('updateColumn should update position, color, and wipLimit together', async () => {
      const team = await teamService.createTeam({ name: 'Col Branch Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Col Branch Board' });
      const cols = boardService.getColumnsForBoard(board.id);
      const columnId = cols[0]?.id ?? '';

      const updated = await boardService.updateColumn(columnId, {
        position: 9,
        color: '#ff0000',
        wipLimit: 7,
      });

      expect(updated.position).toBe(9);
      expect(updated.color).toBe('#ff0000');
      expect(updated.wipLimit).toBe(7);
    });
  });

  describe('TaskService.checklist', () => {
    test('adds, lists, toggles, updates, and deletes checklist items', async () => {
      const team = await teamService.createTeam({ name: 'Checklist Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'CL Board' });
      const columnId = boardService.getColumnsForBoard(board.id)[0]?.id ?? '';
      const task = await taskService.createTask({ columnId, title: 'CL Task', createdBy: userId });

      // Add two items
      const a = taskService.addChecklistItem(task.id, 'Step one');
      const b = taskService.addChecklistItem(task.id, 'Step two');
      expect(taskService.getChecklist(task.id)).toHaveLength(2);
      expect(taskService.getChecklist(task.id)[0]?.text).toBe('Step one');

      // Toggle the first to complete
      expect(taskService.toggleChecklistItem(task.id, a.id)).toBe(true);
      expect(taskService.getChecklist(task.id).find((c) => c.id === a.id)?.completed).toBe(true);
      // Toggle back
      expect(taskService.toggleChecklistItem(task.id, a.id)).toBe(false);

      // Update text
      taskService.updateChecklistItem(task.id, b.id, 'Step two revised');
      expect(taskService.getChecklist(task.id).find((c) => c.id === b.id)?.text).toBe(
        'Step two revised'
      );

      // Delete
      taskService.deleteChecklistItem(task.id, a.id);
      expect(taskService.getChecklist(task.id)).toHaveLength(1);

      // Toggling a missing item throws
      expect(() => taskService.toggleChecklistItem(task.id, 'nope')).toThrow(
        'Checklist item not found'
      );
    });
  });

  describe('TaskService archive', () => {
    test('archives and unarchives a task, hiding it from active queries', async () => {
      const team = await teamService.createTeam({ name: 'Archive Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Arc Board' });
      const columnId = boardService.getColumnsForBoard(board.id)[0]?.id ?? '';
      const task = await taskService.createTask({
        columnId,
        title: 'To Archive',
        createdBy: userId,
      });

      expect(taskService.getById(task.id).archived).toBe(false);
      taskService.archiveTask(task.id);
      expect(taskService.getById(task.id).archived).toBe(true);
      taskService.unarchiveTask(task.id);
      expect(taskService.getById(task.id).archived).toBe(false);
    });
  });

  describe('ActivityService', () => {
    test('records and retrieves ordered activity for a task', async () => {
      const team = await teamService.createTeam({ name: 'Act Team', ownerId: userId });
      const board = await boardService.createBoard({ teamId: team.id, name: 'Act Board' });
      const columnId = boardService.getColumnsForBoard(board.id)[0]?.id ?? '';
      const task = await taskService.createTask({ columnId, title: 'Act Task', createdBy: userId });

      activityService.record(task.id, 'created', userId);
      activityService.record(task.id, 'set the priority', userId, 'high');
      activityService.record(task.id, 'archived the task', userId);

      const entries = activityService.getForTask(task.id);
      // Most recent first
      expect(entries.map((e) => e.event)).toEqual([
        'archived the task',
        'set the priority',
        'created',
      ]);
      expect(entries[1]?.detail).toBe('high');
      expect(entries[1]?.userName).toBe('Ext User');
    });
  });
});
