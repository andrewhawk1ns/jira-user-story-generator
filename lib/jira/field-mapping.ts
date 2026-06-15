/**
 * lib/jira/field-mapping.ts
 *
 * Maps internal domain values to Jira REST API field formats.
 * Reference: specs/001-ai-user-story-generator/contracts/jira-field-mapping.md
 */
import type { AcceptanceCriterion, StoryPriority } from '../schemas/story'

// ── Priority mapping ──────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<StoryPriority, string> = {
  highest: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  lowest: 'Lowest',
}

export function mapPriorityToJira(priority: StoryPriority): string {
  return PRIORITY_MAP[priority] ?? 'Medium'
}

// ── ADF document builder ──────────────────────────────────────────────────────

type AdfNode = {
  type: string
  version?: number
  attrs?: Record<string, unknown>
  content?: AdfNode[]
  text?: string
  marks?: Array<{ type: string }>
}

function adfText(text: string, bold = false): AdfNode {
  const node: AdfNode = { type: 'text', text }
  if (bold) node.marks = [{ type: 'strong' }]
  return node
}

function adfParagraph(...children: AdfNode[]): AdfNode {
  return { type: 'paragraph', content: children }
}

function adfHeading(level: 1 | 2 | 3, text: string): AdfNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [adfText(text)],
  }
}

function adfBulletList(items: AdfNode[]): AdfNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [item] }],
    })),
  }
}

/**
 * Builds an Atlassian Document Format (ADF) description node.
 *
 * Structure:
 *   ## User Story
 *   As a … I want … so that …
 *
 *   ## Acceptance Criteria
 *   • Given … When … Then …
 */
export function buildJiraDescription(
  userStoryStatement: string,
  acceptanceCriteria: AcceptanceCriterion[]
): AdfNode {
  const acItems = acceptanceCriteria.map((ac) => {
    const text = `Given ${ac.given}, When ${ac.when}, Then ${ac.then}`
    return adfText(text)
  })

  return {
    type: 'doc',
    version: 1,
    content: [
      adfHeading(2, 'User Story'),
      adfParagraph(adfText(userStoryStatement)),
      adfHeading(2, 'Acceptance Criteria'),
      acItems.length > 0 ? adfBulletList(acItems) : adfParagraph(adfText('No criteria defined.')),
    ],
  }
}

/**
 * Builds an ADF description from pre-formatted strings (e.g. from the AI output).
 * Acceptance criteria are rendered as-is (no Given/When/Then restructuring).
 */
export function buildJiraDescriptionFromStrings(
  userStoryStatement: string,
  acceptanceCriteria: string[]
): AdfNode {
  const acItems = acceptanceCriteria.map((text) => adfText(text))
  return {
    type: 'doc',
    version: 1,
    content: [
      adfHeading(2, 'User Story'),
      adfParagraph(adfText(userStoryStatement)),
      adfHeading(2, 'Acceptance Criteria'),
      acItems.length > 0 ? adfBulletList(acItems) : adfParagraph(adfText('No criteria defined.')),
    ],
  }
}

/**
 * Minimal ADF description using only paragraphs — compatible with all project types.
 */
export function buildMinimalAdfDescription(
  userStoryStatement: string,
  acceptanceCriteria: string[]
): AdfNode {
  return {
    type: 'doc',
    version: 1,
    content: [
      adfParagraph(adfText(userStoryStatement)),
      ...acceptanceCriteria.map((text) => adfParagraph(adfText(`• ${text}`))),
    ],
  }
}

/**
 * Normalises a priority string (any casing) to the Jira API value.
 */
export function normalizePriorityString(priority: string | null | undefined): string {
  const map: Record<string, string> = {
    highest: 'Highest',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    lowest: 'Lowest',
  }
  return map[(priority ?? '').toLowerCase()] ?? 'Medium'
}

// ── Issue link type names ─────────────────────────────────────────────────────

/**
 * Returns the Jira link type name for "blocks" relationships.
 * Default: "Blocks" — override via JIRA_BLOCKS_LINK_TYPE env var.
 */
export function getBlocksLinkType(): string {
  return process.env.JIRA_BLOCKS_LINK_TYPE ?? 'Blocks'
}
