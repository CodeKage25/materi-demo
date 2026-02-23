CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_id uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON workspace_members(workspace_id);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces ON DELETE CASCADE NOT NULL,
  title text NOT NULL DEFAULT 'Untitled',
  content jsonb,
  created_by uuid REFERENCES auth.users NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);

CREATE TABLE IF NOT EXISTS document_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_document_id ON document_ai_messages(document_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_select_members" ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspaces_insert_owner" ON workspaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "workspaces_update_owner" ON workspaces
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "workspaces_delete_owner" ON workspaces
  FOR DELETE USING (auth.uid() = owner_id);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select" ON workspace_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "workspace_members_insert_owner" ON workspace_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
    OR auth.uid() = user_id
  );

CREATE POLICY "workspace_members_delete_owner" ON workspace_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
    OR auth.uid() = user_id
  );

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_members" ON documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "documents_insert_members" ON documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id AND wm.user_id = auth.uid()
    )
    AND auth.uid() = created_by
  );

CREATE POLICY "documents_update_members" ON documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = documents.workspace_id AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "documents_delete_owner_or_creator" ON documents
  FOR DELETE USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
  );

ALTER TABLE document_ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_messages_select" ON document_ai_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_id AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_messages_insert" ON document_ai_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM documents d
      JOIN workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_id AND wm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE OR REPLACE FUNCTION create_workspace(p_name text, p_slug text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO workspaces (name, slug, owner_id)
  VALUES (p_name, p_slug, v_user_id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  RETURN json_build_object('id', v_workspace_id, 'slug', p_slug, 'name', p_name);
END;
$$;

CREATE OR REPLACE FUNCTION create_document(p_workspace_id uuid, p_title text DEFAULT 'Untitled')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_doc_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO documents (workspace_id, title, created_by)
  VALUES (p_workspace_id, p_title, v_user_id)
  RETURNING id INTO v_doc_id;

  RETURN json_build_object('id', v_doc_id, 'title', p_title);
END;
$$;

GRANT EXECUTE ON FUNCTION create_workspace(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_document(uuid, text) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;
GRANT SELECT, INSERT ON document_ai_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
