import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Head from 'next/head';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(
      name ? `Message from ${name}` : 'Message from Crestio website'
    );
    const body = encodeURIComponent(
      [
        message,
        '',
        '---',
        name ? `From: ${name}` : null,
        email ? `Reply to: ${email}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
    window.location.href = `mailto:hello@crestio.ai?subject=${subject}&body=${body}`;
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText('hello@crestio.ai');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: do nothing; the mailto: form still works
    }
  }

  return (
    <>
      <Head>
        <title>Contact · Crestio</title>
      </Head>
      <div className="min-h-screen bg-cream text-ink">
        <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>
          <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink">
            Sign in
          </Link>
        </nav>

        <div className="max-w-xl mx-auto px-6 md:px-12 py-16 md:py-24">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Get in touch</div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tightest mb-4">Say hello</h1>
          <p className="text-ink-muted mb-10 leading-relaxed">
            Questions, bug reports, feedback, praise, complaints — all welcome. One human reads these and writes back, usually within a day.
          </p>

          <div className="card p-6 mb-8 flex items-center justify-between gap-4">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Email</div>
              <div className="font-mono text-sm text-ink">hello@crestio.ai</div>
            </div>
            <button onClick={copyEmail} className="btn-secondary text-xs">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <form onSubmit={onSubmit} className="card p-8 space-y-5">
            <div className="text-2xs uppercase tracking-widest text-ink-muted">
              Or send via your mail app
            </div>
            <div>
              <label className="label">Your name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Your email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
              <div className="text-2xs text-ink-soft mt-1.5">
                Include this if you want a reply.
              </div>
            </div>
            <div>
              <label className="label">Message *</label>
              <textarea
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="input"
                placeholder="What's on your mind?"
              />
            </div>
            <button type="submit" disabled={!message.trim()} className="btn-primary w-full py-3">
              Open in Mail
            </button>
            <div className="text-2xs text-ink-soft text-center">
              This opens your default email app with the message drafted. Nothing is sent until you send it yourself.
            </div>
          </form>
        </div>

        <footer className="px-6 md:px-12 py-10 border-t border-rule text-xs text-ink-muted">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>crestio · Sydney · 2026</div>
            <div className="flex flex-wrap gap-6">
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <Link href="/contact" className="hover:text-ink">Contact</Link>
              <Link href="/auth/signin" className="hover:text-ink">Sign in</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
