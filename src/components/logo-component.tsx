import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function Logo(props: { size?: 'small' | 'large' }) {
  const { size = 'small' } = props
  const t = useTranslations('common')
  return (
    <Link href="/" className="inline-flex items-center gap-2" aria-label={t('brandName')} role="logo">
      <svg
        width={size === 'large' ? 28 : 22}
        height={size === 'large' ? 28 : 22}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="text-primary"
      >
        <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" className="stroke-border" />
        <path
          d="M9 7.5h9.25L23 12.25V24.5H9V7.5Zm8.5 1.75v4h4M12 17h8M12 20.5h6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="23" r="2" fill="currentColor" />
      </svg>
      <span className={cn('font-semibold tracking-tight text-foreground', size === 'large' ? 'text-lg' : 'text-sm')}>
        {t('brandName')}
      </span>
    </Link>
  )
}
