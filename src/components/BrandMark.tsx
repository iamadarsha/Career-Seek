import { clsx } from 'clsx';

export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={clsx('shrink-0', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x="3" y="3" width="58" height="58" rx="18" fill="#FF385C" />
      <path
        d="M20 28.5c0-5.2 4.2-9.5 9.5-9.5h5c5.3 0 9.5 4.3 9.5 9.5v14H20v-14Z"
        fill="#FFFFFF"
      />
      <path d="M26 20.5V18c0-3.3 2.7-6 6-6s6 2.7 6 6v2.5" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M25 43c2.8-8.8 4.9-14.7 6.9-17.8 2.1 3 4.2 9 7.1 17.8"
        fill="none"
        stroke="#FF385C"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="27" r="2.6" fill="#FF385C" />
    </svg>
  );
}
