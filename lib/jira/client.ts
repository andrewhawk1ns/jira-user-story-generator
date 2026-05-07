/**
 * lib/jira/client.ts — server-only
 *
 * Jira REST API v3 wrapper. Automatically refreshes expired tokens and
 * persists updated tokens via the service-role Supabase client.
 */
import { createServiceClient } from '../supabase/server'
import { decrypt, encrypt, refreshAccessToken } from './oauth'
import {
  jiraMyselfSchema,
  jiraProjectSchema,
  jiraEpicSchema,
  jiraSprintSchema,
  jiraIssueSearchResultSchema,
} from '../schemas/jira'
import { buildJiraDescription, buildJiraDescriptionFromStrings, buildMinimalAdfDescription, mapPriorityToJira, normalizePriorityString } from './field-mapping'
import type { AcceptanceCriterion, StoryPriority } from '../schemas/story'
import type {
  JiraEpic,
  JiraProject,
  JiraSprint,
  JiraIssueSearchResult,
  JiraMyself,
} from '../schemas/jira'

export interface JiraStoryInput {
  title: string
  userStoryStatement: string
  acceptanceCriteria: AcceptanceCriterion[]
  priority: StoryPriority
  labels: string[]
  storyPoints?: number | null
  epicId?: string
  sprintId?: string
  projectKey: string
}

export interface JiraIssueLinkPayload {
  outwardIssueKey: string
  inwardIssueKey: string
  linkTypeName: string
}

import type { Tables } from '../supabase/types'

async function getValidToken(userId: string): Promise<{ accessToken: string; cloudId: string }> {
  const supabase = createServiceClient()
  const result = await supabase.from('jira_tokens').select('*').eq('id', userId).single()
  const error = result.error
  const data = result.data as Tables<'jira_tokens'> | null

  if (error || !data) {
    throw new Error('Jira tokens not found — user must reconnect Jira')
  }

  const now = new Date()
  const expiresAt = new Date(data.token_expires_at)

  if (expiresAt > new Date(now.getTime() + 60_000)) {
    // Token still valid for at least 1 minute
    return { accessToken: decrypt(data.encrypted_access_token), cloudId: data.jira_cloud_id }
  }

  if (!data.encrypted_refresh_token) {
    throw new Error('Jira access token expired and no refresh token available')
  }

  // Refresh the token
  const refreshed = await refreshAccessToken(data.encrypted_refresh_token)
  await supabase
    .from('jira_tokens')
    .update({
      encrypted_access_token: encrypt(refreshed.accessToken),
      encrypted_refresh_token: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : null,
      token_expires_at: refreshed.expiresAt.toISOString(),
      scopes: refreshed.scopes,
    })
    .eq('id', userId)

  return { accessToken: refreshed.accessToken, cloudId: data.jira_cloud_id }
}

