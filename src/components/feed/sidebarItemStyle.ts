export function sidebarItemClassName(active: boolean, color = 'text-app-text', layout = 'w-full') {
  return `mb-0.5 flex ${layout} items-center justify-between rounded-md border-0 px-2.5 py-1.5 text-left text-sm ${color} hover:bg-app-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${active ? 'rounded-r-md rounded-l-none bg-app-border shadow-[inset_2px_0_0_var(--accent)]' : ''}`
}
