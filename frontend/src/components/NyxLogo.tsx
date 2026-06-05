import { useId } from 'react'

interface NyxLogoProps {
  size?: number
}

export function NyxLogo({ size = 32 }: NyxLogoProps) {
  const uid    = useId()
  const gradId = `eye-grad-${uid}`
  const irisId = `iris-grad-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Nyx logo"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%"   stopColor="#4f46e5" />
          <stop offset="50%"  stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <radialGradient id={irisId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4338ca" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="12" fill="#030712" />
      <ellipse cx="32" cy="32" rx="24" ry="14" fill="#1e1b4b" opacity="0.4" />
      <path
        d="M8 32C8 32 18 16 32 16C46 16 56 32 56 32C56 32 46 48 32 48C18 48 8 32 8 32Z"
        stroke={`url(#${gradId})`}
        strokeWidth="1.5"
        fill="none"
      />
      <circle cx="32" cy="32" r="9" fill={`url(#${irisId})`} />
      <circle cx="32" cy="32" r="4"   fill="#030712" />
      <circle cx="35" cy="29" r="1.5" fill="white" opacity="0.7" />
      <circle cx="9"  cy="32" r="1.5" fill="#818cf8" opacity="0.5" />
      <circle cx="55" cy="32" r="1.5" fill="#818cf8" opacity="0.5" />
    </svg>
  )
}
