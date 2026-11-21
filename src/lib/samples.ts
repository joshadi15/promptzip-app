export interface SamplePrompt {
  id: string;
  title: string;
  category: string;
  description: string;
  prompt: string;
}

export const SAMPLE_PROMPTS: SamplePrompt[] = [
  {
    id: 'bloated-code',
    title: 'Verbose React Refactor Request',
    category: 'Code',
    description: 'Typical conversational coding prompt packed with polite filler and redundant phrasing.',
    prompt: `Hello! Could you please help me refactor a React component that I am currently working on? Basically, I would really appreciate it if you could make sure that the component handles loading states, empty states, and error boundaries in a very clean and maintainable way.

In order to do this properly, please make sure that you do not use any external third-party state management libraries like Redux or Zustand, and also please ensure that TypeScript strict types are preserved throughout the entire file. Also, please keep in mind that we are using Tailwind CSS v4 for all of the styling.

\`\`\`tsx
export function UserList({ users }: { users: any[] }) {
  return <div>{users.map(u => <span>{u.name}</span>)}</div>;
}
\`\`\`

Could you please provide the updated code as well as a brief explanation of the changes that you made? Thank you so much in advance for your help!`,
  },
  {
    id: 'slop-ui',
    title: 'AI-Slop Landing & Dashboard Prompt',
    category: 'UI',
    description: 'Vague adjectives and missing negative constraints that trigger generic AI design clichés.',
    prompt: `Please build me a modern, clean, user-friendly, and comprehensive SaaS analytics dashboard using best practices. I want it to look super professional, innovative, and engaging with a seamless user experience.

Could you create a hero section, some metric cards, a nice chart, and a table of recent activity? Make sure the design feels cutting-edge and dynamic. Thanks!`,
  },
  {
    id: 'json-payload',
    title: 'Prompt with Verbose JSON Data',
    category: 'Data',
    description: 'Embedded JSON array payload ideal for TOON tabular folding and KV structuring.',
    prompt: `I would like you to carefully analyze the following list of customer support tickets and categorize each ticket by severity level and recommended owner team. Please make sure that you return the final answer strictly as a valid JSON array without any extra markdown explanation.

Here are the tickets that you need to process:
[
  { "id": "TCK-101", "plan": "enterprise", "issue": "SSO SAML metadata signature mismatch", "latency_ms": 420, "blocking": true },
  { "id": "TCK-102", "plan": "pro", "issue": "CSV export truncates UTF-8 characters", "latency_ms": 180, "blocking": false },
  { "id": "TCK-103", "plan": "enterprise", "issue": "Webhook retry storm on 429 response", "latency_ms": 910, "blocking": true },
  { "id": "TCK-104", "plan": "starter", "issue": "Password reset email delayed 12 minutes", "latency_ms": 210, "blocking": false }
]`,
  },
  {
    id: 'slop-writing',
    title: 'Generic Technical Blog Prompt',
    category: 'Writing',
    description: 'Open-ended writing prompt missing audience, voice anchor, and cliché bans.',
    prompt: `Hey there! Could you write an engaging and comprehensive blog post about why software engineering teams should adopt edge caching in 2026? Please make sure it sounds authoritative, insightful, and easy to read for everyone. It would be great if you could cover the benefits, challenges, and future outlook.`,
  },
];
