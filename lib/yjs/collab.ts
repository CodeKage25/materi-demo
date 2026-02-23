

const COLORS = [
  '#958DF1', // purple
  '#F98181', // red
  '#FBBC88', // orange
  '#FAF594', // yellow
  '#70CFF8', // blue
  '#94FADB', // teal
  '#B9F18D', // green
  '#E8A0BF', // pink
  '#C4B5FD', // lavender
  '#67E8F9', // cyan
]


export function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}


export function getCollabServerUrl(): string {
  if (typeof window !== 'undefined') {
    return (
      process.env.NEXT_PUBLIC_COLLAB_URL ??
      `ws://${window.location.hostname}:4444`
    )
  }
  return process.env.NEXT_PUBLIC_COLLAB_URL ?? 'ws://localhost:4444'
}
