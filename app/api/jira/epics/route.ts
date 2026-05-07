import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEpics } from '@/lib/jira/client'

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
  if (!projectKey) {
    return NextResponse.json({ error: 'projectKey is required' }, { status: 400 })
  }

  try {
    const epics = await getEpics(user.id, projectKey)
    return NextResponse.json({ epics })
  } catch (err) {
    console.error('[jira/epics]', err)
    return NextResponse.json({ error: 'Failed to fetch epics' }, { status: 500 })
  }
}
