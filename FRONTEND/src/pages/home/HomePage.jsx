// import { useNavigate } from 'react-router-dom'
// import { motion, AnimatePresence } from 'framer-motion'
// import { Search, MapPin, ChevronDown, Bell, Sun, Moon } from 'lucide-react'
// import { useAppStore } from '@/stores/app'
// import { useAuthStore } from '@/stores/auth'
// import { CategoryGrid } from '@/components/kaargar/CategoryGrid'
// import { WorkerCard } from '@/components/kaargar/WorkerCard'
// import { Skeleton } from '@/components/ui/skeleton'
// import { useCategories } from '@/hooks/useCategories'
// import { useNotifications } from '@/hooks/useNotifications'
// import { useQuery } from '@tanstack/react-query'
// import { api } from '@/lib/api'
// import { useState } from 'react'
// import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
// import { NotificationDrawer } from '@/components/kaargar/NotificationDrawer'

// /* ── Profile Menu Drawer ── */
// function ProfileMenu({ open, onClose, user, unreadCount }) {
//   const { logout } = useAuthStore()
//   const { theme, toggleTheme } = useAppStore()
//   const navigate = useNavigate()
//   const isDark = theme === 'dark'
//   const initials = user?.full_name
//     ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
//     : user?.email?.[0]?.toUpperCase() ?? 'K'

//   return (
//     <AnimatePresence>
//       {open && (
//         <>
//           {/* Backdrop */}
//           <motion.div
//             className="fixed inset-0 z-50"
//             style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             exit={{ opacity: 0 }}
//             onClick={onClose}
//           />
//           {/* Drawer */}
//           <motion.div
//             className="fixed inset-x-0 top-0 z-50"
//             initial={{ y: -40, opacity: 0 }}
//             animate={{ y: 0, opacity: 1 }}
//             exit={{ y: -40, opacity: 0 }}
//             transition={{ type: 'spring', stiffness: 350, damping: 28 }}
//           >
//             <div
//               className="mx-4 mt-4 rounded-3xl overflow-hidden"
//               style={{
//                 background: isDark
//                   ? 'linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(15,15,15,0.96) 100%)'
//                   : 'linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(240,242,248,0.98) 100%)',
//                 backdropFilter: 'blur(40px) saturate(200%)',
//                 WebkitBackdropFilter: 'blur(40px) saturate(200%)',
//                 border: '1.5px solid var(--g-border)',
//                 boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
//               }}
//             >
//               {/* Profile header */}
//               <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--g-border)' }}>
//                 <div className="flex items-center gap-4">
//                   <Avatar className="h-16 w-16"
//                     style={{ border: '2px solid var(--accent-border)' }}>
//                     <AvatarImage src={user?.avatar_url} />
//                     <AvatarFallback
//                       className="text-xl font-bold"
//                       style={{ background: '#3D2508', color: '#fbbf24' }}
//                     >{initials}</AvatarFallback>
//                   </Avatar>
//                   <div>
//                     <p className="text-lg font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
//                       {user?.full_name || 'User'}
//                     </p>
//                     <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
//                     <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
//                       {user?.phone || 'No phone added'}
//                     </p>
//                   </div>
//                 </div>
//               </div>

//               {/* Notifications preview */}
//               {unreadCount > 0 && (
//                 <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--g-border)', background: '#1A1004' }}>
//                   <div className="flex items-center gap-2">
//                     <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
//                     <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
//                       {unreadCount} new notification{unreadCount > 1 ? 's' : ''}
//                     </span>
//                   </div>
//                 </div>
//               )}

//               {/* Menu items */}
//               <div className="p-3 space-y-0.5">
//                 {[
//                   { label: 'My Bookings', emoji: '📋', to: '/bookings' },
//                   { label: 'My Profile',  emoji: '👤', to: '/profile' },
//                   { label: 'Messages',    emoji: '💬', to: '/chat' },
//                   { label: 'Support',     emoji: '🆘', to: '/support' },
//                 ].map((item) => (
//                   <button
//                     key={item.to}
//                     onClick={() => { navigate(item.to); onClose() }}
//                     className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left"
//                     style={{ color: 'var(--text-primary)' }}
//                     onMouseEnter={(e) => e.currentTarget.style.background = 'var(--g-bg)'}
//                     onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
//                   >
//                     <span className="text-xl">{item.emoji}</span>
//                     <span className="text-sm font-medium">{item.label}</span>
//                   </button>
//                 ))}

