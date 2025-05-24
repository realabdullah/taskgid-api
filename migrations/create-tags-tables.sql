-- Migration: Create tags and task_tags tables
-- Description: Add tags/labels functionality for better task organization

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#3b82f6',
    description TEXT,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_tag_per_workspace UNIQUE (name, workspace_id),
    CONSTRAINT valid_color_format CHECK (color ~ '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$')
);

-- Create task_tags junction table
CREATE TABLE IF NOT EXISTS task_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_task_tag UNIQUE (task_id, tag_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tags_workspace_id ON tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tags_created_by_id ON tags(created_by_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);

-- Add some default tags for existing workspaces (optional)
-- You can uncomment and modify these as needed
/*
INSERT INTO tags (name, color, description, workspace_id, created_by_id)
SELECT 
    'Bug' as name,
    '#ef4444' as color,
    'Issues and bugs that need to be fixed' as description,
    w.id as workspace_id,
    w.user_id as created_by_id
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM tags t 
    WHERE t.name = 'Bug' AND t.workspace_id = w.id
);

INSERT INTO tags (name, color, description, workspace_id, created_by_id)
SELECT 
    'Feature' as name,
    '#10b981' as color,
    'New features and enhancements' as description,
    w.id as workspace_id,
    w.user_id as created_by_id
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM tags t 
    WHERE t.name = 'Feature' AND t.workspace_id = w.id
);

INSERT INTO tags (name, color, description, workspace_id, created_by_id)
SELECT 
    'Documentation' as name,
    '#3b82f6' as color,
    'Documentation related tasks' as description,
    w.id as workspace_id,
    w.user_id as created_by_id
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM tags t 
    WHERE t.name = 'Documentation' AND t.workspace_id = w.id
);
*/ 