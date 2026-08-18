-- Allow anon to read the media table so PostgREST can resolve
-- joined media fields (cover_media, logo_media) in public queries.
-- The media table only stores bucket names and storage paths that
-- point to already-public Storage objects — no sensitive data.

CREATE POLICY "anon_select_media"
  ON media FOR SELECT TO anon
  USING (true);