//                 {/* Theme toggle */}
//                 <button
//                   onClick={toggleTheme}
//                   className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left"
//                   style={{ color: 'var(--text-primary)' }}
//                   onMouseEnter={(e) => e.currentTarget.style.background = 'var(--g-bg)'}
//                   onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
//                 >
//                   <span className="text-xl">{isDark ? '☀️' : '🌙'}</span>
//                   <span className="text-sm font-medium">
//                     {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
//                   </span>
//                 </button>

//                 {user?.role === 'worker' && (
//                   <button
//                     onClick={() => { navigate('/worker'); onClose() }}
//                     className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left"
//                     style={{
//                       background: '#251606',
//                       border: '1px solid #7C4A12',
//                       color: 'var(--accent)',
//                     }}
//                   >
//                     <span className="text-xl">⚡</span>
//                     <span className="text-sm font-semibold">Worker Dashboard</span>
//                   </button>
//                 )}
//               </div>

//               <div className="px-4 pb-4">
//                 <button
//                   onClick={() => { logout(); navigate('/login'); onClose() }}
//                   className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
//                   style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
//                   onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
//                   onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
//                 >
//                   Sign Out
//                 </button>
//               </div>
//             </div>
//           </motion.div>
//         </>
//       )}
//     </AnimatePresence>
//   )
// }

// /* ── Inline Mode Toggle (liquid glass pill) ── */
// function InlineModeToggle() {
//   const { mode, setMode } = useAppStore()
//   const modes = [
//     { id: 'instant',   label: 'Instant',  emoji: '⚡', activeColor: 'rgba(34,197,94,0.25)', activeBorder: 'rgba(34,197,94,0.5)', activeText: '#4ade80' },
//     { id: 'discovery', label: 'Discover', emoji: '🧭', activeColor: '#3D2508', activeBorder: '#B45309', activeText: '#fbbf24' },
//   ]

//   return (
//     <div
//       style={{
//         display: 'inline-flex',
//         padding: '4px',
//         gap: '4px',
//         borderRadius: '9999px',
//         background: 'var(--g-bg-hi)',
//         border: '1.5px solid var(--g-border)',
//         boxShadow: '0 4px 20px rgba(0,0,0,0.18), inset 0 1px 0 var(--g-shine)',
//       }}
//     >
//       {modes.map(({ id, label, emoji, activeColor, activeBorder, activeText }) => {
//         const active = mode === id
//         return (
//           <button
//             key={id}
//             onClick={() => setMode(id)}
//             className="relative flex items-center gap-2 px-5 py-2.5 transition-all duration-200 select-none"
//             style={{ borderRadius: '9999px', WebkitTapHighlightColor: 'transparent' }}
//           >
//             {active && (
//               <motion.div
//                 layoutId="inline-mode-pill"
//                 className="absolute inset-0"
//                 style={{
//                   borderRadius: '9999px',
//                   background: activeColor,
//                   border: `1px solid ${activeBorder}`,
//                   boxShadow: `0 0 16px ${activeColor}`,
//                 }}
//                 transition={{ type: 'spring', stiffness: 380, damping: 26 }}
//               />
//             )}
//             <span className="relative text-base leading-none">{emoji}</span>
//             <span
//               className="relative text-sm font-semibold"
//               style={{ color: active ? activeText : 'var(--text-muted)' }}
//             >
//               {label}
//             </span>
//           </button>
//         )
//       })}
//     </div>
//   )
// }

// /* ── Stat chip ── */
// function StatChip({ emoji, label, value }) {
//   return (
//     <div
//       className="flex items-center gap-2 px-3.5 py-2 rounded-2xl flex-shrink-0"
//       style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
//     >
//       <span className="text-base">{emoji}</span>
//       <div>
//         <p className="text-[12px] leading-none" style={{ color: 'var(--text-muted)' }}>{label}</p>
//         <p className="text-sm font-bold font-mono leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
//       </div>
//     </div>
//   )
// }

// /* ── Instant content ── */
// function InstantContent({ onCategorySelect }) {
//   const { data: categories = [], isLoading } = useCategories('instant')

