-- Grant authenticated users full access to the media table.
-- media stores only file metadata (bucket name, storage path) for
-- images already in public Storage buckets — no sensitive data.

CREATE POLICY "authenticated_manage_media"
  ON media FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
