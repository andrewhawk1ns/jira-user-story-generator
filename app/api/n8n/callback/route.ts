import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { n8nCallbackSchema } from '@/lib/schemas/story'

export const dynamic = 'force-dynamic'

/**
 * POST /api/n8n/callback
 *
 * Called by n8n when generation completes (success or error).
 * Verified via a shared secret in the x-webhook-secret header.
 */
export async function POST(request: NextRequest) {
  // Verify shared secret to prevent spoofed callbacks
  const secret = process.env.N8N_WEBHOOK_SECRET
  if (secret) {
    const incoming = request.headers.get('x-webhook-secret')
    if (incoming !== secret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = n8nCallbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceClient = createServiceClient() as any
  const payload = parsed.data

  if (payload.status === 'error') {
    await serviceClient
      .from('generation_sessions')
      .update({
        status: 'error',
        error_message: payload.errorMessage,
        n8n_execution_id: payload.executionId,
      })
      .eq('id', payload.sessionId)

    return NextResponse.json({ ok: true })
  }

  // Fetch the session to get user_id
  const { data: session, error: sessionError } = await serviceClient
    .from('generation_sessions')
    .select('id, user_id')
    .eq('id', payload.sessionId)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Insert all stories
  const storyRows = payload.stories.map((story, index) => ({
    session_id: payload.sessionId,
    user_id: session.user_id,
    // Editable copies (start identical to generated)
    title: story.title,
    user_story_statement: story.userStoryStatement,
    acceptance_criteria: story.acceptanceCriteria,
    priority: story.priority,
    labels: story.labels,
    story_points: story.storyPoints ?? null,
    // Immutable originals
    generated_title: story.title,
    generated_user_story_statement: story.userStoryStatement,
    generated_acceptance_criteria: story.acceptanceCriteria,
    sort_order: index,
  }))

  const { error: insertError } = await serviceClient.from('generated_stories').insert(storyRows)

  if (insertError) {
    console.error('[n8n/callback] Failed to insert stories:', insertError)
    await serviceClient
      .from('generation_sessions')
      .update({ status: 'error', error_message: 'Failed to save generated stories' })
      .eq('id', payload.sessionId)
    return NextResponse.json({ error: 'Failed to save stories' }, { status: 500 })
  }

  // Mark session as ready for review
  await serviceClient
    .from('generation_sessions')
    .update({ status: 'ready', n8n_execution_id: payload.executionId })
    .eq('id', payload.sessionId)

  return NextResponse.json({ ok: true, count: storyRows.length })
}