//   return (
//     <motion.div
//       key="instant"
//       initial={{ opacity: 0, x: -16 }}
//       animate={{ opacity: 1, x: 0 }}
//       exit={{ opacity: 0, x: 16 }}
//       transition={{ type: 'spring', stiffness: 300, damping: 28 }}
//       className="space-y-5"
//     >
//       {/* Stats row */}
//       <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
//         <StatChip emoji="🟢" label="Online workers" value="24+" />
//         <StatChip emoji="⏱️" label="Avg. arrival"   value="38 min" />
//         <StatChip emoji="⭐" label="Avg. rating"    value="4.8" />
//       </div>

//       {/* Category grid */}
//       <div>
//         <p
//           className="text-xs uppercase tracking-widest mb-3 font-medium"
//           style={{ color: 'var(--text-muted)' }}
//         >Pick a service</p>
//         {isLoading ? (
//           <div className="grid grid-cols-5 gap-2">
//             {Array.from({ length: 10 }).map((_, i) => (
//               <Skeleton key={i} className="aspect-square rounded-xl" style={{ background: 'var(--g-bg)' }} />
//             ))}
//           </div>
//         ) : (
//           <CategoryGrid categories={categories} onSelect={onCategorySelect} mode="instant" />
//         )}
//       </div>
//     </motion.div>
//   )
// }

// /* ── Discovery content ── */
// function DiscoveryContent() {
//   const navigate = useNavigate()
//   const { data: recommendations = [], isLoading } = useQuery({
//     queryKey: ['recommendations'],
//     queryFn: () => api.get('/search/recommendations').then(r => r.data).catch(() => []),
//     staleTime: 5 * 60_000,
//   })

//   return (
//     <motion.div
//       key="discovery"
//       initial={{ opacity: 0, x: 16 }}
//       animate={{ opacity: 1, x: 0 }}
//       exit={{ opacity: 0, x: -16 }}
//       transition={{ type: 'spring', stiffness: 300, damping: 28 }}
//       className="space-y-5"
//     >
//       <div>
//         <p
//           className="text-xs uppercase tracking-widest mb-3 font-medium"
//           style={{ color: 'var(--text-muted)' }}
//         >Recommended for you</p>
//         <div className="space-y-3">
//           {isLoading ? (
//             Array.from({ length: 3 }).map((_, i) => (
//               <Skeleton key={i} className="h-20 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
//             ))
//           ) : recommendations.length > 0 ? (
//             recommendations.map((worker, i) => (
//               <motion.div
//                 key={worker.id}
//                 initial={{ opacity: 0, y: 12 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 transition={{ delay: i * 0.07 }}
//               >
//                 <WorkerCard worker={worker} />
//               </motion.div>
//             ))
//           ) : (
//             <button
//               onClick={() => navigate('/discover')}
//               className="w-full py-10 rounded-2xl text-sm transition-colors"
//               style={{
//                 border: '1px solid var(--g-border)',
//                 background: 'var(--g-bg)',
//                 color: 'var(--text-muted)',
//               }}
//             >
//               Browse all professionals →
//             </button>
//           )}
//         </div>
//       </div>
//     </motion.div>
//   )
// }

// /* ══════════════════════════════════════════════
//    MAIN HOMEPAGE
// ═══════════════════════════════════════════════ */
// export default function HomePage() {
//   const navigate = useNavigate()
//   const { mode, theme, toggleTheme } = useAppStore()
//   const { user } = useAuthStore()
//   const { unreadCount } = useNotifications()
//   const [menuOpen, setMenuOpen] = useState(false)
//   const [notifOpen, setNotifOpen] = useState(false)
//   const [searchQuery, setSearchQuery] = useState('')

//   const initials = user?.full_name
//     ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
//     : user?.email?.[0]?.toUpperCase() ?? 'K'

//   function handleCategorySelect(category) {
//     navigate('/job/new', { state: { category } })
//   }

//   function handleSearch() {
//     if (!searchQuery.trim()) return
//     if (mode === 'instant') {
//       navigate('/job/new', { state: { query: searchQuery } })
//     } else {
//       navigate(`/discover?q=${encodeURIComponent(searchQuery)}`)
//     }
//   }

