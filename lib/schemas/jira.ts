import { z } from 'zod'

export const jiraProjectSchema = z.object({
  key: z.string(),
  name: z.string(),
  avatarUrl: z.string().optional(),
})

export const jiraEpicSchema = z.object({
  id: z.string(),
  key: z.string(),
  summary: z.string(),
})

export const jiraSprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.enum(['active', 'future', 'closed']),
  goal: z.string().optional(),
})

export const jiraIssueSearchResultSchema = z.object({
  key: z.string(),
  summary: z.string(),
  description: z.string().optional(),
})

/** Raw Jira REST API /rest/api/3/myself response */
export const jiraMyselfSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  emailAddress: z.string().optional(),
})

/** Jira OAuth token exchange response */
export const jiraTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string(),
  token_type: z.string(),
})

/** Jira accessible resources (cloud instances) */
export const jiraAccessibleResourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
})

export type JiraProject = z.infer<typeof jiraProjectSchema>
export type JiraEpic = z.infer<typeof jiraEpicSchema>
export type JiraSprint = z.infer<typeof jiraSprintSchema>
export type JiraIssueSearchResult = z.infer<typeof jiraIssueSearchResultSchema>
export type JiraMyself = z.infer<typeof jiraMyselfSchema>
export type JiraTokenResponse = z.infer<typeof jiraTokenResponseSchema>
export type JiraAccessibleResource = z.infer<typeof jiraAccessibleResourceSchema>
