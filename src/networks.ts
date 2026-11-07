// Small monochrome network marks for the "where did this go" row on cards.
const S = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"'
const svg = (body: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`

export const NETWORKS: Record<string, { label: string; icon: string }> = {
  instagram: { label: 'Instagram', icon: svg(`<rect x="2.5" y="2.5" width="11" height="11" rx="3.2" ${S}/><circle cx="8" cy="8" r="2.6" ${S}/><circle cx="11.3" cy="4.7" r=".85" fill="currentColor"/>`) },
  facebook: { label: 'Facebook', icon: svg(`<circle cx="8" cy="8" r="6.4" ${S}/><path d="M9.6 5.2h-.8c-.8 0-1.2.4-1.2 1.2v7.4M6.3 8.4h3.2" ${S}/>`) },
  threads: { label: 'Threads', icon: svg(`<path d="M10.4 8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Zm0 0v.8c0 1 .6 1.6 1.4 1.6s1.6-.8 1.6-2.4a5.4 5.4 0 1 0-2.4 4.5" ${S}/>`) },
  linkedin: { label: 'LinkedIn', icon: svg(`<rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2.4" ${S}/><path d="M5.4 7.2v3.6M5.4 5.2v.1M7.8 10.8V8.6c0-.9.6-1.5 1.4-1.5s1.3.6 1.3 1.4v2.3M7.8 7.2v3.6" ${S}/>`) },
  gmb: { label: 'Google Business Profile', icon: svg(`<path d="M3 6.6 4 3.2h8l1 3.4a1.6 1.6 0 0 1-3.3.2 1.6 1.6 0 0 1-3.4 0A1.6 1.6 0 0 1 3 6.6Z" ${S}/><path d="M3.8 8.2v4.6h8.4V8.2M6.6 12.8v-2.6h2.8v2.6" ${S}/>`) },
  tiktok: { label: 'TikTok', icon: svg(`<path d="M9.4 2.6v7.6a2.4 2.4 0 1 1-2.4-2.4M9.4 2.6c.3 1.5 1.4 2.6 3 2.8" ${S}/>`) },
  youtube: { label: 'YouTube', icon: svg(`<rect x="1.9" y="3.9" width="12.2" height="8.2" rx="2.6" ${S}/><path d="M7 6.4v3.2L9.6 8 7 6.4Z" fill="currentColor"/>`) },
  pinterest: { label: 'Pinterest', icon: svg(`<circle cx="8" cy="8" r="6.4" ${S}/><path d="M7.3 13.4l1-4M7.7 9.4c.3.5.8.7 1.4.7 1.4 0 2.2-1.3 2.2-2.8S10 4.7 8.4 4.7C6.6 4.7 5.5 6 5.5 7.4c0 .6.3 1.2.7 1.5" ${S}/>`) },
  twitter: { label: 'X', icon: svg(`<path d="M3.4 3h2.7l6.5 10H9.9L3.4 3Zm9 0L9 7.1M7 8.9 3.6 13" ${S}/>`) },
  bluesky: { label: 'Bluesky', icon: svg(`<path d="M8 7.4C7 5.5 4.7 3.3 3.3 3.3c-1 0-.9 1.6-.6 3 .3 1.2 1.5 1.9 2.9 1.7-1.5.4-2.1 1.4-1.1 2.4 1.5 1.6 2.7-.4 3.5-1.9.8 1.5 2 3.5 3.5 1.9 1-1 .4-2-1.1-2.4 1.4.2 2.6-.5 2.9-1.7.3-1.4.4-3-.6-3-1.4 0-3.7 2.2-4.7 4.1Z" ${S}/>`) },
}

const ORDER = Object.keys(NETWORKS)
const ALIASES: Record<string, string> = { google: 'gmb', googlebusiness: 'gmb', googlemybusiness: 'gmb', x: 'twitter' }
export const networkKey = (n: string) => ALIASES[n.toLowerCase().replace(/[^a-z]/g, '')] ?? n.toLowerCase()
export const networkInfo = (n: string) => NETWORKS[networkKey(n)] ?? { label: n, icon: svg(`<circle cx="8" cy="8" r="5.5" ${S}/>`) }
export const byNetworkOrder = (a: { network: string }, b: { network: string }) =>
  (ORDER.indexOf(networkKey(a.network)) + 99) % 99 - (ORDER.indexOf(networkKey(b.network)) + 99) % 99
