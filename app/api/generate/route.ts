import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateRequestSchema } from '@/lib/schemas/session'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Schema for the synchronous n8n response array
const n8nStorySchema = z.object({
  storyData: z
    .object({
      title: z.string(),
      description: z.string(),
      acceptanceCriteria: z.array(z.string()).optional(),
      storyPoints: z.number().optional(),
      labels: z.array(z.string()).optional(),
      blockedByIssueKeys: z.array(z.string()).optional(),
      blocksIssueKeys: z.array(z.string()).optional(),
    })
    .optional(),
  title: z.string(),
  description: z.string().optional(),
  acceptanceCriteria: z.union([z.string(), z.array(z.string())]).optional(),
  storyPoints: z.number().optional(),
  labels: z.array(z.string()).optional(),
  blockedByIssueKeys: z.array(z.string()).optional(),
  blocksIssueKeys: z.array(z.string()).optional(),
})

// chainLlm + structured parser returns { output: { stories: [...] } }
// webhook responseMode: 'lastNode' returns firstEntryJson = that $json object
const n8nResponseSchema = z.object({
  output: z.object({
    stories: z.array(n8nStorySchema),
  }),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = generateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { type, sourceText, audioPath, jiraProjectKey, epicId, sprintId, outputLanguage, storyType, priority, maxStories, dependencies } = parsed.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceClient = createServiceClient() as any

  // Create the generation session row
  const { data: session, error: sessionError } = await serviceClient
    .from('generation_sessions')
    .insert({
      user_id: user.id,
      session_type: type,
      source_input_text: sourceText ?? null,
      source_input_audio_path: audioPath ?? null,
      jira_project_key: jiraProjectKey,
      jira_epic_id: epicId ?? null,
      jira_sprint_id: sprintId ?? null,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    console.error('[generate] Failed to create session:', sessionError)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  const sessionId = session.id

  // Trigger n8n webhook
  const webhookUrl = process.env.N8N_WEBHOOK_URL
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    // Mark session as error and return
    await serviceClient
      .from('generation_sessions')
      .update({ status: 'error', error_message: 'N8N_WEBHOOK_URL not configured' })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  try {
    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'x-webhook-secret': webhookSecret } : {}),
      },
      body: JSON.stringify({
        sessionId,
        userId: user.id,
        type,
        sourceText: sourceText ?? null,
        audioPath: audioPath ?? null,
        jiraProjectKey,
        epicId: epicId ?? null,
        sprintId: sprintId ?? null,
        outputLanguage: outputLanguage ?? 'English',
        storyType: storyType ?? 'User Story',
        priority: priority ?? 'Medium',
        maxStories: maxStories ?? 6,
        dependencies: dependencies ?? [],
      }),
    })

    const responseText = await n8nResponse.text()
    console.log('[generate] n8n raw response status:', n8nResponse.status)
    console.log('[generate] n8n raw response body:', responseText.slice(0, 500))

    if (!n8nResponse.ok) {
      throw new Error(`n8n returned ${n8nResponse.status}: ${responseText}`)
    }

    if (!responseText || responseText.trim() === '') {
      throw new Error('n8n returned an empty response body')
    }

    // n8n returns stories synchronously in the response body
    let rawJson: unknown
    try {
      rawJson = JSON.parse(responseText)
    } catch {
      throw new Error(`n8n response is not valid JSON: ${responseText.slice(0, 200)}`)
    }

    // Handle toxicity rejection from n8n
    if (
      typeof rawJson === 'object' &&
      rawJson !== null &&
      'error' in rawJson &&
      (rawJson as Record<string, unknown>).error === 'content_rejected'
    ) {
      const message =
        typeof (rawJson as Record<string, unknown>).message === 'string'
          ? ((rawJson as Record<string, unknown>).message as string)
          : 'Your input was rejected. Please revise it and try again.'
      await serviceClient
        .from('generation_sessions')
        .update({ status: 'error', error_message: message })
        .eq('id', sessionId)
      return NextResponse.json({ error: 'content_rejected', message }, { status: 422 })
    }

    const parsedStories = n8nResponseSchema.safeParse(rawJson)

    if (!parsedStories.success) {
      throw new Error(`Unexpected n8n response shape: ${JSON.stringify(rawJson).slice(0, 200)}`)
    }

    // Map n8n stories to DB rows
    const storyRows = parsedStories.data.output.stories.map((s, index) => {
      // Prefer storyData if present, fall back to top-level fields
      const title = s.storyData?.title ?? s.title
      const userStoryStatement = s.storyData?.description ?? s.description ?? ''
      // Normalise acceptance criteria to string[]
      const rawAC = s.storyData?.acceptanceCriteria ?? s.acceptanceCriteria
      const acceptanceCriteria: string[] = Array.isArray(rawAC)
        ? rawAC
        : rawAC
          ? rawAC.split(/\n-?\s*/).map((l) => l.trim()).filter(Boolean)
          : []

      const storyPoints = s.storyData?.storyPoints ?? s.storyPoints ?? null
      const labels = s.storyData?.labels ?? s.labels ?? []
      const blockedByIssueKeys = s.storyData?.blockedByIssueKeys ?? s.blockedByIssueKeys ?? []
      const blocksIssueKeys = s.storyData?.blocksIssueKeys ?? s.blocksIssueKeys ?? []

      return {
        session_id: sessionId,
        user_id: user.id,
        title,
        user_story_statement: userStoryStatement,
        acceptance_criteria: acceptanceCriteria,
        story_points: storyPoints,
        labels,
        blocked_by_issue_keys: blockedByIssueKeys,
        blocks_issue_keys: blocksIssueKeys,
        generated_title: title,
        generated_user_story_statement: userStoryStatement,
        generated_acceptance_criteria: acceptanceCriteria,
        sort_order: index,
      }
    })

    const { data: insertedStories, error: insertError } = await serviceClient
      .from('generated_stories')
      .insert(storyRows)
      .select('id, title, user_story_statement, acceptance_criteria, priority, labels, story_points, status, sort_order, blocked_by_issue_keys, blocks_issue_keys')

    if (insertError) {
      throw new Error(`Failed to save stories: ${insertError.message}`)
    }

    // Mark session ready
    await serviceClient
      .from('generation_sessions')
      .update({ status: 'ready' })
      .eq('id', sessionId)

    return NextResponse.json({ sessionId, stories: insertedStories ?? [] }, { status: 200 })
  } catch (err) {
    console.error('[generate] n8n trigger failed:', err)
    await serviceClient
      .from('generation_sessions')
      .update({ status: 'error', error_message: String(err) })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Failed to trigger generation' }, { status: 502 })
  }
}
