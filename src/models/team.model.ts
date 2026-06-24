export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  /** Secret for invite links; null only until lazily backfilled on legacy rows. */
  inviteToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: Date;
}

export const TEAM_ROLES = ['owner', 'admin', 'member'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TeamRole = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
} as const;

export interface TeamWithMemberCount extends Team {
  memberCount: number;
  boardCount: number;
}

export interface TeamMemberWithUser extends TeamMember {
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarSeed: string;
  };
}
