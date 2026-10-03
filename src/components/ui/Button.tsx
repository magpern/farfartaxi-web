import { Link, type LinkProps } from 'react-router-dom'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
/** md >= 48 px, lg >= 56 px (driver mode), huge = the one big step button in driving mode. */
export type ButtonSize = 'md' | 'lg' | 'huge'

type Common = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; children?: ReactNode; className?: string }
type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Common> & { href?: undefined }
type AsLink = Common & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & { href: string }

export type ButtonProps = AsButton | AsLink

export function Button(props: ButtonProps) {
  const { variant = 'secondary', size = 'md', block, className, children, ...rest } = props
  const cls = ['ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`, block ? 'ui-btn-block' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  if ('href' in rest && rest.href !== undefined) {
    return (
      <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={cls}>
        {children}
      </a>
    )
  }
  const { type = 'button', ...btn } = rest as ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button {...btn} type={type} className={cls}>
      {children}
    </button>
  )
}

/** In-app navigation styled as a button (client-side routing, no page reload). */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  block,
  className,
  ...rest
}: Omit<LinkProps, 'className'> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string }) {
  const cls = ['ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`, block ? 'ui-btn-block' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return <Link {...rest} className={cls} />
}
