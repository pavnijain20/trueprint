import type { DemoUser } from '../types'

export const demoUsers = [
  {
    id: 'demo-author',
    name: 'Maya Chen',
    role: 'author',
    description: 'Creates and submits branded content for review.',
  },
  {
    id: 'demo-reviewer',
    name: 'Jordan Patel',
    role: 'reviewer',
    description: 'Checks drafts against brand standards and gives feedback.',
  },
  {
    id: 'demo-approver',
    name: 'Alex Morgan',
    role: 'approver',
    description: 'Approves compliant content for publication.',
  },
  {
    id: 'demo-admin',
    name: 'Taylor Brooks',
    role: 'admin',
    description: 'Manages access, governance settings, and brand resources.',
  },
] satisfies readonly DemoUser[]