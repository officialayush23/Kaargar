-- ============================================================
-- KAARGAR SEED DATA — run this in Supabase SQL Editor
-- Safe to re-run: uses ON CONFLICT DO NOTHING
-- ============================================================

-- INSTANT MODE CATEGORIES
INSERT INTO public.categories (name, slug, icon_name, color_hex, mode, sort_order, min_price) VALUES
  ('Electrician',        'electrician',       'Zap',           '#F59E0B', 'instant',   1,  150),
  ('Plumber',            'plumber',           'Droplets',      '#3B82F6', 'instant',   2,  150),
  ('AC Repair',          'ac-repair',         'Wind',          '#06B6D4', 'instant',   3,  200),
  ('Carpenter',          'carpenter',         'Hammer',        '#92400E', 'instant',   4,  150),
  ('Appliance Repair',   'appliance-repair',  'WashingMachine','#7C3AED', 'instant',   5,  150),
  ('House Cleaning',     'house-cleaning',    'Sparkles',      '#10B981', 'instant',   6,  200),
  ('Painter',            'painter',           'Brush',         '#F97316', 'instant',   7,  300),
  ('Locksmith',          'locksmith',         'KeyRound',      '#6B7280', 'instant',   8,  150),
  ('Computer Repair',    'computer-repair',   'Laptop',        '#8B5CF6', 'instant',   9,  200),
  ('Pest Control',       'pest-control',      'Bug',           '#DC2626', 'instant',  10,  300),
  ('Handyman',           'handyman',          'Wrench',        '#78716C', 'instant',  11,  150),
  ('Moving Help',        'moving-help',       'PackageOpen',   '#0EA5E9', 'instant',  12,  300),
  ('Mechanic',           'mechanic',          'Car',           '#374151', 'instant',  13,  200),
  ('Furniture Assembly', 'furniture-assembly','Armchair',       '#B45309', 'instant',  14,  150)
ON CONFLICT (slug) DO NOTHING;

-- DISCOVERY MODE CATEGORIES
INSERT INTO public.categories (name, slug, icon_name, color_hex, mode, sort_order, min_price) VALUES
  ('Photographer',       'photographer',      'Camera',        '#EC4899', 'discovery',  1, 500),
  ('Videographer',       'videographer',      'Video',         '#EF4444', 'discovery',  2, 800),
  ('Musician / Band',    'musician',          'Music',         '#8B5CF6', 'discovery',  3, 500),
  ('DJ',                 'dj',                'Disc3',         '#7C3AED', 'discovery',  4, 2000),
  ('Interior Designer',  'interior-designer', 'Home',          '#F59E0B', 'discovery',  5, 2000),
  ('Wedding Planner',    'wedding-planner',   'Heart',         '#EC4899', 'discovery',  6, 5000),
  ('Event Decorator',    'event-decorator',   'PartyPopper',   '#F97316', 'discovery',  7, 1500),
  ('Personal Trainer',   'personal-trainer',  'Dumbbell',      '#10B981', 'discovery',  8, 500),
  ('Yoga Instructor',    'yoga-instructor',   'Leaf',          '#34D399', 'discovery',  9, 400),
  ('Private Tutor',      'tutor',             'GraduationCap', '#3B82F6', 'discovery', 10, 300),
  ('Chef / Cook',        'chef',              'ChefHat',       '#F59E0B', 'discovery', 11, 800),
  ('Beautician',         'beautician',        'Scissors',      '#EC4899', 'discovery', 12, 300),
  ('Makeup Artist',      'makeup-artist',     'Sparkles',      '#A855F7', 'discovery', 13, 500),
  ('Mehndi Artist',      'mehndi',            'Hand',          '#EA580C', 'discovery', 14, 300),
  ('Catering Service',   'catering',          'UtensilsCrossed','#EAB308','discovery', 15, 2000),
  ('Security Guard',     'security',          'Shield',        '#1E40AF', 'both',      16, 500)
ON CONFLICT (slug) DO NOTHING;

-- PLATFORM CONFIG
INSERT INTO public.platform_config (key, value, description) VALUES
  ('instant_commission_rate',             '0.15',   '15% flat for instant jobs'),
  ('discovery_commission_min_rate',       '0.10',   '10% min for discovery'),
  ('discovery_commission_max_rate',       '0.15',   '15% max for discovery'),
  ('discovery_commission_scale_amount',   '50000',  'Amount at which max rate applies'),
  ('gst_rate',                            '0.18',   '18% GST on platform fee'),
  ('escrow_release_hours',               '2',       'Hours before escrow auto-releases'),
  ('cancellation_penalty_user_inr',       '50',     'User cancel penalty INR'),
  ('cancellation_penalty_worker_inr',     '100',    'Worker cancel penalty INR'),
  ('matching_initial_radius_km',          '2',      'Start matching at 2km'),
  ('matching_max_radius_km',             '5',       'Max matching radius'),
  ('matching_radius_step_km',            '1',       'Radius expansion step'),
  ('matching_request_timeout_sec',       '10',      'Worker response window'),
  ('max_workers_per_dispatch',           '5',       'Workers notified per round'),
  ('cancellation_decay_on_cancel',        '0.10',   'Score deducted on worker cancel'),
  ('cancellation_recovery_per_job',       '0.02',   'Score recovered per completed job'),
  ('auto_offline_reject_threshold',       '5',       'Consecutive rejects before auto-offline'),
  ('auto_offline_duration_min',           '5',       'Auto-offline duration in minutes'),
  ('launch_city',                         'Pune',    'Active city'),
  ('launch_city_lat',                     '18.5204', 'Pune center lat'),
  ('launch_city_lon',                     '73.8567', 'Pune center lon')
ON CONFLICT (key) DO NOTHING;

-- PUNE AREAS
INSERT INTO public.pune_areas (name, lat, lon) VALUES
  ('Hinjewadi',       18.5912, 73.7383),
  ('Kothrud',         18.5074, 73.8068),
  ('Aundh',           18.5590, 73.8080),
  ('Baner',           18.5590, 73.7868),
  ('Wakad',           18.5999, 73.7577),
  ('Pimpri-Chinchwad',18.6279, 73.7998),
  ('Hadapsar',        18.5018, 73.9263),
  ('Kharadi',         18.5514, 73.9370),
  ('Viman Nagar',     18.5679, 73.9143),
  ('Kalyani Nagar',   18.5461, 73.9008),
  ('Koregaon Park',   18.5362, 73.8929),
  ('Camp',            18.5186, 73.8795),
  ('Shivajinagar',    18.5308, 73.8474),
  ('Deccan',          18.5190, 73.8440),
  ('Katraj',          18.4529, 73.8535),
  ('Kondhwa',         18.4660, 73.8911),
  ('Magarpatta',      18.5132, 73.9272),
  ('Sinhagad Road',   18.4780, 73.8220),
  ('Warje',           18.4860, 73.8050),
  ('Bavdhan',         18.5180, 73.7760)
ON CONFLICT (name) DO NOTHING;
