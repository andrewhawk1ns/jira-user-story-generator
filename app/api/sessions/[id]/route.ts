import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

type SessionRow = Pick<Tables<'generation_sessions'>, 'id' | 'status' | 'error_message' | 'session_type' | 'created_at'>
type StoryRow = Tables<'generated_stories'>

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: session, error: sessionError } = await supabase
    .from('generation_sessions')
    .select('id, status, error_message, session_type, created_at')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single() as { data: SessionRow | null; error: unknown }

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Only return stories when ready
  if (session.status !== 'ready' && session.status !== 'in_review') {
    return NextResponse.json({ session, stories: [] })
  }

  const { data: stories, error: storiesError } = await supabase
    .from('generated_stories')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true }) as { data: StoryRow[] | null; error: unknown }

  if (storiesError) {
    return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 })
  }

  return NextResponse.json({ session, stories: stories ?? [] })
}
