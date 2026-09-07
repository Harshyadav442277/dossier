import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dossier",
  description: "Ask once, get the case file. A paper, a news topic or a message you are not sure about, checked across fourteen Telegraph intents, with a receipt for every call.",
  openGraph: {
    title: "Dossier",
    description: "One question, fourteen intents, one case file. Every answer bought from a Telegraph miner the router chose, with the receipt on the line.",
    type: "website",
  },
  twitter: { card: "summary", title: "Dossier", description: "One question, fourteen intents, one case file. Every answer bought from a Telegraph miner the router chose, with the receipt on the line." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="wordmark">
              Dossier<small>on Telegraph</small>
            </Link>
            <nav className="site-nav">
              <Link href="/ledger">Ledger</Link>
              <Link href="/#how">How it works</Link>
              <a href="https://github.com/Harshyadav442277/dossier" rel="noreferrer">Source</a>
            </nav>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site-footer">
          <div className="wrap">
            Every answer on this site was bought from a Telegraph miner on Base Sepolia and can be checked on the node and on the chain. Testnet money, real answers.
          </div>
        </footer>
      </body>
    </html>
  );
}
