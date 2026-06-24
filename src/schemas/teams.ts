import { z } from 'zod';

const nameMin = 'Name must be at least 2 characters';

// ─── Team CRUD ───────────────────────────────────────────────────────────────

export const createTeamSchema = z.object({
  name: z.string().trim().min(2, nameMin).max(100),
  description: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().trim().max(500).optional()
  ),
});

export const updateTeamSchema = z.object({
  name: z.string().trim().min(2, nameMin).max(100).optional(),
  description: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().trim().max(500).optional()
  ),
});

// ─── Team join ───────────────────────────────────────────────────────────────

/** Accept a full invite URL (preferred) or "slug?token=..." / separate fields. */
export const joinTeamSchema = z
  .object({
    teamSlug: z.string().trim().min(2, 'Please paste a full invite link').optional(),
    inviteToken: z.string().trim().optional(),
  })
  .transform((data) => {
    let slug = data.teamSlug?.trim() ?? '';
    let token = data.inviteToken?.trim() ?? '';

    // Full URL: http://host/teams/{slug}/join?token=...
    if (slug.includes('/teams/')) {
      try {
        const asUrl = slug.includes('://') ? new URL(slug) : new URL(slug, 'http://localhost');
        const parts = asUrl.pathname.split('/').filter(Boolean);
        // ["teams", "{slug}", "join"]
        const teamsIdx = parts.indexOf('teams');
        if (teamsIdx >= 0 && parts[teamsIdx + 1]) {
          slug = parts[teamsIdx + 1] ?? slug;
        }
        const qToken = asUrl.searchParams.get('token');
        if (qToken) token = qToken;
      } catch {
        const parts = slug.split('/teams/');
        const rest = parts[1] ?? '';
        slug = rest.split(/[/?#]/)[0] || slug;
        const tokenMatch = rest.match(/[?&]token=([^&]+)/);
        if (tokenMatch?.[1]) token = decodeURIComponent(tokenMatch[1]);
      }
    }

    return { teamSlug: slug, inviteToken: token };
  })
  .superRefine((data, ctx) => {
    if (!data.teamSlug || data.teamSlug.length < 2) {
      ctx.addIssue({
        code: 'custom',
        message: 'Please paste a full invite link',
        path: ['teamSlug'],
      });
    }
    if (!data.inviteToken) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invite link is missing a token — request a fresh invite from a team admin',
        path: ['inviteToken'],
      });
    }
  });

// ─── Member role change ──────────────────────────────────────────────────────

export const roleChangeSchema = z.object({
  role: z.enum(['admin', 'member'], { message: 'Invalid role' }),
});
