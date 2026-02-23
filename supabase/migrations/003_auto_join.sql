CREATE OR REPLACE FUNCTION auto_join_workspace(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT id INTO v_workspace_id
  FROM workspaces
  WHERE slug = p_slug;

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, auth.uid(), 'member')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION auto_join_workspace(text) TO authenticated;