//   return (
//     <div className="relative min-h-screen px-4">
//       {/* ── Mode ambient glow ── */}
//       <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
//         <AnimatePresence mode="wait">
//           <motion.div
//             key={mode}
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             exit={{ opacity: 0 }}
//             transition={{ duration: 0.8 }}
//             className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[320px] rounded-full"
//             style={{
//               filter: 'blur(100px)',
//               background: mode === 'instant'
//                 ? 'radial-gradient(ellipse, rgba(34,197,94,0.14) 0%, transparent 70%)'
//                 : 'radial-gradient(ellipse, rgba(245,158,11,0.45) 0%, transparent 70%)',
//             }}
//           />
//         </AnimatePresence>
//       </div>

//       {/* ═══════════════════════════════════════
//           HERO SECTION — Blinkit/Zomato style
//       ═══════════════════════════════════════ */}
//       <div className="pt-12 pb-6 space-y-5">

//         {/* Top row: Location + Bell + Profile */}
//         <div className="flex items-center justify-between">
//           {/* Location pill */}
//           <button className="flex items-center gap-1.5 group">
//             <MapPin className="h-4 w-4 text-amber-400" />
//             <span
//               className="text-sm font-medium transition-colors"
//               style={{ color: 'var(--text-secondary)' }}
//             >Pune</span>
//             <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
//           </button>

//           {/* Right: bell + avatar */}
//           <div className="flex items-center gap-2">
//             {/* Notification bell */}
//             <button
//               onClick={() => setNotifOpen(true)}
//               style={{
//                 position: 'relative',
//                 width: '36px',
//                 height: '36px',
//                 borderRadius: '10px',
//                 background: 'var(--g-bg)',
//                 border: '1px solid var(--g-border)',
//                 display: 'flex',
//                 alignItems: 'center',
//                 justifyContent: 'center',
//                 cursor: 'pointer',
//               }}
//             >
//               <Bell size={16} style={{ color: 'var(--text-secondary)' }} />
//               {unreadCount > 0 && (
//                 <span
//                   style={{
//                     position: 'absolute',
//                     top: '-3px',
//                     right: '-3px',
//                     minWidth: '16px',
//                     height: '16px',
//                     borderRadius: '8px',
//                     padding: '0 3px',
//                     background: 'var(--accent)',
//                     color: '#000',
//                     fontSize: '11px',
//                     fontWeight: 700,
//                     display: 'flex',
//                     alignItems: 'center',
//                     justifyContent: 'center',
//                     lineHeight: 1,
//                   }}
//                 >
//                   {unreadCount > 9 ? '9+' : unreadCount}
//                 </span>
//               )}
//             </button>

//             {/* Theme toggle */}
//             <motion.button
//               onClick={toggleTheme}
//               whileTap={{ scale: 0.9 }}
//               style={{
//                 width: '36px',
//                 height: '36px',
//                 borderRadius: '10px',
//                 background: 'var(--g-bg)',
//                 border: '1px solid var(--g-border)',
//                 display: 'flex',
//                 alignItems: 'center',
//                 justifyContent: 'center',
//                 cursor: 'pointer',
//                 flexShrink: 0,
//               }}
//             >
//               {theme === 'dark'
//                 ? <Sun size={16} style={{ color: 'var(--accent)' }} />
//                 : <Moon size={16} style={{ color: 'var(--text-secondary)' }} />
//               }
//             </motion.button>

//             {/* Profile avatar */}
//             <motion.button
//               onClick={() => setMenuOpen(true)}
//               whileHover={{ scale: 1.06 }}
//               whileTap={{ scale: 0.94 }}
//               className="relative"
//               style={{
//                 borderRadius: '9999px',
//                 padding: '2px',
//                 background: 'var(--g-bg)',
//                 border: '1.5px solid #B45309',
//                 boxShadow: '0 0 12px rgba(245,158,11,0.50)',
//                 cursor: 'pointer',
//               }}
//             >
//               <Avatar className="h-9 w-9">
//                 <AvatarImage src={user?.avatar_url} />
//                 <AvatarFallback
//                   className="text-sm font-bold"
//                   style={{ background: 'var(--accent-deep)', color: '#fbbf24' }}
//                 >{initials}</AvatarFallback>
//               </Avatar>
//             </motion.button>
//           </div>
//         </div>

