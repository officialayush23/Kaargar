import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export function SearchBar({ placeholder = 'Search services…' }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[--text-muted]">
        <Search size={16} />
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 glass-light rounded-2xl pl-11 pr-4 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-brand/40 transition-all"
      />
    </form>
  )
}
