// Icônes des onglets : traits fins, couleur héritée du texte (style Lucide)
const TRACES = {
  athletes: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.5a6.5 6.5 0 0 1 3 5.5" /></>,
  programmes: <><rect x="5" y="3.5" width="14" height="18" rx="2" /><path d="M9 3.5h6v3H9zM9 11h6M9 15h6" /></>,
  nutrition: <><path d="M12 7c-1.5-1.4-5.5-1.8-7 1.5-1.6 3.6.8 9.6 3.5 11 1.4.8 2.4.2 3.5.2s2.1.6 3.5-.2c2.7-1.4 5.1-7.4 3.5-11-1.5-3.3-5.5-2.9-7-1.5Z" /><path d="M12 7c0-2 1-3.5 3-4" /></>,
  bibliotheque: <><path d="M4 4.5h4v15H4zM10 4.5h4v15h-4z" /><path d="m16 5.2 3.8-1 3 14.6-3.8 1z" /></>,
  messages: <path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.4A8.5 8.5 0 1 1 20.5 12Z" />,
  entrainement: <><rect x="5" y="5.5" width="3.5" height="13" rx="1" /><rect x="15.5" y="5.5" width="3.5" height="13" rx="1" /><path d="M2.5 9.5v5M21.5 9.5v5M8.5 12h7" /></>,
}

export function Icone({ nom }) {
  return <svg className="ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{TRACES[nom]}</svg>
}