//         {/* Logo + Tagline */}
//         <motion.div
//           initial={{ opacity: 0, y: -10 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.05 }}
//         >
//           <h1 className="text-5xl font-black font-syne tracking-tight" style={{
//             background: theme === 'dark'
//               ? 'linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 40%, #F59E0B 100%)'
//               : 'linear-gradient(135deg, #1a1a1a 0%, #374151 40%, #d97706 100%)',
//             WebkitBackgroundClip: 'text',
//             WebkitTextFillColor: 'transparent',
//             backgroundClip: 'text',
//           }}>
//             Kaargar
//           </h1>
//           <p className="text-sm mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>
//             Get help in <span className="text-amber-400 font-semibold">~30 min</span> &bull; Kaam Ho Jayega
//           </p>
//         </motion.div>

//         {/* Search bar */}
//         <motion.div
//           initial={{ opacity: 0, y: 8 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.1 }}
//           className="relative"
//         >
//           <div
//             className="flex items-center gap-3 px-4 py-3.5"
//             style={{
//               borderRadius: '16px',
//               background: 'var(--g-bg-mid)',
//               backdropFilter: 'blur(24px) saturate(180%)',
//               WebkitBackdropFilter: 'blur(24px) saturate(180%)',
//               border: '1px solid var(--g-border)',
//               boxShadow: '0 4px 20px rgba(0,0,0,0.15), inset 0 1px 0 var(--g-shine)',
//             }}
//           >
//             <Search style={{ width: '18px', height: '18px', color: 'var(--text-muted)', flexShrink: 0 }} />
//             <input
//               type="text"
//               placeholder={mode === 'instant' ? 'What do you need help with?' : 'Search plumbers, electricians…'}
//               value={searchQuery}
//               onChange={e => setSearchQuery(e.target.value)}
//               onKeyDown={e => e.key === 'Enter' && handleSearch()}
//               className="flex-1 bg-transparent outline-none text-sm"
//               style={{ color: 'var(--text-primary)' }}
//             />
//             {searchQuery && (
//               <button
//                 onClick={handleSearch}
//                 className="px-3 py-1 rounded-xl text-xs font-semibold"
//                 style={{
//                   background: 'var(--accent-deep)',
//                   color: 'var(--accent)',
//                   border: '1px solid #92400E',
//                 }}
//               >
//                 Search
//               </button>
//             )}
//           </div>
//         </motion.div>

//         {/* Mode Toggle — inline, just below search */}
//         <motion.div
//           initial={{ opacity: 0, y: 8 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.15 }}
//         >
//           <InlineModeToggle />
//         </motion.div>
//       </div>

//       {/* ═══════════════════════════════════════
//           MODE CONTENT
//       ═══════════════════════════════════════ */}
//       <AnimatePresence mode="wait">
//         {mode === 'instant' ? (
//           <InstantContent key="instant" onCategorySelect={handleCategorySelect} />
//         ) : (
//           <DiscoveryContent key="discovery" />
//         )}
//       </AnimatePresence>

//       {/* Spacer for bottom nav */}
//       <div className="h-24" />

//       {/* Drawers */}
//       <ProfileMenu
//         open={menuOpen}
//         onClose={() => setMenuOpen(false)}
//         user={user}
//         unreadCount={unreadCount}
//       />
//       <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
//     </div>
//   )
// }

import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, MapPin, ChevronDown, Bell, Sun, Moon } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { CategoryGrid } from '@/components/kaargar/CategoryGrid'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories } from '@/hooks/useCategories'
import { useNotifications } from '@/hooks/useNotifications'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useState } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { NotificationDrawer } from '@/components/kaargar/NotificationDrawer'
import { supabase } from '@/lib/supabase'

