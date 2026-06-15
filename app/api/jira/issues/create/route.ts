import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createIssueRaw } from '@/lib/jira/client'

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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    title,
    userStoryStatement,
    acceptanceCriteria,
    storyType,
    priority,
    labels,
    storyPoints,
    epicKey,
    projectKey,
    blockedByIssueKeys,
    blocksIssueKeys,
  } = body as Record<string, unknown>

  if (!title || !projectKey) {
    return NextResponse.json({ error: 'title and projectKey are required' }, { status: 400 })
  }

  console.log('[jira/create] payload:', JSON.stringify({
    labels,
    blockedByIssueKeys,
    blocksIssueKeys,
  }))

  try {
    const result = await createIssueRaw(user.id, {
      title: String(title),
      userStoryStatement: typeof userStoryStatement === 'string' ? userStoryStatement : '',
      acceptanceCriteria: Array.isArray(acceptanceCriteria)
        ? (acceptanceCriteria as unknown[]).map(String)
        : [],
      storyType: typeof storyType === 'string' ? storyType : 'Story',
      priority: typeof priority === 'string' ? priority : 'Medium',
      labels: Array.isArray(labels) && (labels as unknown[]).length > 0 ? (labels as unknown[]).map(String) : [],
      storyPoints: typeof storyPoints === 'number' ? storyPoints : null,
      epicKey: typeof epicKey === 'string' ? epicKey : undefined,
      projectKey: String(projectKey),
      blockedByIssueKeys: Array.isArray(blockedByIssueKeys) ? (blockedByIssueKeys as unknown[]).map(String) : [],
      blocksIssueKeys: Array.isArray(blocksIssueKeys) ? (blocksIssueKeys as unknown[]).map(String) : [],
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Jira issue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
