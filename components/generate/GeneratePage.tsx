'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  FileText,
  CheckSquare,
  List,
  Zap,
  Users,
  Mic,
  Sparkles,
  ChevronDown,
  FileX,
  User,
  Settings,
  HelpCircle,
  LogOut,
  Mail,
  Building2,
  Loader2,
  AlertCircle,
  BookMarked,
  Tag,
  ArrowRight,
  Clock,
  Wrench,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { JiraProject } from '@/lib/schemas/jira'

type GeneratedStory = {
  id: string
  title: string
  user_story_statement: string
  acceptance_criteria: string[] | Array<{ given: string; when: string; then: string }>
  priority: string | null
  labels: string[]
  story_points: number | null
  status: 'pending' | 'approved' | 'rejected'
}

type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error'

const SESSION_TABS = [
  { id: 'requirements', label: 'Requirements', icon: FileText },
  { id: 'acceptance', label: 'Acceptance', icon: CheckSquare },
  { id: 'backlog', label: 'Backlog', icon: List },
  { id: 'sprint', label: 'Sprint', icon: Zap },
  { id: 'meeting', label: 'Meeting', icon: Users },
] as const

type SessionTab = (typeof SESSION_TABS)[number]['id']

interface GeneratePageProps {
  displayName: string | null
  jiraDisplayName: string | null
  email: string | null
  projects: JiraProject[]
}

