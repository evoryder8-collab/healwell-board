// Network logos in each platform's brand colors (colors live in theme.css).
// Shapes use classes: .nf = brand fill, .ns = brand stroke, .nm = white inner mark.
const svg = (body: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`
const stroke = 'class="ns" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'

export const NETWORKS: Record<string, { label: string; icon: string }> = {
  instagram: { label: 'Instagram', icon: svg(`<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3.4" ${stroke}/><circle cx="8" cy="8" r="2.7" ${stroke}/><circle cx="11.5" cy="4.5" r=".95" class="nf"/>`) },
  facebook: { label: 'Facebook', icon: svg(`<circle cx="8" cy="8" r="7.2" class="nf"/><path class="nm" d="M8.9 15.2V9.6h1.7l.3-2H8.9V6.4c0-.6.2-1 1-1h1.1V3.6c-.2 0-.8-.1-1.5-.1-1.5 0-2.6.9-2.6 2.6v1.5H5.3v2h1.6v5.6Z"/>`) },
  threads: { label: 'Threads', icon: svg(`<path ${stroke} d="M10.6 7.7c-.2-1.9-1.3-2.9-3-2.9-1.2 0-2 .5-2.5 1.3M5.5 10.4c.5 1.1 1.5 1.7 2.8 1.7 1.7 0 2.9-1 2.9-2.4 0-1.6-1.6-2.3-3.5-2.1-1.2.1-1.9.8-1.8 1.6.1.9 1.1 1.3 2 1.2 1.4-.1 2.2-1.1 2.2-3.2M12.8 4.6C11.9 2.9 10.3 2 8.1 2 4.6 2 2.6 4.4 2.6 8s2 6 5.5 6c2.6 0 4.7-1.5 5-3.9"/>`) },
  linkedin: { label: 'LinkedIn', icon: svg(`<rect x="1.4" y="1.4" width="13.2" height="13.2" rx="2.6" class="nf"/><path class="nm" d="M4.3 6.5h1.9v5.7H4.3zM5.25 3.7a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM7.4 6.5h1.8v.8c.3-.5 1-1 1.9-1 1.9 0 2.2 1.2 2.2 2.8v3.1h-1.9V9.5c0-.7 0-1.5-.9-1.5s-1.1.7-1.1 1.5v2.7H7.4z"/>`) },
  gmb: { label: 'Google Business Profile', icon: svg(`<path class="nf" d="M2.6 2.6h10.8l1.2 3.9a2.1 2.1 0 0 1-4.1.4 2.1 2.1 0 0 1-4 0 2.1 2.1 0 0 1-4.1-.4Z"/><path ${stroke} d="M3.2 9.2v4.6h9.6V9.2M6.7 13.8v-2.6h2.6v2.6"/>`) },
  tiktok: { label: 'TikTok', icon: svg(`<path class="nf" d="M10.5 1.5H8.2v9.1a1.9 1.9 0 1 1-1.9-1.9c.2 0 .4 0 .6.1V6.4a4.2 4.2 0 1 0 3.6 4.2V6.1c.9.6 1.9 1 3 1V4.7c-1.7 0-3-1.4-3-3.2Z"/>`) },
  youtube: { label: 'YouTube', icon: svg(`<rect x=".8" y="3" width="14.4" height="10" rx="3" class="nf"/><path class="nm" d="M6.5 5.6v4.8L10.6 8Z"/>`) },
  pinterest: { label: 'Pinterest', icon: svg(`<circle cx="8" cy="8" r="7.2" class="nf"/><path class="nm" d="M8.2 3.3C5.6 3.3 4.2 5.1 4.2 6.7c0 .9.4 1.8 1.1 2.1.1 0 .2 0 .3-.1l.1-.5c0-.1 0-.2-.1-.3-.2-.3-.4-.6-.4-1.1 0-1.4 1.1-2.7 2.8-2.7 1.5 0 2.4.9 2.4 2.2 0 1.7-.8 3-1.8 3-.6 0-1-.5-.9-1.1.2-.7.5-1.5.5-2 0-.5-.3-.9-.8-.9-.6 0-1.1.6-1.1 1.5 0 .5.2.9.2.9l-.7 3c-.2.8 0 1.9 0 2l.2-.1c.1-.1.8-1 1-1.9l.4-1.5c.2.4.8.7 1.4.7 1.9 0 3.1-1.7 3.1-4 0-1.7-1.5-3.4-3.8-3.4Z"/>`) },
  twitter: { label: 'X', icon: svg(`<path class="nf" d="M9.4 6.8 14.1 1.5H13L8.9 6.1 5.6 1.5H1.9l4.9 7-4.9 5.6H3l4.3-4.9 3.4 4.9h3.7Zm-1.5 1.8-.5-.7-4-5.6h1.7l3.2 4.5.5.7 4.1 5.8h-1.7Z"/>`) },
  bluesky: { label: 'Bluesky', icon: svg(`<path class="nf" d="M8 7.3C7 5.4 4.6 3.1 3.1 3.1c-1.1 0-1 1.7-.6 3.2.3 1.3 1.6 2 3 1.8-1.6.4-2.2 1.5-1.2 2.6 1.6 1.7 2.9-.4 3.7-2 .8 1.6 2.1 3.7 3.7 2 1-1.1.4-2.2-1.2-2.6 1.4.2 2.7-.5 3-1.8.4-1.5.5-3.2-.6-3.2-1.5 0-3.9 2.3-4.9 4.2Z"/>`) },
}

// One shared gradient for the Instagram mark; its stop colors come from theme.css.
if (typeof document !== 'undefined' && !document.getElementById('net-ig-grad')) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.setAttribute('aria-hidden', 'true')
  defs.style.position = 'absolute'
  defs.innerHTML = '<defs><linearGradient id="net-ig-grad" gradientUnits="userSpaceOnUse" x1="2" y1="14" x2="14" y2="2"><stop offset="0"/><stop offset=".25"/><stop offset=".5"/><stop offset=".75"/><stop offset="1"/></linearGradient></defs>'
  document.body.append(defs)
}

const ORDER = Object.keys(NETWORKS)
const ALIASES: Record<string, string> = { google: 'gmb', googlebusiness: 'gmb', googlemybusiness: 'gmb', googlebusinessprofile: 'gmb', x: 'twitter' }
export const networkKey = (n: string) => ALIASES[n.toLowerCase().replace(/[^a-z]/g, '')] ?? n.toLowerCase()
export const networkInfo = (n: string) => NETWORKS[networkKey(n)] ?? { label: n, icon: svg(`<circle cx="8" cy="8" r="5.5" ${stroke}/>`) }
export const byNetworkOrder = (a: { network: string }, b: { network: string }) =>
  (ORDER.indexOf(networkKey(a.network)) + 99) % 99 - (ORDER.indexOf(networkKey(b.network)) + 99) % 99
