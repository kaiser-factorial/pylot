import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { LangContrast } from './LangContrast'

// Server-side MDX renderer for lesson.mdx. Fenced code becomes the read-only
// tokenized CodeBlock (no copy affordance); <LangContrast> is bound to the
// learner's profile so only the matching variant renders.

function PreAsCodeBlock(props: ComponentProps<'pre'>) {
  const child = props.children as ReactElement<{ className?: string; children?: ReactNode }>
  if (child?.props) {
    const language = child.props.className?.replace(/^language-/, '') ?? 'python'
    return <CodeBlock code={String(child.props.children ?? '')} language={language} className="my-4" />
  }
  return <pre {...props} />
}

export function LessonMdx({ mdx, profileBackground }: { mdx: string; profileBackground: string }) {
  return (
    <MDXRemote
      source={mdx}
      options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
      components={{
        pre: PreAsCodeBlock,
        LangContrast: (props: { lang: string; children: ReactNode }) => (
          <LangContrast {...props} profileBackground={profileBackground} />
        ),
      }}
    />
  )
}
