/**
 * lib/utils/session-summary.ts
 *
 * Pure function to compute summary statistics for a generation session.
 * Used by /api/sessions/[id] and the session review UI.
 */

interface StoryLike {
  status: 'pending' | 'approved' | 'rejected'
  jira_issue_key: string | null
}

export interface SessionSummary {
  total: number
  approved: number
  rejected: number
  pending: number
  pushed: number
}

export function computeSessionSummary(stories: StoryLike[]): SessionSummary {
  return {
    total: stories.length,
    approved: stories.filter((s) => s.status === 'approved').length,
    rejected: stories.filter((s) => s.status === 'rejected').length,
    pending: stories.filter((s) => s.status === 'pending').length,
    pushed: stories.filter((s) => s.jira_issue_key !== null).length,
  }
}
