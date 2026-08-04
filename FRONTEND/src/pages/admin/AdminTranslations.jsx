/**
 * AdminTranslations — correct machine-translated UI copy without a release.
 *
 * WHY THIS PAGE EXISTS
 * Every UI string is translated by Sarvam and cached permanently. That covers
 * ~99% of copy at near-zero marginal cost, and it stays. What it can't do is be
 * wrong-but-fixable: Sarvam will occasionally render "Book Worker" as a literal
 * "बुक कर्मचारी" instead of the natural "कामगार बुक करें". Before this, the only
 * remedy was to change the English source and ship a new app build.
 *
 * Saving an override writes `manual_text`, which the API serves in preference
 * to the machine output everywhere. The machine translation is never
 * overwritten — so "Revert" costs nothing and needs no new Sarvam call.
 *
 * Every edit bumps `updated_at`, which is exactly what the mobile client's
 * delta sync polls, so a correction reaches phones on their next launch or
 * foreground. No Realtime, no app release.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Languages, Search, RotateCcw, Check, Pencil, X } from 'lucide-react'
import { api } from '@/lib/api'

const LANGS = [
  { code: 'hi', label: 'हिन्दी  Hindi' },
  { code: 'mr', label: 'मराठी  Marathi' },
]

function Row({ item, lang }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.manual_translation ?? item.machine_translation ?? '')

  const save = useMutation({
    mutationFn: (manual) => api.put(`/admin/translations/${item.id}`, { manual_translation: manual }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-translations', lang] })
      setEditing(false)
    },
  })

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="px-4 py-3 align-top" style={{ maxWidth: 280 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.source_text}</div>
      </td>

      <td className="px-4 py-3 align-top" style={{ maxWidth: 280 }}>
        <div style={{ color: item.is_overridden ? 'var(--text-muted)' : 'var(--text-secondary)',
                      textDecoration: item.is_overridden ? 'line-through' : 'none' }}>
          {item.machine_translation}
        </div>
      </td>

      <td className="px-4 py-3 align-top" style={{ minWidth: 300 }}>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save.mutate(value)
                if (e.key === 'Escape') setEditing(false)
              }}
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
                       color: 'var(--text-primary)', outline: 'none' }}
            />
            <button onClick={() => save.mutate(value)} disabled={save.isPending}
              className="p-2 rounded-lg" style={{ background: 'var(--accent)', cursor: 'pointer', border: 'none' }}>
              <Check className="h-3.5 w-3.5" style={{ color: '#000' }} />
            </button>
            <button onClick={() => setEditing(false)}
              className="p-2 rounded-lg" style={{ background: 'var(--bg-elevated)', cursor: 'pointer',
                                                   border: '1px solid var(--border)' }}>
              <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span style={{ color: item.is_overridden ? 'var(--accent)' : 'var(--text-muted)' }}>
              {item.manual_translation ?? '—'}
            </span>
            <button
              onClick={() => { setValue(item.manual_translation ?? item.machine_translation ?? ''); setEditing(true) }}
              className="p-1.5 rounded-md"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Edit override">
              <Pencil className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
            </button>
            {item.is_overridden && (
              <button
                onClick={() => save.mutate('')}
                disabled={save.isPending}
                className="p-1.5 rounded-md"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                title="Revert to the machine translation">
                <RotateCcw className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

export default function AdminTranslations() {
  const [lang, setLang] = useState('hi')
  const [q, setQ] = useState('')
  const [onlyOverridden, setOnlyOverridden] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-translations', lang, q, onlyOverridden],
    queryFn: async () => {
      const { data } = await api.get('/admin/translations', {
        params: { lang, q: q || undefined, only_overridden: onlyOverridden, limit: 200 },
      })
      return data
    },
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Languages className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          Translations
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          UI copy is translated automatically. Override anything that reads awkwardly — the change
          reaches phones on their next launch, without an app release.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: lang === l.code ? 'var(--accent)' : 'var(--bg-elevated)',
              color: lang === l.code ? '#000' : 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}>
            {l.label}
          </button>
        ))}

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[220px]"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search English or translated text…"
            className="flex-1 text-sm"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg cursor-pointer"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={onlyOverridden} onChange={(e) => setOnlyOverridden(e.target.checked)} />
          Overridden only
        </label>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              {['English (source)', 'Machine translation', 'Override'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium"
                  style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center" style={{ color: 'var(--text-muted)' }}>
                  {/* Honest empty state: this table only fills as the app requests
                      strings, so "nothing here" usually means "nobody has used
                      this language yet", not "something is broken". */}
                  No translated strings yet for this language. They appear here once the app has
                  requested them.
                </td>
              </tr>
            ) : (
              items.map((item) => <Row key={item.id} item={item} lang={lang} />)
            )}
          </tbody>
        </table>
      </div>

      {data?.total > items.length && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Showing {items.length} of {data.total}. Narrow with search.
        </p>
      )}
    </div>
  )
}
