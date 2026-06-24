import { nanoid } from 'nanoid';
import type { z } from 'zod';
import { db } from '../config/database';
import type {
  Team,
  TeamMember,
  TeamMemberWithUser,
  TeamWithMemberCount,
} from '../models/team.model';
import { TeamRole } from '../models/team.model';
import type { createTeamSchema, updateTeamSchema } from '../schemas/teams';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { slugify } from '../utils/slug';

export type CreateTeamInput = z.infer<typeof createTeamSchema> & { ownerId: string };
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

interface DbTeam {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner_id: string;
  invite_token: string | null;
  created_at: string;
  updated_at: string;
}

function mapTeam(team: DbTeam): Team {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    description: team.description,
    ownerId: team.owner_id,
    inviteToken: team.invite_token,
    createdAt: new Date(team.created_at),
    updatedAt: new Date(team.updated_at),
  };
}

export class TeamService {
  // Create a new team
  async createTeam(input: CreateTeamInput): Promise<Team> {
    const { name, description = null, ownerId } = input;
    const slug = slugify(name);
    if (!slug) {
      throw new ValidationError('Team name must include at least one letter or number');
    }

    // Check if slug already exists
    const existingSlug = db.prepare('SELECT id FROM teams WHERE slug = ?').get(slug);
    if (existingSlug) {
      throw new ConflictError('Team URL already taken');
    }

    // Create team
    const teamId = nanoid();
    const inviteToken = nanoid(32);
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        'INSERT INTO teams (id, name, slug, description, owner_id, invite_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(teamId, name, slug, description, ownerId, inviteToken, now, now);
      db.prepare(
        'INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
      ).run(teamId, ownerId, TeamRole.Owner, now);
    })();

    return this.getById(teamId);
  }

  // Get team by ID
  getById(teamId: string): Team {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as DbTeam | undefined;

    if (!team) {
      throw new NotFoundError('Team');
    }

    return mapTeam(team);
  }

  // Get team by slug
  getBySlug(slug: string): Team {
    const team = db.prepare('SELECT * FROM teams WHERE slug = ?').get(slug) as DbTeam | undefined;

    if (!team) {
      throw new NotFoundError('Team');
    }

    return mapTeam(team);
  }

  /**
   * Ensure the team has an invite token (lazy backfill for pre-migration rows).
   * Returns the token for use in invite links.
   */
  getOrCreateInviteToken(teamId: string): string {
    const row = db.prepare('SELECT invite_token FROM teams WHERE id = ?').get(teamId) as
      | { invite_token: string | null }
      | undefined;
    if (!row) throw new NotFoundError('Team');
    if (row.invite_token) return row.invite_token;

    const token = nanoid(32);
    db.prepare('UPDATE teams SET invite_token = ?, updated_at = ? WHERE id = ?').run(
      token,
      new Date().toISOString(),
      teamId
    );
    return token;
  }

  /** Validate invite token for a team (constant-time string compare when both present). */
  validateInviteToken(teamId: string, token: string | null | undefined): boolean {
    if (!token) return false;
    const expected = this.getOrCreateInviteToken(teamId);
    if (expected.length !== token.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return mismatch === 0;
  }

  /** Rotate invite token (invalidates previous invite links). Admin/owner only (caller enforces). */
  regenerateInviteToken(teamId: string): string {
    const token = nanoid(32);
    db.prepare('UPDATE teams SET invite_token = ?, updated_at = ? WHERE id = ?').run(
      token,
      new Date().toISOString(),
      teamId
    );
    return token;
  }

  // Get teams for a user
  getTeamsForUser(userId: string): TeamWithMemberCount[] {
    const teams = db
      .prepare(
        `
        SELECT
          t.*,
          tm_count.member_count,
          b_count.board_count
        FROM teams t
        INNER JOIN team_members tm ON tm.team_id = t.id
        LEFT JOIN (
          SELECT team_id, COUNT(*) as member_count FROM team_members GROUP BY team_id
        ) tm_count ON tm_count.team_id = t.id
        LEFT JOIN (
          SELECT team_id, COUNT(*) as board_count FROM boards GROUP BY team_id
        ) b_count ON b_count.team_id = t.id
        WHERE tm.user_id = ?
        ORDER BY t.name
      `
      )
      .all(userId) as Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      owner_id: string;
      created_at: string;
      updated_at: string;
      member_count: number;
      board_count: number;
    }>;

    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      ownerId: t.owner_id,
      inviteToken: (t as { invite_token?: string | null }).invite_token ?? null,
      createdAt: new Date(t.created_at),
      updatedAt: new Date(t.updated_at),
      memberCount: t.member_count,
      boardCount: t.board_count,
    }));
  }

  // Update team
  async updateTeam(teamId: string, input: UpdateTeamInput): Promise<Team> {
    const { name, description } = input;

    if (name !== undefined) {
      // Check if new slug conflicts
      const newSlug = slugify(name);
      const existingSlug = db
        .prepare('SELECT id FROM teams WHERE slug = ? AND id != ?')
        .get(newSlug, teamId);
      if (existingSlug) {
        throw new ConflictError('Team URL already taken');
      }

      db.prepare('UPDATE teams SET name = ?, slug = ?, updated_at = ? WHERE id = ?').run(
        name,
        newSlug,
        new Date().toISOString(),
        teamId
      );
    }

    if (description !== undefined) {
      db.prepare('UPDATE teams SET description = ?, updated_at = ? WHERE id = ?').run(
        description,
        new Date().toISOString(),
        teamId
      );
    }

    return this.getById(teamId);
  }

  // Delete team
  deleteTeam(teamId: string): void {
    db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
  }

  // Add member to team
  addMember(teamId: string, userId: string, role: TeamRole = TeamRole.Member): TeamMember {
    const now = new Date().toISOString();

    try {
      db.prepare(
        'INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
      ).run(teamId, userId, role, now);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint failed')) {
        throw error;
      }
      const existing = db
        .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
        .get(teamId, userId) as TeamMember;
      if (!existing) throw error;
      return existing;
    }

    return {
      teamId,
      userId,
      role,
      joinedAt: new Date(now),
    };
  }

  // Remove member from team
  removeMember(teamId: string, userId: string): void {
    db.transaction(() => {
      db.prepare(
        `UPDATE tasks SET assignee_id = NULL, updated_at = ?
         WHERE assignee_id = ? AND column_id IN (
           SELECT c.id FROM columns c JOIN boards b ON b.id = c.board_id WHERE b.team_id = ?
         )`
      ).run(new Date().toISOString(), userId, teamId);
      db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
    })();
  }

  // Update member role
  updateMemberRole(teamId: string, userId: string, role: TeamRole): void {
    db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(
      role,
      teamId,
      userId
    );
  }

  // Get members of a team
  getTeamMembers(teamId: string): TeamMemberWithUser[] {
    const members = db
      .prepare(
        `
        SELECT
          tm.team_id,
          tm.user_id,
          tm.role,
          tm.joined_at,
          u.id as user_id,
          u.email,
          u.display_name,
          u.avatar_seed
        FROM team_members tm
        INNER JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?
        ORDER BY tm.role, u.display_name
      `
      )
      .all(teamId) as Array<{
      team_id: string;
      user_id: string;
      role: string;
      joined_at: string;
      email: string;
      display_name: string;
      avatar_seed: string;
    }>;

    return members.map((m) => ({
      teamId: m.team_id,
      userId: m.user_id,
      role: m.role as TeamRole,
      joinedAt: new Date(m.joined_at),
      user: {
        id: m.user_id,
        email: m.email,
        displayName: m.display_name,
        avatarSeed: m.avatar_seed,
      },
    }));
  }

  // Check if user is a member of team
  isTeamMember(teamId: string, userId: string): boolean {
    const member = db
      .prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(teamId, userId);
    return !!member;
  }

  // Get user's role in team
  getMemberRole(teamId: string, userId: string): TeamRole | null {
    const member = db
      .prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(teamId, userId) as { role: string } | undefined;

    return member ? (member.role as TeamRole) : null;
  }

  // Check if user is owner of team
  isTeamOwner(teamId: string, userId: string): boolean {
    const team = this.getById(teamId);
    return team.ownerId === userId;
  }

  // Check if user is an admin or owner of team
  isTeamAdmin(teamId: string, userId: string): boolean {
    const role = this.getMemberRole(teamId, userId);
    return role === TeamRole.Owner || role === TeamRole.Admin;
  }
}

export const teamService = new TeamService();
