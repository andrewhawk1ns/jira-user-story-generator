import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchIssues } from '@/lib/jira/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectKey = request.nextUrl.searchParams.get('projectKey')
  const query = request.nextUrl.searchParams.get('query') ?? ''

  if (!projectKey) {
    return NextResponse.json({ error: 'projectKey is required' }, { status: 400 })
  }

  try {
    const jql = query
      ? `project = "${projectKey}" AND text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`
      : `project = "${projectKey}" ORDER BY updated DESC`

    const issues = await searchIssues(user.id, jql)
    return NextResponse.json({ issues })
  } catch (err) {
    console.error('[jira/issues/search]', err)
    return NextResponse.json({ error: 'Failed to search issues' }, { status: 500 })
  }
}
