-- 016_address_details.sql
-- Adds a free-text "plot/flat/house no. + landmark" field to saved addresses,
-- separate from the geocoded address_line (which comes from the map/search
-- autocomplete and shouldn't be hand-edited to include unit-level detail that
-- the geocoder doesn't know about). Nullable/optional — existing addresses
-- are unaffected.
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS details TEXT;
