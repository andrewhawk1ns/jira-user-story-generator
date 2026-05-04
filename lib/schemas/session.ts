import { z } from 'zod'

export const sessionTypeSchema = z.enum(['requirements', 'sprint', 'meeting', 'ac_enrichment'])

export const sessionStatusSchema = z.enum([
  'generating',
  'ready',
  'error',
  'in_review',
  'approved',
  'pushed',
])

/** Request body for POST /api/generate */
export const generateRequestSchema = z
  .object({
    type: sessionTypeSchema,
    sourceText: z.string().optional(),
    audioPath: z.string().optional(),
    jiraProjectKey: z.string().min(1),
    epicId: z.string().optional(),
    sprintId: z.string().optional(),
    contextTicketIds: z.array(z.string()).optional(),
  })
  .refine((data) => data.sourceText || data.audioPath, {
    message: 'Either sourceText or audioPath is required',
    path: ['sourceText'],
  })
  .refine((data) => !data.sourceText || data.sourceText.trim().split(/\s+/).length >= 10, {
    message: 'sourceText must be at least 10 words',
    path: ['sourceText'],
  })

export type SessionType = z.infer<typeof sessionTypeSchema>
export type SessionStatus = z.infer<typeof sessionStatusSchema>
export type GenerateRequest = z.infer<typeof generateRequestSchema>