/* ── Profile Menu Drawer ── */
function ProfileMenu({ open, onClose, user, unreadCount }) {
  const { logout } = useAuthStore()
  const { theme, toggleTheme } = useAppStore()
  const navigate = useNavigate()
  const isDark = theme === 'dark'
  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'K'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Drawer */}
          <motion.div
            className="fixed inset-x-0 top-0 z-50"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          >
            <div
              className="mx-4 mt-4 rounded-3xl overflow-hidden"
              style={{
                background: isDark ? 'rgba(15,15,15,0.97)' : 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '1px solid var(--g-border)',
              }}
            >
              {/* Profile header */}
              <div className="px-6 pt-6 pb-4" style={{ borderBottom: '1px solid var(--g-border)' }}>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16"
                    style={{ border: '2px solid var(--accent-border)' }}>
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback
                      className="text-xl font-bold"
                      style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
                    >{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-lg font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                      {user?.full_name || 'User'}
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {user?.phone || 'No phone added'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notifications preview */}
              {unreadCount > 0 && (
                <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--g-border)', background: 'var(--surface)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {unreadCount} new notification{unreadCount > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}

              {/* Menu items */}
              <div className="p-3 space-y-0.5">
                {[
                  { label: 'My Bookings', emoji: '📋', to: '/bookings' },
                  { label: 'My Profile',  emoji: '👤', to: '/profile' },
                  { label: 'Messages',    emoji: '💬', to: '/chat' },
                  { label: 'Support',     emoji: '🆘', to: '/support' },
                ].map((item) => (
                  <button
                    key={item.to}
                    onClick={() => { navigate(item.to); onClose() }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--g-bg)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="text-xl">{item.emoji}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}

                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--g-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span className="text-xl">{isDark ? '☀️' : '🌙'}</span>
                  <span className="text-sm font-medium">
                    {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  </span>
                </button>

                {user?.role === 'worker' && (
                  <button
                    onClick={() => { navigate('/worker'); onClose() }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors text-left"
                    style={{
                      background: 'var(--accent)',
                      color: '#000',
                    }}
                  >
                    <span className="text-xl">⚡</span>
                    <span className="text-sm font-semibold">Worker Dashboard</span>
                  </button>
                )}
              </div>

              <div className="px-4 pb-4">
                <button
                  onClick={async () => { await supabase.auth.signOut(); logout(); navigate('/login'); onClose() }}
                  className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
                  style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Sign Out
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Inline Mode Toggle (liquid glass pill) ── */
function InlineModeToggle() {
  const { mode, setMode } = useAppStore()
  const modes = [
    { id: 'instant',   label: 'Instant',  emoji: '⚡', activeBg: 'var(--accent)', activeBorder: 'var(--accent)', activeText: '#000' },
    { id: 'discovery', label: 'Discover', emoji: '🧭', activeBg: 'var(--accent-dim)', activeBorder: 'var(--accent-dim)', activeText: 'var(--accent-soft)' },
  ]

  return (
    <div
      style={{
        display: 'inline-flex',
        padding: '3px',
        gap: '3px',
        borderRadius: '9999px',
        background: 'var(--card)',
        border: '1px solid var(--card-border)',
      }}
    >
      {modes.map(({ id, label, emoji, activeBg, activeBorder, activeText }) => {
        const active = mode === id
        return (
          <button
            key={id}
            onClick={() => setMode(id)}
            className="relative flex items-center gap-2 px-5 py-2 transition-all duration-200 select-none"
            style={{
              borderRadius: '9999px',
              WebkitTapHighlightColor: 'transparent',
              background: active ? activeBg : 'transparent',
              border: active ? `1px solid ${activeBorder}` : '1px solid transparent',
            }}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span
              className="text-sm font-semibold font-clean"
              style={{ color: active ? activeText : 'var(--text-muted)' }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Stat chip ── */
function StatChip({ emoji, label, value }) {
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-2 rounded-2xl flex-shrink-0"
      style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
    >
      <span className="text-base">{emoji}</span>
      <div>
        <p className="text-[12px] leading-none" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-sm font-bold font-mono leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  )
}

/* ── Instant content ── */
function InstantContent({ onCategorySelect }) {
  const { data: categories = [], isLoading } = useCategories('instant')

  return (
    <motion.div
      key="instant"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-5"
    >
      {/* Stats row */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <StatChip emoji="🟢" label="Online workers" value="24+" />
        <StatChip emoji="⏱️" label="Avg. arrival"   value="38 min" />
        <StatChip emoji="⭐" label="Avg. rating"    value="4.8" />
      </div>

      {/* Category grid */}
      <div>
        <p
          className="text-xs uppercase tracking-widest mb-3 font-medium"
          style={{ color: 'var(--text-muted)' }}
        >Pick a service</p>
        {isLoading ? (
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" style={{ background: 'var(--g-bg)' }} />
            ))}
          </div>
        ) : (
          <CategoryGrid categories={categories} onSelect={onCategorySelect} mode="instant" />
        )}
      </div>
    </motion.div>
  )
}

/* ── Discovery content ── */
function DiscoveryContent() {
  const navigate = useNavigate()
  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api.get('/search/recommendations').then(r => r.data).catch(() => []),
    staleTime: 5 * 60_000,
  })

  return (
    <motion.div
      key="discovery"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-5"
    >
      <div>
        <p
          className="text-xs uppercase tracking-widest mb-3 font-medium"
          style={{ color: 'var(--text-muted)' }}
        >Recommended for you</p>
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
            ))
          ) : recommendations.length > 0 ? (
            recommendations.map((worker, i) => (
              <motion.div
                key={worker.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <WorkerCard worker={worker} />
              </motion.div>
            ))
          ) : (
            <button
              onClick={() => navigate('/discover')}
              className="w-full py-10 rounded-2xl text-sm transition-colors"
              style={{
                border: '1px solid var(--g-border)',
                background: 'var(--g-bg)',
                color: 'var(--text-muted)',
              }}
            >
              Browse all professionals →
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ══════════════════════════════════════════════
   MAIN HOMEPAGE
═══════════════════════════════════════════════ */
export default function HomePage() {
  const navigate = useNavigate()
  const { mode, theme, toggleTheme } = useAppStore()
  const { user } = useAuthStore()
  const { unreadCount } = useNotifications()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'K'

  function handleCategorySelect(category) {
    navigate('/job/new', { state: { category } })
  }

  function handleSearch() {
    if (!searchQuery.trim()) return
    if (mode === 'instant') {
      navigate('/job/new', { state: { query: searchQuery } })
    } else {
      navigate(`/discover?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  return (
    <div className="relative min-h-screen px-4">

      {/* ═══════════════════════════════════════
          HERO SECTION — Blinkit/Zomato style
      ═══════════════════════════════════════ */}
      <div className="pt-12 pb-6 space-y-5">

        {/* Top row: Location + Bell + Profile */}
        <div className="flex items-center justify-between">
          {/* Location pill */}
          <button className="flex items-center gap-1.5 group">
            <MapPin className="h-4 w-4 text-amber-400" />
            <span
              className="text-sm font-medium transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >Pune</span>
            <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
          </button>

          {/* Right: bell + avatar */}
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <button
              onClick={() => setNotifOpen(true)}
              style={{
                position: 'relative',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--g-bg)',
                border: '1px solid var(--g-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Bell size={16} style={{ color: 'var(--text-secondary)' }} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    minWidth: '16px',
                    height: '16px',
                    borderRadius: '8px',
                    padding: '0 3px',
                    background: 'var(--accent)',
                    color: '#000',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Profile avatar */}
            <motion.button
              onClick={() => setMenuOpen(true)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              className="relative"
              style={{
                borderRadius: '9999px',
                padding: '2px',
                background: 'var(--card)',
                border: '1px solid var(--card-border)',
                cursor: 'pointer',
              }}
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={user?.avatar_url} />
                <AvatarFallback
                  className="text-sm font-bold"
                  style={{ background: 'var(--surface)', color: 'var(--text-secondary)' }}
                >{initials}</AvatarFallback>
              </Avatar>
            </motion.button>
          </div>
        </div>

        {/* Logo + Tagline */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="flex items-baseline gap-2">
            <span
              style={{ fontFamily: '"Playwrite NO", cursive', fontSize: '22px', fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.4 }}
            >
              Kaargar
            </span>
            <span
              className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              Pune
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Find the best pros · <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Kaam Ho Jayega</span>
          </p>
        </motion.div>

        {/* Search bar — Discovery mode only; Instant jumps straight to categories */}
        {mode !== 'instant' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative"
          >
            <div
              className="flex items-center gap-3 px-4 py-3.5"
              style={{
                borderRadius: '16px',
                background: 'var(--g-bg-mid)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid var(--g-border)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15), inset 0 1px 0 var(--g-shine)',
              }}
            >
              <Search style={{ width: '18px', height: '18px', color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search plumbers, electricians…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
              />
              {searchQuery && (
                <button
                  onClick={handleSearch}
                  className="px-3 py-1 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  Go
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Mode Toggle — inline, just below search */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <InlineModeToggle />
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════
          MODE CONTENT
      ═══════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {mode === 'instant' ? (
          <InstantContent key="instant" onCategorySelect={handleCategorySelect} />
        ) : (
          <DiscoveryContent key="discovery" />
        )}
      </AnimatePresence>

      {/* Spacer for bottom nav */}
      <div className="h-24" />

      {/* Drawers */}
      <ProfileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        unreadCount={unreadCount}
      />
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  )
}