async function jiraFetch<T>(userId: string, path: string, options: RequestInit = {}): Promise<T> {
  const { accessToken, cloudId } = await getValidToken(userId)
  // OAuth 2.0 (3LO) bearer tokens must use api.atlassian.com, not the instance URL
  const url = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Jira API error ${response.status} ${path}: ${body}`)
  }

  return response.json() as Promise<T>
}

// ── API methods ───────────────────────────────────────────────────────────────

export async function getMyself(userId: string): Promise<JiraMyself> {
  const raw = await jiraFetch<unknown>(userId, '/myself')
  return jiraMyselfSchema.parse(raw)
}

export async function getProjects(userId: string): Promise<JiraProject[]> {
  const raw = await jiraFetch<{ values: unknown[] }>(userId, '/project/search?maxResults=100')
  return jiraProjectSchema.array().parse(raw.values)
}

export async function getEpics(userId: string, projectKey: string): Promise<JiraEpic[]> {
  const jql = encodeURIComponent(
    `project = "${projectKey}" AND issuetype = Epic ORDER BY created DESC`
  )
  const raw = await jiraFetch<{
    issues: Array<{ id: string; key: string; fields: { summary: string } }>
  }>(userId, `/search/jql?jql=${jql}&fields=key,summary&maxResults=100`)
  return jiraEpicSchema
    .array()
    .parse(raw.issues.map((i) => ({ id: i.id, key: i.key, summary: i.fields.summary })))
}

export async function getSprints(userId: string, projectKey: string): Promise<JiraSprint[]> {
  const boardsRaw = await jiraFetch<{ values: Array<{ id: number }> }>(
    userId,
    `/board?projectKeyOrId=${projectKey}&type=scrum`
  )
  if (!boardsRaw.values.length) return []
  const boardId = boardsRaw.values[0].id
  const sprintsRaw = await jiraFetch<{
    values: Array<{ id: number; name: string; state: string; goal?: string }>
  }>(userId, `/board/${boardId}/sprint?state=active,future&maxResults=50`)
  return jiraSprintSchema.array().parse(
    sprintsRaw.values.map((s) => ({
      id: String(s.id),
      name: s.name,
      state: s.state,
      goal: s.goal,
    }))
  )
}

export async function searchIssues(userId: string, jql: string): Promise<JiraIssueSearchResult[]> {
  const raw = await jiraFetch<{
    issues: Array<{
      key: string
      fields: {
        summary: string
        description?: { content?: Array<{ content?: Array<{ text?: string }> }> }
      }
    }>
  }>(userId, `/search/jql?jql=${encodeURIComponent(jql)}&fields=key,summary,description&maxResults=50`)
  return jiraIssueSearchResultSchema.array().parse(
    raw.issues.map((i) => ({
      key: i.key,
      summary: i.fields.summary,
      description: i.fields.description?.content?.[0]?.content?.[0]?.text ?? undefined,
    }))
  )
}

export interface PushResult {
  key: string
  url: string
  linkErrors: string[]
}

export async function createIssue(userId: string, story: JiraStoryInput): Promise<PushResult> {
  const fields: Record<string, unknown> = {
    project: { key: story.projectKey },
    issuetype: { name: 'Story' },
    summary: story.title,
    description: buildJiraDescription(story.userStoryStatement, story.acceptanceCriteria),
    priority: { name: mapPriorityToJira(story.priority) },
    labels: story.labels,
  }

  if (story.storyPoints !== undefined && story.storyPoints !== null) {
    const spFieldId = process.env.JIRA_STORY_POINTS_FIELD_ID
    if (spFieldId) fields[spFieldId] = story.storyPoints
  }

  if (story.epicId) {
    fields.parent = { id: story.epicId }
  }

  if (story.sprintId) {
    const sprintFieldId = process.env.JIRA_SPRINT_FIELD_ID
    if (sprintFieldId) fields[sprintFieldId] = { id: parseInt(story.sprintId, 10) }
  }

  const created = await jiraFetch<{ key: string; id: string; self: string }>(userId, '/issue', {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })

  const tokenResult = await createServiceClient()
    .from('jira_tokens')
    .select('jira_base_url')
    .eq('id', userId)
    .single()
  const tokenData = tokenResult.data as Pick<Tables<'jira_tokens'>, 'jira_base_url'> | null

  const baseUrl = tokenData?.jira_base_url ?? ''
  const issueUrl = `${baseUrl}/browse/${created.key}`

  return { key: created.key, url: issueUrl, linkErrors: [] }
}

export interface JiraStoryInputRaw {
  title: string
  userStoryStatement: string
  acceptanceCriteria: string[]
  storyType: string
  priority: string
  labels: string[]
  storyPoints?: number | null
  epicKey?: string
  projectKey: string
  blockedByIssueKeys?: string[]
  blocksIssueKeys?: string[]
}

const ISSUE_TYPE_MAP: Record<string, string> = {
  'user story': 'Story',
  'bug': 'Bug',
  'task': 'Task',
  'sub-task': 'Sub-task',
}

function mapIssueType(storyType: string): string {
  return ISSUE_TYPE_MAP[storyType.toLowerCase()] ?? storyType
}

export async function createIssueRaw(userId: string, story: JiraStoryInputRaw): Promise<PushResult> {
  console.log('[createIssueRaw] labels:', story.labels, '| blockedBy:', story.blockedByIssueKeys, '| blocks:', story.blocksIssueKeys)
  const fields: Record<string, unknown> = {
    project: { key: story.projectKey },
    issuetype: { name: mapIssueType(story.storyType || 'Story') },
    summary: story.title,
    description: buildJiraDescriptionFromStrings(story.userStoryStatement, story.acceptanceCriteria),
    priority: { name: normalizePriorityString(story.priority) },
  }

  if (story.labels.length > 0) {
    fields.labels = story.labels
  }

  if (story.storyPoints != null) {
    const spFieldId = process.env.JIRA_STORY_POINTS_FIELD_ID
    if (spFieldId && /^customfield_\d+$/.test(spFieldId)) {
      fields[spFieldId] = story.storyPoints
    }
  }

  if (story.epicKey) {
    fields.parent = { key: story.epicKey }
  }

  async function attemptCreate(f: Record<string, unknown>) {
    return jiraFetch<{ key: string; id: string; self: string }>(userId, '/issue', {
      method: 'POST',
      body: JSON.stringify({ fields: f }),
    })
  }

  let created: { key: string; id: string; self: string }
  try {
    created = await attemptCreate(fields)
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('INVALID_INPUT'))) throw err
    // Retry 1: strip priority + parent (next-gen/team-managed projects reject these)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { priority: _p, parent: _pa, ...fieldsNoClassic } = fields
    try {
      created = await attemptCreate(fieldsNoClassic)
    } catch (err2) {
      if (!(err2 instanceof Error && err2.message.includes('INVALID_INPUT'))) throw err2
      // Retry 2: also swap description for minimal paragraph-only ADF (no headings)
      created = await attemptCreate({
        ...fieldsNoClassic,
        description: buildMinimalAdfDescription(story.userStoryStatement, story.acceptanceCriteria),
      })
    }
  }

  const tokenResult = await createServiceClient()
    .from('jira_tokens')
    .select('jira_base_url')
    .eq('id', userId)
    .single()
  const tokenData = tokenResult.data as Pick<Tables<'jira_tokens'>, 'jira_base_url'> | null
  const baseUrl = tokenData?.jira_base_url ?? ''

  // Create issue links (best-effort — failures collected, not thrown)
  const linkErrors: string[] = []
  const linksToCreate: Array<{ inward: string; outward: string; typeName: string }> = []

  for (const blockerKey of story.blockedByIssueKeys ?? []) {
    // "is blocked by" — inward issue blocks outward (created) issue
    linksToCreate.push({ inward: blockerKey, outward: created.key, typeName: 'Blocks' })
  }
  for (const blockedKey of story.blocksIssueKeys ?? []) {
    // created issue blocks the outward issue
    linksToCreate.push({ inward: created.key, outward: blockedKey, typeName: 'Blocks' })
  }

  for (const link of linksToCreate) {
    try {
      await createIssueLink(userId, {
        inwardIssueKey: link.inward,
        outwardIssueKey: link.outward,
        linkTypeName: link.typeName,
      })
    } catch (err) {
      linkErrors.push(
        `Failed to link ${link.inward} → ${link.outward}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return { key: created.key, url: `${baseUrl}/browse/${created.key}`, linkErrors }
}

export async function createIssueLink(  userId: string,
  payload: JiraIssueLinkPayload
): Promise<void> {
  await jiraFetch<void>(userId, '/issueLink', {
    method: 'POST',
    body: JSON.stringify({
      type: { name: payload.linkTypeName },
      inwardIssue: { key: payload.inwardIssueKey },
      outwardIssue: { key: payload.outwardIssueKey },
    }),
  })
}
