import { Star, MapPin, Briefcase, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'

export function WorkerCard({ worker, index = 0 }) {
  const navigate = useNavigate()
  const workerId = worker.worker_id || worker.id
  const workerName = worker.full_name || worker.worker_name || 'Worker'
  const workerCategory = worker.primary_category || worker.name || 'Professional'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => navigate(`/worker/${workerId}`)}
      className="glass-light rounded-2xl p-4 flex gap-4 cursor-pointer card-hover active:scale-[0.98] transition-all"
    >
      <div className="relative">
        <Avatar src={worker.avatar_url} name={workerName} size="lg" />
        {worker.status === 'online' && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-instant rounded-full border-2 border-bg-surface" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-[--text-primary] truncate font-syne">
              {workerName}
            </h3>
            <p className="text-xs text-[--text-secondary] mt-0.5">
              {workerCategory}
            </p>
          </div>
          {worker.verification_status === 'approved' && (
            <CheckCircle size={14} className="text-brand shrink-0 mt-0.5" />
          )}
        </div>

        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1">
            <Star size={12} className="text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-mono text-[--text-primary]">
              {Number(worker.avg_rating || 0).toFixed(1)}
            </span>
            <span className="text-xs text-[--text-muted]">({worker.rating_count || 0})</span>
          </div>

          <div className="flex items-center gap-1">
            <Briefcase size={11} className="text-[--text-muted]" />
            <span className="text-xs text-[--text-muted]">{worker.total_jobs_completed} jobs</span>
          </div>

          {worker.pune_area && (
            <div className="flex items-center gap-1">
              <MapPin size={11} className="text-[--text-muted]" />
              <span className="text-xs text-[--text-muted] truncate">{worker.pune_area}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
