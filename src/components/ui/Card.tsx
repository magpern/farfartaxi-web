import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLElement> & { tone?: 'default' | 'urgent' | 'notice' | 'highlight' }

export function Card({ tone = 'default', className, ...rest }: Props) {
  return <section {...rest} className={['ui-card', `ui-card-${tone}`, className ?? ''].filter(Boolean).join(' ')} />
}
