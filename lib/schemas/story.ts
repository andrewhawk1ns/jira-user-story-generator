import { z } from 'zod'

export const acceptanceCriterionSchema = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
})

export const storyPrioritySchema = z.enum(['highest', 'high', 'medium', 'low', 'lowest'])

export const generatedStorySchema = z.object({
  title: z.string().min(1),
  userStoryStatement: z.string().min(1),
  acceptanceCriteria: z.array(acceptanceCriterionSchema),
  priority: storyPrioritySchema,
  labels: z.array(z.string()),
  storyPoints: z.number().int().positive().nullable().optional(),
})

/** Shape returned by the n8n callback for each story */
export const n8nStoryPayloadSchema = generatedStorySchema

/** Full n8n callback body */
export const n8nCallbackSchema = z.discriminatedUnion('status', [
  z.object({
    sessionId: z.string().uuid(),
    executionId: z.string(),
    status: z.literal('success'),
    stories: z.array(n8nStoryPayloadSchema),
  }),
  z.object({
    sessionId: z.string().uuid(),
    executionId: z.string(),
    status: z.literal('error'),
    errorMessage: z.string(),
  }),
])

/** Story update body from client during review */
export const storyUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  userStoryStatement: z.string().min(1).optional(),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).optional(),
  priority: storyPrioritySchema.optional(),
  labels: z.array(z.string()).optional(),
  storyPoints: z.number().int().positive().nullable().optional(),
  blockedByIssueKeys: z.array(z.string()).optional(),
  blocksIssueKeys: z.array(z.string()).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

export type AcceptanceCriterion = z.infer<typeof acceptanceCriterionSchema>
export type StoryPriority = z.infer<typeof storyPrioritySchema>
export type GeneratedStory = z.infer<typeof generatedStorySchema>
export type N8nCallback = z.infer<typeof n8nCallbackSchema>
export type StoryUpdate = z.infer<typeof storyUpdateSchema>
