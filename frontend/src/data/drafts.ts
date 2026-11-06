import type { Draft } from '../types'

export const drafts = [
  {
    id: 'spring-campaign',
    title: 'Spring campaign: Make room to grow',
    author: 'Maya Chen',
    status: 'in_review',
    updatedAt: '2026-10-28T14:20:00Z',
    content: `A little more breathing room can change the way a workday feels. This spring, give your team a place to focus, share ideas, and make progress together.

Our flexible spaces are built for the way real teams work: thoughtfully planned, easy to adapt, and ready when you are. Find your next place to grow with TruePrint.

Book a tour this week and see what a better workspace can make possible.`,
  },
  {
    id: 'quarterly-release',
    title: 'Quarterly update press release',
    author: 'Jordan Patel',
    status: 'changes_requested',
    updatedAt: '2026-10-30T09:05:00Z',
    content: `TruePrint today shared its quarterly progress, including expanded customer support hours and a new set of planning resources for growing teams.

“We are seeing a 40% improvement in productivity for every customer,” said Chief Executive Officer Priya Nair. The company said the results prove that its approach is the best in the industry.

The new resources are available to all customers starting today.`,
  },
  {
    id: 'social-focus',
    title: 'Social post: A calmer Monday',
    author: 'Sam Rivera',
    status: 'draft',
    updatedAt: '2026-11-02T16:45:00Z',
    content: `Monday, meet a little more room to think.

Set up your week with a space that feels considered, not complicated. Small changes can make it easier to focus on what matters.

See ideas for your next team reset at trueprint.com/workspaces.`,
  },
  {
    id: 'customer-email',
    title: 'Customer email: Your workspace, your way',
    author: 'Alex Morgan',
    status: 'approved',
    updatedAt: '2026-11-03T11:10:00Z',
    content: `Hi Casey,

Your team has more ways to make the space work for you. Use the updated planning guide to compare layouts, collect feedback, and choose a setup that fits your day.

The guide is ready in your TruePrint account. If you'd like a hand, our team is here to help.

Thanks,
The TruePrint team`,
  },
  {
    id: 'product-page',
    title: 'Product page: Team planning toolkit',
    author: 'Taylor Brooks',
    status: 'in_review',
    updatedAt: '2026-11-05T08:30:00Z',
    content: `Plan a workspace that keeps good work moving.

The Team Planning Toolkit brings layout ideas, practical checklists, and conversation prompts together in one place. Start with your team's needs, then shape a setup that can change as you do.

Download the toolkit to get started.`,
  },
  {
    id: 'glowleaf-miracle',
    title: 'GlowLeaf Serum: Miracle claim',
    author: 'Maya Chen',
    status: 'draft',
    updatedAt: '2026-11-06T09:00:00Z',
    content: 'Experience the miracle of GlowLeaf Serum.',
  },
  {
    id: 'glowleaf-claims',
    title: 'GlowLeaf Serum: Hydration and shipping',
    author: 'Jordan Patel',
    status: 'draft',
    updatedAt: '2026-11-06T09:10:00Z',
    content: 'Our Glow Leaf serum is clinically proven to hydrate. Free shipping on every order!',
  },
  {
    id: 'glowleaf-urgency',
    title: 'GlowLeaf Serum: Limited stock promotion',
    author: 'Sam Rivera',
    status: 'draft',
    updatedAt: '2026-11-06T09:20:00Z',
    content: 'BUY NOW!!! GlowLeaf Serum is selling out fast!!!',
  },
] satisfies readonly Draft[]