import { drafts } from './drafts'

export interface DraftVersion {
  id: string
  content: string
  createdAt: string
}

export interface DraftVersionHistory {
  draftId: string
  previous: DraftVersion
  current: DraftVersion
}

const originalContent: Record<string, string> = {
  'spring-campaign': `A little more breathing room can change the way a workday feels. This spring, give your team a place to focus, share ideas, and get more done together.

Our flexible spaces are built for the way real teams work: thoughtfully planned, easy to adapt, and ready when you are. Find your next place to grow with TruePrint.

Book a tour today and see how a better workspace will transform your team.`,
  'quarterly-release': `TruePrint today shared its quarterly progress, including expanded customer support hours and new planning resources for growing teams.

“Customers are becoming more productive,” said CEO Priya Nair. The company said the results prove that its approach is the best in the industry.

The new resources will be available to customers soon.`,
  'social-focus': `Monday, make room to think.

Set up your week with a space that feels considered and simple. Small changes can make it easier to focus on what matters.

See ideas for your next team reset at trueprint.com.`,
  'customer-email': `Hi Casey,

Your team has new ways to make the space work for you. Use the planning guide to compare layouts, collect feedback, and choose a setup that fits your day.

The guide is ready in your account. If you'd like a hand, our team is here to help.

Thanks,
The TruePrint team`,
  'product-page': `Plan a workspace that helps good work move.

The Team Planning Toolkit brings layout ideas and checklists together in one place. Start with your team's needs, then shape a setup that can change as you do.

Download the toolkit.`,
  'glowleaf-miracle': 'Discover the benefits of GlowLeaf Serum.',
  'glowleaf-claims': 'Our GlowLeaf serum helps hydrate. Shipping details are available at checkout.',
  'glowleaf-urgency': 'Discover GlowLeaf Serum and find the right option for your routine.',
}

export const versions: readonly DraftVersionHistory[] = drafts.map((draft) => {
  const previousContent = originalContent[draft.id]
  if (previousContent === undefined) {
    throw new Error(`Missing original version for draft "${draft.id}"`)
  }

  return {
    draftId: draft.id,
    previous: {
      id: `${draft.id}-v1`,
      content: previousContent,
      createdAt: draft.updatedAt,
    },
    current: {
      id: `${draft.id}-v2`,
      content: draft.content,
      createdAt: draft.updatedAt,
    },
  }
})
