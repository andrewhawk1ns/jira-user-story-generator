import { createClient } from '@/lib/supabase/server'
import LoginClient from './(auth)/login/page'
import GeneratePage from '@/components/generate/GeneratePage'
import { getProjects } from '@/lib/jira/client'
import type { JiraProject } from '@/lib/schemas/jira'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return <LoginClient />

  const displayName = user.user_metadata?.jira_display_name ?? null
  const email = user.email ?? null

  let projects: JiraProject[] = []
  try {
    projects = await getProjects(user.id)
  } catch (err) {
    console.error('[RootPage] Failed to fetch Jira projects:', err)
  }

  return (
    <GeneratePage
      displayName={displayName}
      jiraDisplayName={displayName}
      email={email}
      projects={projects}
    />
  )
}
