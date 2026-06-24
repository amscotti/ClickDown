import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createTestDatabase, createTestUser } from '../test-helper';

// Initialize in-memory test database
const testDb = createTestDatabase();

// Mock the database configuration module to return our in-memory DB
mock.module('../../src/config/database', () => {
  return {
    db: testDb,
  };
});

import { boardService } from '../../src/services/board.service';
import { taskService } from '../../src/services/task.service';
// Import services after the mock has been established
import { teamService } from '../../src/services/team.service';

describe('Kanban Application Service Unit Tests', () => {
  let userId: string;

  beforeAll(() => {
    // Clear and seed a test user
    testDb.run('DELETE FROM users');
    userId = createTestUser(testDb, {
      id: 'test-user-id',
      email: 'alex@example.com',
      displayName: 'Alex Scott',
    });
  });

  beforeEach(() => {
    // Reset other tables between tests
    testDb.run('DELETE FROM team_members');
    testDb.run('DELETE FROM tasks');
    testDb.run('DELETE FROM columns');
    testDb.run('DELETE FROM boards');
    testDb.run('DELETE FROM teams');
  });

  describe('TeamService Unit Tests', () => {
    test('should create team and assign owner as member', async () => {
      const team = await teamService.createTeam({
        name: 'Design Team',
        description: 'UI/UX designers',
        ownerId: userId,
      });

      expect(team).toBeDefined();
      expect(team.name).toBe('Design Team');
      expect(team.slug).toBe('design-team');
      expect(team.description).toBe('UI/UX designers');
      expect(team.ownerId).toBe(userId);
      expect(team.inviteToken).toBeTruthy();

      // Verify owner membership
      const members = teamService.getTeamMembers(team.id);
      expect(members.length).toBe(1);
      expect(members[0]?.userId).toBe(userId);
      expect(members[0]?.role).toBe('owner');
    });

    test('should reject names that produce an empty slug', async () => {
      await expect(teamService.createTeam({ name: '日本語のみ', ownerId: userId })).rejects.toThrow(
        /letter or number/
      );
      await expect(teamService.createTeam({ name: '!!!', ownerId: userId })).rejects.toThrow(
        /letter or number/
      );
    });

    test('should fetch team by slug and id', async () => {
      const created = await teamService.createTeam({
        name: 'Marketing',
        ownerId: userId,
      });

      const byId = teamService.getById(created.id);
      expect(byId.name).toBe('Marketing');

      const bySlug = teamService.getBySlug('marketing');
      expect(bySlug.id).toBe(created.id);
    });

    test('should update team name and description', async () => {
      const created = await teamService.createTeam({
        name: 'Initial Team',
        description: 'Old description',
        ownerId: userId,
      });

      const updated = await teamService.updateTeam(created.id, {
        name: 'New Brand Team',
        description: 'Modern styling team',
      });

      expect(updated.name).toBe('New Brand Team');
      expect(updated.slug).toBe('new-brand-team');
      expect(updated.description).toBe('Modern styling team');
    });

    test('should delete team successfully', async () => {
      const team = await teamService.createTeam({
        name: 'Discard Team',
        ownerId: userId,
      });

      expect(teamService.getById(team.id)).toBeDefined();

      teamService.deleteTeam(team.id);

      expect(() => teamService.getById(team.id)).toThrow();
    });

    test('should handle team membership roles', async () => {
      const team = await teamService.createTeam({
        name: 'Growth',
        ownerId: userId,
      });

      const coworkerId = createTestUser(testDb, {
        id: 'coworker-123',
        email: 'coworker@example.com',
        displayName: 'Coworker',
      });

      // Initially not a member
      expect(teamService.isTeamMember(team.id, coworkerId)).toBe(false);

      // Add as member
      teamService.addMember(team.id, coworkerId, 'member');
      expect(teamService.isTeamMember(team.id, coworkerId)).toBe(true);
      expect(teamService.getMemberRole(team.id, coworkerId)).toBe('member');

      // Update role
      teamService.updateMemberRole(team.id, coworkerId, 'admin');
      expect(teamService.getMemberRole(team.id, coworkerId)).toBe('admin');

      // Remove member
      teamService.removeMember(team.id, coworkerId);
      expect(teamService.isTeamMember(team.id, coworkerId)).toBe(false);
    });
  });

  describe('BoardService & Column Unit Tests', () => {
    let teamId: string;

    beforeEach(async () => {
      const team = await teamService.createTeam({
        name: 'Engineering',
        ownerId: userId,
      });
      teamId = team.id;
    });

    test('should create board with default columns', async () => {
      const board = await boardService.createBoard({
        teamId,
        name: 'Sprint Board',
        description: 'Active sprint tasks',
      });

      expect(board.name).toBe('Sprint Board');
      expect(board.slug).toBe('sprint-board');

      const boardWithCols = boardService.getBoardWithColumns(board.id);
      expect(boardWithCols.columns.length).toBe(4);
      expect(boardWithCols.columns.map((c) => c.name)).toEqual([
        'Backlog',
        'To Do',
        'In Progress',
        'Done',
      ]);
    });

    test('should reject board names that produce an empty slug', async () => {
      await expect(boardService.createBoard({ teamId, name: '***' })).rejects.toThrow(
        /letter or number/
      );
    });

    test('should update board metadata', async () => {
      const board = await boardService.createBoard({
        teamId,
        name: 'Old Board Name',
      });

      const updated = await boardService.updateBoard(board.id, {
        name: 'Fresh Board Name',
        description: 'New Description',
      });

      expect(updated.name).toBe('Fresh Board Name');
      expect(updated.slug).toBe('fresh-board-name');
      expect(updated.description).toBe('New Description');
    });

    test('should delete board successfully', async () => {
      const board = await boardService.createBoard({
        teamId,
        name: 'Temporary Board',
      });

      expect(boardService.getById(board.id)).toBeDefined();

      boardService.deleteBoard(board.id);

      expect(() => boardService.getById(board.id)).toThrow();
    });

    test('should manage custom columns', async () => {
      const board = await boardService.createBoard({
        teamId,
        name: 'Kanban',
      });

      // Clear default columns first to test single custom column insertion
      testDb.run('DELETE FROM columns WHERE board_id = ?', [board.id]);

      const col = await boardService.createColumn({
        boardId: board.id,
        name: 'Review',
        position: 0,
        wipLimit: 5,
        color: '#ff9900',
      });

      expect(col.name).toBe('Review');
      expect(col.wipLimit).toBe(5);
      expect(col.color).toBe('#ff9900');

      const updatedCol = await boardService.updateColumn(col.id, {
        name: 'QA Code Review',
        wipLimit: 3,
      });
      expect(updatedCol.name).toBe('QA Code Review');
      expect(updatedCol.wipLimit).toBe(3);

      boardService.deleteColumn(col.id);
      expect(() => boardService.getColumnById(col.id)).toThrow();
    });

    test('should reorder columns correctly', async () => {
      const board = await boardService.createBoard({
        teamId,
        name: 'Dev',
      });

      const cols = boardService.getColumnsForBoard(board.id);
      const colIds = cols.map((c) => c.id);

      // Reverse column orders
      const reversedIds = [...colIds].reverse() as string[];
      await boardService.reorderColumns(board.id, reversedIds);

      const reorderedCols = boardService.getColumnsForBoard(board.id);
      expect(reorderedCols.map((c) => c.id)).toEqual(reversedIds);
      expect(reorderedCols.map((c) => c.position)).toEqual([0, 1, 2, 3]);
    });
  });

  describe('TaskService Unit Tests', () => {
    let boardId: string;
    let columnId: string;

    beforeEach(async () => {
      const team = await teamService.createTeam({
        name: 'Growth',
        ownerId: userId,
      });
      const board = await boardService.createBoard({
        teamId: team.id,
        name: 'Sprint',
      });
      boardId = board.id;

      const cols = boardService.getColumnsForBoard(board.id);
      columnId = cols[0]?.id || '';
    });

    test('should create task at correct position', async () => {
      const task1 = await taskService.createTask({
        columnId,
        title: 'Task Alpha',
        description: 'First description',
        priority: 'high',
        createdBy: userId,
      });

      expect(task1.title).toBe('Task Alpha');
      expect(task1.position).toBe(0);
      expect(task1.priority).toBe('high');

      const task2 = await taskService.createTask({
        columnId,
        title: 'Task Beta',
        createdBy: userId,
      });

      expect(task2.title).toBe('Task Beta');
      expect(task2.position).toBe(1);
    });

    test('should update task details', async () => {
      const task = await taskService.createTask({
        columnId,
        title: 'Draft Task',
        createdBy: userId,
      });

      const updated = await taskService.updateTask(task.id, {
        title: 'Polished Task Title',
        description: 'Written details',
        priority: 'urgent',
        dueDate: new Date('2026-12-31'),
      });

      expect(updated.title).toBe('Polished Task Title');
      expect(updated.description).toBe('Written details');
      expect(updated.priority).toBe('urgent');
      expect(updated.dueDate?.toISOString().slice(0, 10)).toBe('2026-12-31');
    });

    test('should move task across columns', async () => {
      const cols = boardService.getColumnsForBoard(boardId);
      const targetColumnId = cols[1]?.id || '';

      const task = await taskService.createTask({
        columnId,
        title: 'Item to Move',
        createdBy: userId,
      });

      const moved = await taskService.moveTask(task.id, {
        columnId: targetColumnId,
        position: 0,
      });

      expect(moved.columnId).toBe(targetColumnId);
      expect(moved.position).toBe(0);
    });

    test('should assign and delete tasks', async () => {
      const task = await taskService.createTask({
        columnId,
        title: 'Action Item',
        createdBy: userId,
      });

      await taskService.assignTask(task.id, userId);
      const withDetails = taskService.getByIdWithDetails(task.id);
      expect(withDetails.assigneeId).toBe(userId);
      expect(withDetails.assigneeName).toBe('Alex Scott');

      taskService.deleteTask(task.id);
      expect(() => taskService.getById(task.id)).toThrow();
    });
  });
});