export default function GeneratePage({ displayName, jiraDisplayName, email, projects }: GeneratePageProps) {
  const router = useRouter()
  const [sessionTab, setSessionTab] = useState<SessionTab>('requirements')
  const [inputMode, setInputMode] = useState<'text' | 'audio'>('text')
  const [requirements, setRequirements] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle')
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [stories, setStories] = useState<GeneratedStory[]>([])
  const [storyPointsMap, setStoryPointsMap] = useState<Record<string, number | null>>({})
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [sourceTextUsed, setSourceTextUsed] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<JiraProject | null>(projects[0] ?? null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)

  const name = jiraDisplayName ?? displayName ?? 'User'
  const initial = name.charAt(0).toUpperCase()

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    setDropdownOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const canGenerate = requirements.trim().split(/\s+/).filter(Boolean).length >= 10

  async function handleGenerate() {
    if (!canGenerate || generating || !selectedProject) return
    setGenerating(true)
    setGenerationStatus('generating')
    setGenerationError(null)
    setStories([])
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: sessionTab,
          sourceText: requirements,
          jiraProjectKey: selectedProject.key,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Server error ${res.status}`)
      }
      const { stories: returned } = await res.json()
      setStories(returned ?? [])
      setGeneratedAt(new Date())
      setSourceTextUsed(requirements)
      setGenerationStatus('ready')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start generation')
      setGenerationStatus('error')
      setGenerationError(err instanceof Error ? err.message : 'Failed to start generation')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7]">
      {/* Header */}
      <header className="border-b border-[#dfe1e6] bg-white">
        <div className="mx-auto flex h-[82px] max-w-[1536px] items-center justify-between px-6">
          {/* Logo */}
          <div className="flex h-[50px] items-center gap-2">
            <Image src="/logo-icon.svg" alt="Story Generator" width={36} height={36} />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold text-[#172b4d]">Story Generator</span>
              <span className="text-[9px] text-[rgba(23,43,77,0.6)]">for Jira</span>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-4">
            {/* Project selector */}
            <div className="relative flex items-center gap-2 rounded border border-[rgba(223,225,230,0.5)] bg-[rgba(223,225,230,0.3)] px-2 py-1.5" ref={projectMenuRef}>
              <span className="text-[11px] font-medium uppercase tracking-wide text-[#6b778c]">
                Project
              </span>
              <div className="h-5 w-px bg-[#dfe1e6]" />
              <button
                onClick={() => setProjectMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded border border-[#dfe1e6] bg-[#f4f5f7] px-3 py-2 text-sm font-medium text-[#172b4d] hover:bg-[#ebecf0]"
              >
                {selectedProject ? (
                  <>
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-[#0052cc] text-[11px] font-semibold text-white">
                      {selectedProject.key.slice(0, 2).toUpperCase()}
                    </span>
                    <span>{selectedProject.name}</span>
                  </>
                ) : (
                  <span className="text-[#6b778c]">Select project…</span>
                )}
                <ChevronDown className="h-4 w-4 text-[#6b778c]" />
              </button>

              {projectMenuOpen && projects.length > 0 && (
                <div className="absolute right-0 top-full mt-1 z-50 max-h-64 w-64 overflow-y-auto rounded-[10px] border border-[#dfe1e6] bg-white shadow-lg">
                  {projects.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => { setSelectedProject(p); setProjectMenuOpen(false) }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#f4f5f7] ${
                        selectedProject?.key === p.key ? 'bg-[#deebff] font-medium text-[#0052cc]' : 'text-[#172b4d]'
                      }`}
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-[#0052cc] text-[11px] font-semibold text-white">
                        {p.key.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto flex-shrink-0 text-xs text-[#6b778c]">{p.key}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* User avatar + dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0052cc] text-base font-medium text-white hover:bg-[#0747a6]"
                aria-label="Open profile menu"
              >
                {initial}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-[10px] border border-[#dfe1e6] bg-white shadow-lg">
                  {/* Name + email */}
                  <div className="border-b border-[#dfe1e6] px-4 py-3">
                    <p className="text-sm font-medium text-[#172b4d]">{name}</p>
                    <p className="text-xs text-[#6b778c]">{email ?? ''}</p>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => { setDropdownOpen(false); setProfileOpen(true) }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#172b4d] hover:bg-[#f4f5f7]"
                    >
                      <User className="h-4 w-4 text-[#6b778c]" />
                      Profile
                    </button>
                    <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#172b4d] hover:bg-[#f4f5f7]">
                      <Settings className="h-4 w-4 text-[#6b778c]" />
                      Settings
                    </button>
                    <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#172b4d] hover:bg-[#f4f5f7]">
                      <HelpCircle className="h-4 w-4 text-[#6b778c]" />
                      Help &amp; Support
                    </button>
                  </div>

                  <div className="border-t border-[#dfe1e6] py-1">
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#de350b] hover:bg-[#ffebe6]"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto flex w-full max-w-[1536px] flex-1 flex-col gap-10 px-6 py-8">
        {/* Session type tabs */}
        <div className="rounded-[10px] bg-[#dfe1e6] p-1">
          <div className="grid grid-cols-5 gap-0">
            {SESSION_TABS.map((tab) => {
              const Icon = tab.icon
              const active = sessionTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setSessionTab(tab.id)}
                  className={`flex items-center justify-center gap-2 rounded-[8px] py-1.5 text-sm font-medium text-[#172b4d] transition-colors ${
                    active ? 'bg-white shadow-sm' : 'hover:bg-[rgba(255,255,255,0.4)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Main card */}
        <div className="flex-1 rounded-[10px] border border-[#dfe1e6] bg-white">
          {/* Card header */}
          <div className="border-b border-[#dfe1e6] px-6 py-4">
            <p className="text-base font-medium text-[#172b4d]">
              Convert Business Requirements to User Stories
            </p>
            <p className="mt-0.5 text-sm text-[#6b778c]">
              Transform business requirements into well-structured Jira user stories with proper
              formatting
            </p>
          </div>

          {/* Card content */}
          <div className="flex gap-6 p-6">
            {/* Left panel */}
            <div className="flex w-1/2 flex-col gap-4">
              {/* Text / Audio toggle */}
              <div className="rounded-[10px] bg-[#dfe1e6] p-1">
                <div className="grid grid-cols-2">
                  {(['text', 'audio'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setInputMode(mode)}
                      className={`flex items-center justify-center gap-2 rounded-[8px] py-1.5 text-sm font-medium text-[#172b4d] transition-colors ${
                        inputMode === mode ? 'bg-white shadow-sm' : 'hover:bg-[rgba(255,255,255,0.4)]'
                      }`}
                    >
                      {mode === 'audio' && <Mic className="h-4 w-4" />}
                      {mode === 'text' ? 'Text Input' : 'Audio Recording'}
                    </button>
                  ))}
                </div>
              </div>

              {inputMode === 'text' ? (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[#172b4d]">
                    Business Requirements
                  </label>
                  <textarea
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    placeholder={`Paste your business requirements here...\n\nExample:\nUsers need to be able to filter the dashboard by date range to view historical data. This will help them analyze trends over specific time periods.`}
                    className="h-[300px] w-full resize-none rounded border border-[#dfe1e6] bg-[#fafbfc] px-3 py-2 font-mono text-sm text-[#172b4d] outline-none placeholder:text-[#6b778c] focus:border-[#0052cc] focus:bg-white focus:ring-2 focus:ring-[#0052cc]/20"
                  />
                  <p className={`text-right text-xs ${canGenerate ? 'text-[#6b778c]' : 'text-[#de350b]'}`}>
                    {requirements.trim().split(/\s+/).filter(Boolean).length} / 10 words minimum
                  </p>
                </div>
              ) : (
                <div className="flex h-[332px] flex-col items-center justify-center gap-3 rounded border border-[#dfe1e6] bg-[#fafbfc]">
                  <button className="flex items-center gap-2 rounded border border-[#dfe1e6] bg-white px-4 py-2 text-sm font-medium text-[#172b4d] hover:bg-[#f4f5f7]">
                    <Mic className="h-4 w-4 text-[#0052cc]" />
                    Start Recording
                  </button>
                  <p className="text-xs text-[#6b778c]">Record your requirements as audio</p>
                </div>
              )}

              {/* Output language */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[#172b4d]">Output Language</label>
                <button className="flex h-9 w-full items-center justify-between rounded border border-[#dfe1e6] bg-[#fafbfc] px-3 py-2 text-sm font-medium text-[#172b4d] hover:bg-[#f4f5f7]">
                  <span className="flex items-center gap-2">
                    <span>🇬🇧</span>
                    <span>English</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-[#6b778c]" />
                </button>
              </div>

              {/* Additional options */}
              <div className="rounded-[6px] border border-[#dfe1e6]">
                <button className="flex h-[52px] w-full items-center justify-between px-4 text-sm font-medium text-[#172b4d]">
                  Additional Options (Optional)
                  <ChevronDown className="h-4 w-4 text-[#6b778c]" />
                </button>
              </div>

              {/* Generate button */}
              {!selectedProject && (
                <p className="text-center text-xs text-[#de350b]">Select a Jira project to continue</p>
              )}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || generating || !selectedProject}
                className="flex h-10 w-full items-center justify-center gap-2 rounded bg-[#0052cc] text-sm font-medium text-white transition-colors hover:bg-[#0747a6] disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? 'Generating…' : 'Generate User Stories'}
              </button>
            </div>

            {/* Right panel — generated stories */}
            <div className="flex w-1/2 flex-col gap-4">
              <p className="text-sm font-medium text-[#172b4d]">Generated Story</p>

              {generationStatus === 'idle' && (
                <div className="flex flex-1 flex-col items-center justify-center rounded-[10px] border border-[#dfe1e6] bg-white py-40">
                  <FileX className="h-12 w-12 text-[#dfe1e6]" />
                  <p className="mt-4 text-base text-[#6b778c]">Your generated story will appear here</p>
                </div>
              )}

              {generationStatus === 'generating' && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[10px] border border-[#dfe1e6] bg-white py-40">
                  <Loader2 className="h-10 w-10 animate-spin text-[#0052cc]" />
                  <p className="text-sm text-[#6b778c]">Generating user stories…</p>
                  <p className="text-xs text-[#6b778c]">This usually takes 20–60 seconds</p>
                </div>
              )}

              {generationStatus === 'error' && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[10px] border border-[#dfe1e6] bg-white py-40">
                  <AlertCircle className="h-10 w-10 text-[#de350b]" />
                  <p className="text-sm font-medium text-[#de350b]">Generation failed</p>
                  <p className="max-w-xs text-center text-xs text-[#6b778c]">{generationError}</p>
                </div>
              )}

              {generationStatus === 'ready' && stories.length > 0 && (
                <div className="flex flex-col gap-8 overflow-y-auto">
                  {stories.map((story, storyIndex) => {
                    const pts = storyPointsMap[story.id] ?? story.story_points
                    const ac = Array.isArray(story.acceptance_criteria) ? story.acceptance_criteria : []
                    const normalizedAC: string[] = ac.map((item) =>
                      typeof item === 'string'
                        ? item
                        : `Given ${(item as { given: string; when: string; then: string }).given}, when ${(item as { given: string; when: string; then: string }).when}, then ${(item as { given: string; when: string; then: string }).then}`
                    )
                    const displayLabels =
                      story.labels && story.labels.length > 0
                        ? story.labels
                        : [
                            'user-story',
                            story.priority ? `${story.priority.toLowerCase()}-priority` : 'medium-priority',
                            'needs-refinement',
                          ]

                    return (
                      <div key={story.id} className="flex flex-col gap-4">
                        {stories.length > 1 && (
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#6b778c]">
                            Story {storyIndex + 1} of {stories.length}
                          </p>
                        )}

                        {/* Story points + Create Jira Ticket */}
                        <div className="rounded-[10px] border border-[#dfe1e6] bg-white px-4 py-4">
                          <div className="flex items-center justify-between">
                            <div className="relative">
                              <select
                                value={pts ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : null
                                  setStoryPointsMap((prev) => ({ ...prev, [story.id]: val }))
                                }}
                                className="h-9 appearance-none rounded border border-[#dfe1e6] bg-[#fafbfc] pl-3 pr-8 text-sm font-medium text-[#172b4d] focus:border-[#0052cc] focus:outline-none"
                              >
                                <option value="">— Points</option>
                                {[1, 2, 3, 5, 8, 13].map((n) => (
                                  <option key={n} value={n}>
                                    {n} {n === 1 ? 'Point' : 'Points'}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-[#6b778c]" />
                            </div>
                            <button className="flex items-center gap-1.5 rounded bg-[#0052cc] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0747a6]">
                              <ExternalLink className="h-4 w-4" />
                              Create Jira Ticket
                            </button>
                          </div>
                        </div>

                        {/* Title */}
                        <div className="rounded-[10px] border border-[#dfe1e6] bg-white px-4 py-4">
                          <div className="mb-4 flex items-center gap-2">
                            <BookMarked className="h-4 w-4 text-[#0052cc]" />
                            <h3 className="text-lg font-semibold text-[#172b4d]">Title</h3>
                          </div>
                          <p className="mb-4 text-lg font-medium text-[#172b4d]">{story.title}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded border border-[#dfe1e6] px-2 py-0.5 text-xs font-medium text-[#172b4d]">
                              User Story
                            </span>
                            <span className="rounded border border-[#dfe1e6] px-2 py-0.5 text-xs font-medium capitalize text-[#172b4d]">
                              {story.priority ?? 'Medium'}
                            </span>
                          </div>
                        </div>

                        {/* User Story */}
                        <div className="rounded-[10px] border border-[#dfe1e6] bg-[rgba(222,235,255,0.3)] px-4 py-4">
                          <div className="mb-4 flex items-center gap-2">
                            <User className="h-4 w-4 text-[#0052cc]" />
                            <h3 className="text-lg font-semibold text-[#172b4d]">User Story</h3>
                          </div>
                          <p className="text-sm italic text-[#172b4d]">{story.user_story_statement}</p>
                        </div>

                        {/* Acceptance Criteria */}
                        <div className="rounded-[10px] border border-[#dfe1e6] bg-white px-4 py-4">
                          <div className="mb-4 flex items-center gap-2">
                            <CheckSquare className="h-4 w-4 text-[#0052cc]" />
                            <h3 className="text-lg font-semibold text-[#172b4d]">Acceptance Criteria</h3>
                          </div>
                          <ul className="flex flex-col gap-2">
                            {normalizedAC.map((criterion, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-[#6b778c]">
                                <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-[#6b778c]" />
                                {criterion}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Technical Notes */}
                        <div className="rounded-[10px] border border-[#dfe1e6] bg-white px-4 py-4">
                          <div className="mb-4 flex items-center gap-2">
                            <Wrench className="h-4 w-4 text-[#0052cc]" />
                            <h3 className="text-lg font-semibold text-[#172b4d]">Technical Notes</h3>
                          </div>
                          <div className="flex flex-col gap-1 text-sm text-[#6b778c]">
                            <p>• Implementation approach: TBD</p>
                            <p>• Estimated effort: TBD</p>
                          </div>
                        </div>

                        {/* Labels */}
                        <div className="rounded-[10px] border border-[#dfe1e6] bg-white px-4 py-4">
                          <div className="mb-4 flex items-center gap-2">
                            <Tag className="h-4 w-4 text-[#0052cc]" />
                            <h3 className="text-lg font-semibold text-[#172b4d]">Labels</h3>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {displayLabels.map((label) => (
                              <span
                                key={label}
                                className="rounded bg-[#5e4db2] px-2 py-0.5 text-xs font-medium text-white"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Source Traceability */}
                        <div className="rounded-[10px] border-2 border-[rgba(0,82,204,0.2)] bg-[rgba(0,82,204,0.05)] px-4 py-4">
                          <div className="mb-4 flex items-center gap-2">
                            <ArrowRight className="h-4 w-4 text-[#0052cc]" />
                            <h3 className="text-lg font-semibold text-[#172b4d]">Source Traceability</h3>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-[#6b778c]" />
                              <span className="text-sm text-[#6b778c]">Generated:</span>
                              <span className="text-sm font-medium text-[#172b4d]">
                                {generatedAt
                                  ? generatedAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                                  : '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-[#6b778c]" />
                              <span className="text-sm text-[#6b778c]">Input Method:</span>
                              <span className="rounded bg-[#5e4db2] px-2 py-0.5 text-xs font-medium text-white">
                                {inputMode === 'text' ? '✍️ Text Input' : '🎤 Audio Recording'}
                              </span>
                            </div>
                            <div className="my-1 h-px bg-[#dfe1e6]" />
                            <div>
                              <p className="mb-1.5 text-sm font-medium text-[#6b778c]">Original Source Input:</p>
                              <div className="rounded border border-[#dfe1e6] bg-[rgba(223,225,230,0.5)] px-3 py-2">
                                <p className="whitespace-pre-wrap font-mono text-sm text-[#6b778c]">{sourceTextUsed}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#dfe1e6] bg-white">
        <div className="mx-auto max-w-[1536px] px-6 py-6 text-center text-sm text-[#6b778c]">
          © 2026 Story Generator for Jira. All rights reserved.
        </div>
      </footer>

      {/* Profile modal */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setProfileOpen(false)}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-[520px] rounded-[10px] bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-[#172b4d]">Profile Settings</h2>
            <p className="mt-0.5 text-sm text-[#6b778c]">
              View your account information and manage preferences
            </p>

            {/* Account Information */}
            <div className="mt-5">
              <p className="mb-3 text-sm font-semibold text-[#172b4d]">Account Information</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 rounded-[6px] border border-[#dfe1e6] bg-white px-4 py-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#0052cc]">
                    <User className="h-4 w-4 text-white" />
                  </span>
                  <div>
                    <p className="text-[11px] text-[#6b778c]">Name</p>
                    <p className="text-sm font-medium text-[#172b4d]">{name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-[6px] border border-[#dfe1e6] bg-white px-4 py-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#0052cc]">
                    <Mail className="h-4 w-4 text-white" />
                  </span>
                  <div>
                    <p className="text-[11px] text-[#6b778c]">Email</p>
                    <p className="text-sm font-medium text-[#172b4d]">{email ?? '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="mt-5">
              <p className="mb-3 text-sm font-semibold text-[#172b4d]">Preferences</p>
              <div className="flex items-center gap-2 text-sm text-[#172b4d]">
                <Building2 className="h-4 w-4 text-[#0052cc]" />
                <span className="font-medium">Default Project</span>
              </div>
              <button className="mt-2 flex w-full items-center justify-between rounded-[6px] border border-[#dfe1e6] bg-white px-4 py-2.5 text-sm text-[#172b4d] hover:bg-[#f4f5f7]">
                <span className="flex items-center gap-2">
                  {selectedProject ? (
                    <>
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0052cc] text-[11px] font-semibold text-white">
                        {selectedProject.key.slice(0, 2).toUpperCase()}
                      </span>
                      {selectedProject.name}
                      <span className="text-[#6b778c]">({selectedProject.key})</span>
                    </>
                  ) : (
                    <span className="text-[#6b778c]">No project selected</span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 text-[#6b778c]" />
              </button>
              <p className="mt-2 text-xs text-[#6b778c]">
                This project will be automatically selected when you log in
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setProfileOpen(false)}
                className="rounded border border-[#dfe1e6] bg-white px-4 py-2 text-sm font-medium text-[#172b4d] hover:bg-[#f4f5f7]"
              >
                Cancel
              </button>
              <button
                onClick={() => setProfileOpen(false)}
                className="rounded bg-[#0052cc] px-4 py-2 text-sm font-medium text-white hover:bg-[#0747a6]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
