import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquarePlus, Bug, Lightbulb, X, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID
const AIRTABLE_TABLE_ID = import.meta.env.VITE_AIRTABLE_TABLE_ID
const AIRTABLE_API_TOKEN = import.meta.env.VITE_AIRTABLE_API_TOKEN

type FeedbackType = 'Bug' | 'Suggestion'
type BugSeverity = 'aesthetic' | 'minor' | 'major' | 'blocking'

const SEVERITY_OPTIONS: { value: BugSeverity; label: string; emoji: string }[] = [
  { value: 'aesthetic', label: 'Probleme esthetique', emoji: '👀' },
  { value: 'minor', label: 'Bug mineur', emoji: '🔵' },
  { value: 'major', label: 'Bug majeur', emoji: '🟠' },
  { value: 'blocking', label: 'Bug bloquant', emoji: '🔴' },
]

async function sendToAirtable(data: {
  type: FeedbackType
  name: string
  text: string
  severity: BugSeverity | null
  url: string
}) {
  const severityLabel = data.severity
    ? SEVERITY_OPTIONS.find(s => s.value === data.severity)
    : null

  const record = {
    fields: {
      'Feedback': `[${data.name}] ${data.text} (${data.url})`,
      'Feedback Type': data.type,
      'Bug Severity': data.type === 'Bug' && severityLabel
        ? `${severityLabel.emoji} ${severityLabel.label}`
        : '💡 Suggestion',
    },
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [record] }),
    },
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Erreur Airtable')
  }
}

export function FeedbackButton() {
  const { membre } = useAuth()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'type' | 'form'>('type')
  const [type, setType] = useState<FeedbackType | null>(null)
  const [severity, setSeverity] = useState<BugSeverity | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  function reset() {
    setStep('type')
    setType(null)
    setSeverity(null)
    setText('')
    setSent(false)
  }

  function handleClose() {
    setOpen(false)
    setTimeout(reset, 200)
  }

  function handleTypeSelect(t: FeedbackType) {
    setType(t)
    setStep('form')
  }

  async function handleSubmit() {
    if (!type || !text.trim()) return
    setSending(true)
    try {
      await sendToAirtable({
        type,
        name: membre?.full_name ?? 'Anonyme',
        text: text.trim(),
        severity: type === 'Bug' ? severity : null,
        url: window.location.href,
      })
      setSent(true)
      setTimeout(handleClose, 1500)
    } catch (err) {
      console.error('Feedback error:', err)
    } finally {
      setSending(false)
    }
  }

  // Don't render if Airtable is not configured
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_TOKEN) {
    console.warn('FeedbackButton: Airtable not configured', { AIRTABLE_BASE_ID, AIRTABLE_API_TOKEN: AIRTABLE_API_TOKEN ? '***' : undefined })
    return null
  }

  return createPortal(
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => { reset(); setOpen(true) }}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center gap-1.5 rounded-l-md bg-[#863bff] px-1.5 py-2.5 text-xs font-medium text-white shadow-lg shadow-purple-500/25 hover:bg-[#7e14ff] transition-all hover:shadow-xl hover:shadow-purple-500/30 active:scale-95"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        <MessageSquarePlus className="h-4 w-4 rotate-90" />
        Feedback
      </button>

      {/* Modal overlay + panel */}
      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
          <div className="absolute top-1/2 -translate-y-1/2 right-10 w-full max-w-sm animate-in slide-in-from-right-4 fade-in duration-200">
            <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold">
                  {sent ? 'Merci !' : step === 'type' ? 'Envoyer un feedback' : type === 'Bug' ? 'Signaler un bug' : 'Suggerer une idee'}
                </h3>
                <button onClick={handleClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5">
                {sent ? (
                  <div className="text-center py-6 space-y-2">
                    <div className="text-3xl">✅</div>
                    <p className="text-sm text-muted-foreground">Votre feedback a bien ete envoye.</p>
                  </div>
                ) : step === 'type' ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => handleTypeSelect('Bug')}
                      className="w-full flex items-center gap-3 rounded-xl border border-border p-4 text-left hover:border-primary/40 hover:bg-muted/50 transition-colors"
                    >
                      <div className="rounded-lg bg-red-500/10 p-2">
                        <Bug className="h-5 w-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Signaler un bug</p>
                        <p className="text-xs text-muted-foreground">Quelque chose ne fonctionne pas</p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTypeSelect('Suggestion')}
                      className="w-full flex items-center gap-3 rounded-xl border border-border p-4 text-left hover:border-primary/40 hover:bg-muted/50 transition-colors"
                    >
                      <div className="rounded-lg bg-amber-500/10 p-2">
                        <Lightbulb className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Suggerer une idee</p>
                        <p className="text-xs text-muted-foreground">Proposer une amelioration</p>
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {type === 'Bug' && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">Severite</label>
                        <div className="grid grid-cols-2 gap-2">
                          {SEVERITY_OPTIONS.map(s => (
                            <button
                              key={s.value}
                              onClick={() => setSeverity(s.value)}
                              className={`rounded-lg border px-3 py-2 text-xs text-left transition-colors ${
                                severity === s.value
                                  ? 'border-primary bg-primary/5 text-foreground'
                                  : 'border-border hover:border-primary/40 text-muted-foreground'
                              }`}
                            >
                              {s.emoji} {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Description</label>
                      <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder={type === 'Bug' ? 'Decrivez le probleme rencontre...' : 'Decrivez votre idee...'}
                        rows={4}
                        className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none resize-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => { setStep('type'); setType(null); setSeverity(null) }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        ← Retour
                      </button>
                      <Button
                        onClick={handleSubmit}
                        disabled={!text.trim() || sending}
                        size="sm"
                        className="rounded-lg"
                      >
                        {sending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Envoyer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
