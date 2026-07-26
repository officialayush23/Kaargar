-- 015_seed_instant_catalog.sql
--
-- Seeds the admin-curated Instant-mode service catalog (service_catalog,
-- migration 013) for every category that supports Instant mode
-- (categories.mode IN ('instant','both')). Excludes categories whose mode
-- is 'discovery'-only (currently just Yoga / Fitness) since those can
-- never surface in Instant mode anyway.
--
-- Sourced two ways per the brainstorming decision ("add all the services
-- available in Urban Company for our listed professions and for others
-- leave it and just add common services"):
--   - Electrician, Plumber, Carpenter, AC Technician, Washing Machine,
--     Deep Cleaning, Painter, Pest Control, Refrigerator Repair, Barber,
--     Beautician: mirrors Urban Company's actual service breakdown for
--     the equivalent category.
--   - CCTV/Security, Driver, Packers & Movers, Gardener, Babysitter,
--     Photographer: Urban Company doesn't offer these (or not in a
--     directly comparable form), so these are common, sensibly-scoped
--     services for each profession based on how they're typically sold
--     elsewhere (JustDial/Housejoy/UrbanClap-adjacent listings, general
--     market research) rather than a 1:1 UC mirror.
--
-- Idempotent — safe to re-run: each INSERT is guarded by a NOT EXISTS
-- check on (category_id, name) so running this twice never creates
-- duplicate catalog entries (e.g. Electrician already has two entries
-- from earlier manual testing — "Ceiling Fan Installation " and
-- "Fan Repair " — those are left untouched, not duplicated).
--
-- created_by is set to the first admin user found; NULL is also valid
-- (the column is nullable) if no admin exists yet in a fresh environment.

BEGIN;

DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1;

  -- Helper macro-by-convention: each block below is
  --   INSERT ... SELECT category_id, name, description, sort_order, admin_id
  --   FROM categories WHERE name = '<Category>'
  --   AND NOT EXISTS (SELECT 1 FROM service_catalog WHERE category_id = categories.id AND name = '<name>')

  -- ── Electrician ──────────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Switch & Socket Repair', 'Fixing or replacing faulty switches and power sockets', 1),
    ('Wiring Job', 'New wiring or rewiring for a room or full home', 2),
    ('MCB / Fuse Repair', 'Diagnosing and fixing tripped MCBs or blown fuses', 3),
    ('Doorbell / Intercom Installation', 'Installing or repairing doorbells and intercom systems', 4),
    ('Geyser Installation', 'Mounting and electrical connection for a new geyser', 5),
    ('Light / Tube Light Fitting', 'Installing or replacing ceiling lights, tube lights, and fittings', 6),
    ('Electrical Panel / Board Repair', 'Repairing distribution boards and electrical panels', 7),
    ('Inverter / Stabilizer Installation', 'Installing and wiring home inverters or voltage stabilizers', 8)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Electrician'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Plumber ──────────────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Tap Repair & Installation', 'Fixing leaky taps or installing new ones', 1),
    ('Mixer Installation', 'Installing kitchen or bathroom mixer taps', 2),
    ('Toilet / Commode Installation', 'Installing or replacing a toilet seat/commode', 3),
    ('Wash Basin Installation', 'Installing or replacing a wash basin', 4),
    ('Pipe Leakage Repair', 'Locating and fixing leaking water pipes', 5),
    ('Drainage / Blockage Clearing', 'Clearing blocked drains and sewage lines', 6),
    ('Water Tank Cleaning', 'Cleaning and sanitizing overhead/underground water tanks', 7),
    ('Bathroom Fittings Installation', 'Installing showers, health faucets, and other bathroom fittings', 8),
    ('Geyser Plumbing Connection', 'Water-line connection for a newly installed geyser', 9)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Plumber'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Carpenter ────────────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Door Repair', 'Fixing sagging, jammed, or damaged doors', 1),
    ('Window Repair', 'Fixing window frames, hinges, and glass panels', 2),
    ('Furniture Repair', 'Repairing chairs, tables, cabinets, and other furniture', 3),
    ('Lock Installation & Repair', 'Installing or repairing door/cabinet locks', 4),
    ('Curtain Rod Installation', 'Mounting curtain rods and tracks', 5),
    ('Bed / Wardrobe Assembly', 'Assembling flat-pack or modular beds and wardrobes', 6),
    ('Modular Furniture Repair', 'Repairing modular kitchen or wardrobe fittings', 7),
    ('False Ceiling Repair', 'Fixing damaged or sagging false ceiling panels', 8)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Carpenter'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── AC Technician ────────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('AC General Service', 'Routine cleaning and check-up to keep your AC running efficiently', 1),
    ('AC Repair', 'Diagnosing and fixing AC cooling or performance issues', 2),
    ('AC Gas Refill', 'Refilling refrigerant gas for weak cooling', 3),
    ('AC Installation', 'Mounting and installing a new split/window AC unit', 4),
    ('AC Uninstallation', 'Safely removing an AC unit, e.g. before shifting homes', 5),
    ('AC Deep Cleaning (Jet Service)', 'High-pressure jet cleaning of AC coils and filters', 6)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'AC Technician'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Washing Machine ──────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Washing Machine Repair', 'Fixing drainage, spin, or motor issues', 1),
    ('Washing Machine Installation', 'Setting up and connecting a newly purchased washing machine', 2),
    ('Washing Machine General Service', 'Routine cleaning and maintenance check-up', 3),
    ('Front-Load Machine Repair', 'Repairs specific to front-loading washing machines', 4),
    ('Top-Load Machine Repair', 'Repairs specific to top-loading washing machines', 5)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Washing Machine'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Deep Cleaning ────────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Full Home Deep Cleaning', 'Complete deep clean of every room in the home', 1),
    ('Bathroom Deep Cleaning', 'Descaling, degreasing, and sanitizing bathrooms', 2),
    ('Kitchen Deep Cleaning', 'Degreasing chimneys, countertops, cabinets, and appliances', 3),
    ('Sofa Cleaning', 'Vacuum + shampoo cleaning for sofas and upholstery', 4),
    ('Carpet Cleaning', 'Deep shampoo cleaning for carpets and rugs', 5),
    ('Mattress Cleaning', 'Vacuum and sanitization cleaning for mattresses', 6)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Deep Cleaning'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Painter ──────────────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Full Home Painting', 'Complete interior painting for the whole home', 1),
    ('Single Room Painting', 'Painting for one room', 2),
    ('Waterproofing', 'Waterproofing treatment for walls, terrace, or bathroom', 3),
    ('Wall Texture / Design Painting', 'Textured or decorative wall finishes', 4),
    ('Wood Polish / Varnish', 'Polishing or varnishing wooden doors, furniture, and fittings', 5)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Painter'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Pest Control ─────────────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('General Pest Control', 'All-round pest treatment for the home', 1),
    ('Cockroach Control', 'Targeted treatment for cockroach infestations', 2),
    ('Termite Control', 'Anti-termite treatment for walls and woodwork', 3),
    ('Bed Bug Control', 'Targeted treatment for bed bug infestations', 4),
    ('Rodent Control', 'Rat/mice control and prevention', 5),
    ('Mosquito Control', 'Fogging and larvicidal treatment for mosquitoes', 6)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Pest Control'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Refrigerator Repair ──────────────────────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Refrigerator Repair', 'Diagnosing and fixing cooling or mechanical issues', 1),
    ('Refrigerator Gas Refill', 'Refilling refrigerant gas for weak cooling', 2),
    ('Refrigerator General Service', 'Routine cleaning and maintenance check-up', 3),
    ('Refrigerator Installation', 'Setting up a newly purchased refrigerator', 4)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Refrigerator Repair'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── CCTV / Security (not a Urban Company category — common services) ─────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('CCTV Camera Installation', 'Installing new CCTV cameras and DVR/NVR setup', 1),
    ('CCTV Maintenance / Repair', 'Fixing or servicing an existing CCTV system', 2),
    ('Video Door Phone Installation', 'Installing a video door phone system', 3),
    ('Home Security System Setup', 'Setting up alarms and sensors for home security', 4),
    ('Biometric / Smart Lock Installation', 'Installing biometric or smart door locks', 5)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'CCTV / Security'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Barber (Urban Company "Salon for Men") ────────────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Haircut', 'Classic or styled haircut at home', 1),
    ('Beard Trim & Shave', 'Beard shaping, trimming, or a clean shave', 2),
    ('Hair Colour', 'Hair colouring service for men', 3),
    ('Facial (Men)', 'Cleansing and refreshing facial for men', 4),
    ('Head Massage', 'Relaxing oil or dry head massage', 5),
    ('Kids Haircut', 'Haircut service for children', 6)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Barber'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Driver (not a Urban Company category — common services) ──────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Daily Commute Driver', 'Driver for your daily to-and-fro commute', 1),
    ('Outstation Trip Driver', 'Driver for out-of-city trips', 2),
    ('Airport Drop / Pickup', 'One-way airport drop or pickup drive', 3),
    ('Monthly Driver on Rent', 'A dedicated driver on a monthly basis', 4),
    ('Wedding / Event Driver', 'Driver for weddings and special events', 5)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Driver'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Packers & Movers (not a Urban Company category — common services) ────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Local Home Shifting', 'Packing and moving within the same city', 1),
    ('Intercity Shifting', 'Packing and moving between cities', 2),
    ('Office Relocation', 'Packing and moving office furniture and equipment', 3),
    ('Packing Only Service', 'Professional packing without transportation', 4),
    ('Loading & Unloading', 'Loading/unloading labour only, no transport', 5),
    ('Vehicle Transportation', 'Transporting a car or two-wheeler between cities', 6)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Packers & Movers'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Gardener (not a Urban Company category — common services) ────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Garden Maintenance', 'General upkeep of an existing garden', 1),
    ('Lawn Mowing', 'Mowing and edging of lawn grass', 2),
    ('Plant Care & Watering', 'Routine watering and plant health check-up', 3),
    ('Landscaping', 'Designing and setting up a new garden layout', 4),
    ('Tree Trimming', 'Pruning and trimming trees and hedges', 5)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Gardener'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Beautician (Urban Company "Salon for Women") ──────────────────────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Haircut & Styling', 'Haircut and styling service for women', 1),
    ('Facial', 'Cleansing and rejuvenating facial treatment', 2),
    ('Waxing', 'Full or partial body waxing', 3),
    ('Manicure', 'Nail care and hand treatment', 4),
    ('Pedicure', 'Foot care and nail treatment', 5),
    ('Threading', 'Eyebrow and facial hair threading', 6),
    ('Hair Spa', 'Deep conditioning hair spa treatment', 7),
    ('Bridal Makeup', 'Full bridal makeup and styling', 8)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Beautician'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Babysitter (not a Urban Company category — common services) ──────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Full-Day Babysitting', 'A full day of childcare at your home', 1),
    ('Hourly Babysitting', 'Short-notice, hourly childcare', 2),
    ('Overnight Childcare', 'Overnight childcare supervision', 3),
    ('Newborn Care', 'Specialized care for newborns and infants', 4)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Babysitter'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

  -- ── Photographer (not a Urban Company category — common services) ────────
  INSERT INTO service_catalog (category_id, name, description, sort_order, status, created_by)
  SELECT c.id, v.name, v.description, v.sort_order, 'approved', admin_id
  FROM categories c
  CROSS JOIN (VALUES
    ('Event Photography', 'Photography coverage for parties and events', 1),
    ('Portrait Photoshoot', 'Personal or family portrait photoshoot', 2),
    ('Product Photography', 'Photography for e-commerce/product listings', 3),
    ('Videography', 'Video coverage and basic editing for an event', 4)
  ) AS v(name, description, sort_order)
  WHERE c.name = 'Photographer'
    AND NOT EXISTS (
      SELECT 1 FROM service_catalog sc WHERE sc.category_id = c.id AND sc.name = v.name
    );

END $$;

COMMIT;
