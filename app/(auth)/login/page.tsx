'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  // While we attempt a silent token refresh on mount, show a loading state
  // so the user doesn't see a flash of the login button before being redirected.
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    async function trySilentRefresh() {
      try {
        const res = await fetch('/api/auth/refresh')
        if (res.ok) {
          // Session re-established — send the user straight to the app.
          window.location.href = '/'
          return
        }
      } catch {
        // Network error or server error — fall through to normal login.
      }
      setCheckingSession(false)
    }
    trySilentRefresh()
  }, [])

  async function handleContinue() {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/jira')
      if (!response.ok) throw new Error('Failed to initiate Jira login')
      const { url } = await response.json()
      window.location.href = url
    } catch {
      toast.error('Could not start Jira sign-in. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f5f7] px-4">
      <div className="flex w-full max-w-[448px] flex-col gap-8">
        {/* Logo + headings */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-center">
            <div className="flex h-[50px] items-center gap-2">
              <Image src="/logo-icon.svg" alt="Story Generator" width={36} height={36} />
              <div className="flex flex-col leading-tight">
                <span className="text-base font-bold text-[#172b4d]">Story Generator</span>
                <span className="text-[9px] text-[rgba(23,43,77,0.6)]">for Jira</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-[#172b4d]">
              Log in to continue
            </h1>
            <p className="text-sm text-[#6b778c]">Sign in with your Atlassian account</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-[10px] border border-[#dfe1e6] bg-white p-6">
          <div className="flex flex-col gap-6">
            {/* Email field + Continue button */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium tracking-tight text-[#172b4d]"
                >
                  Email address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                    <Image src="/email-icon.svg" alt="" width={16} height={16} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                    className="h-9 w-full rounded border border-[#dfe1e6] bg-[#fafbfc] pl-9 pr-3 text-sm text-[#6b778c] outline-none transition-[border-color,box-shadow] focus:border-[#0052cc] focus:bg-white focus:ring-2 focus:ring-[#0052cc]/20 placeholder:text-[#6b778c]"
                  />
                </div>
              </div>

              <button
                onClick={handleContinue}
                disabled={loading || checkingSession}
                className="h-10 w-full rounded bg-[#0052cc] text-sm font-medium text-white transition-colors hover:bg-[#0747a6] disabled:opacity-60"
              >
                {loading || checkingSession ? 'Redirecting…' : 'Continue'}
              </button>
            </div>

            {/* Can't log in + demo hint */}
            <div className="flex flex-col items-center gap-3">
              <a
                href="https://id.atlassian.com/login/resetPassword"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#0052cc] hover:underline"
              >
                Can&apos;t log in?
              </a>
              <p className="text-xs text-[#6b778c]">Demo mode: Enter any email to continue</p>
            </div>
          </div>
        </div>

        {/* Legal */}
        <p className="text-center text-xs leading-5 text-[#6b778c]">
          By continuing, you agree to Atlassian&apos;s{' '}
          <span className="cursor-pointer font-medium text-[#0052cc] hover:underline">
            Cloud Terms of Service
          </span>{' '}
          and{' '}
          <span className="cursor-pointer font-medium text-[#0052cc] hover:underline">
            Privacy Policy
          </span>
        </p>

        {/* Sign up */}
        <p className="text-center text-sm text-[#6b778c]">
          Don&apos;t have an Atlassian account?{' '}
          <a
            href="https://id.atlassian.com/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer font-medium text-[#0052cc] hover:underline"
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  )
}
