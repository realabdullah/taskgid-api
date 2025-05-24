# Tags/Labels Feature Documentation

## Overview

The Tags/Labels feature enables better organization and filtering of tasks within workspaces. Users can create custom tags with colors and descriptions, assign them to tasks, and use them for advanced filtering and search.

## Features

### Tag Management
- **Create Tags**: Create custom tags with names, colors, and descriptions
- **Edit Tags**: Update tag properties including name, color, and description
- **Delete Tags**: Remove tags (automatically removes associations with tasks)
- **List Tags**: View all tags in a workspace with pagination and search
- **Tag Statistics**: See how many tasks are associated with each tag

### Task Integration
- **Assign Tags**: Add multiple tags to tasks during creation or editing
- **Remove Tags**: Remove tags from tasks
- **Filter by Tags**: Filter tasks by one or more tags
- **Search with Tags**: Include tags in advanced search functionality
- **Export with Tags**: Tags are included in CSV and PDF exports

## API Endpoints

### Tag Management

#### Create Tag
```http
POST /api/workspaces/:workspaceSlug/tags
```

**Request Body:**
```json
{
  "name": "Bug",
  "color": "#ef4444",
  "description": "Issues and bugs that need to be fixed"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "tag-uuid",
    "name": "Bug",
    "color": "#ef4444",
    "description": "Issues and bugs that need to be fixed",
    "workspaceId": "workspace-uuid",
    "createdById": "user-uuid",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "creator": {
      "id": "user-uuid",
      "username": "john_doe",
      "firstName": "John",
      "lastName": "Doe"
    }
  }
}
```

#### Get Workspace Tags
```http
GET /api/workspaces/:workspaceSlug/tags?page=1&limit=10&search=bug&sortBy=name&sortOrder=ASC
```

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Number of items per page
- `search` (optional): Search term for tag names
- `sortBy` (optional): Sort by field (`name`, `createdAt`)
- `sortOrder` (optional): Sort order (`ASC`, `DESC`)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "tag-uuid",
      "name": "Bug",
      "color": "#ef4444",
      "description": "Issues and bugs that need to be fixed",
      "taskCount": 5,
      "creator": {
        "id": "user-uuid",
        "username": "john_doe",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 1,
    "itemsPerPage": 10
  }
}
```

#### Get Single Tag
```http
GET /api/workspaces/:workspaceSlug/tags/:tagId
```

#### Update Tag
```http
PUT /api/workspaces/:workspaceSlug/tags/:tagId
```

**Request Body:**
```json
{
  "name": "Critical Bug",
  "color": "#dc2626",
  "description": "Critical issues that need immediate attention"
}
```

#### Delete Tag
```http
DELETE /api/workspaces/:workspaceSlug/tags/:tagId
```

#### Get Tag Tasks
```http
GET /api/workspaces/:workspaceSlug/tags/:tagId/tasks?page=1&limit=10
```

### Task Integration

#### Create Task with Tags
```http
POST /api/workspaces/:workspaceSlug/tasks
```

**Request Body:**
```json
{
  "title": "Fix login bug",
  "description": "Users cannot log in with special characters",
  "status": "todo",
  "priority": "high",
  "dueDate": "2024-12-31",
  "assignees": ["john_doe"],
  "tags": ["Bug", "Critical"]
}
```

#### Update Task Tags
```http
PUT /api/workspaces/:workspaceSlug/tasks/:taskId
```

**Request Body:**
```json
{
  "tags": ["Bug", "Frontend", "Critical"]
}
```

#### Filter Tasks by Tags
```http
GET /api/workspaces/:workspaceSlug/tasks?tags=Bug,Feature&status=todo
```

#### Advanced Search with Tags
```http
GET /api/workspaces/:workspaceSlug/tasks/search?tags=Bug&priority=high&assignee=me
```

## Database Schema

### Tags Table
```sql
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#3b82f6',
    description TEXT,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_tag_per_workspace UNIQUE (name, workspace_id),
    CONSTRAINT valid_color_format CHECK (color ~ '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$')
);
```

### Task Tags Junction Table
```sql
CREATE TABLE task_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_task_tag UNIQUE (task_id, tag_id)
);
```

## Usage Examples

### Creating Common Tags
```javascript
// Create common tags for a development workspace
const commonTags = [
  { name: "Bug", color: "#ef4444", description: "Issues and bugs" },
  { name: "Feature", color: "#10b981", description: "New features" },
  { name: "Documentation", color: "#3b82f6", description: "Documentation tasks" },
  { name: "Testing", color: "#f59e0b", description: "Testing related tasks" },
  { name: "Critical", color: "#dc2626", description: "Critical priority items" },
  { name: "Frontend", color: "#8b5cf6", description: "Frontend development" },
  { name: "Backend", color: "#06b6d4", description: "Backend development" }
];
```

### Filtering Tasks
```javascript
// Get all high-priority bug tasks assigned to current user
GET /api/workspaces/my-workspace/tasks?tags=Bug&priority=high&assignee=me

// Get all feature tasks due this week
GET /api/workspaces/my-workspace/tasks?tags=Feature&dueDateFrom=2024-01-01&dueDateTo=2024-01-07

// Advanced search for critical frontend bugs
GET /api/workspaces/my-workspace/tasks/search?tags=Bug,Critical,Frontend&status=todo,in_progress
```

### Export with Tags
```javascript
// Export all tasks with their tags to CSV
GET /api/workspaces/my-workspace/tasks/export/csv

// Export only bug tasks to PDF
GET /api/workspaces/my-workspace/tasks/export/pdf?tags=Bug
```

## Best Practices

### Tag Naming
- Use clear, descriptive names
- Keep names short (under 20 characters)
- Use consistent naming conventions (e.g., PascalCase or lowercase)
- Avoid special characters

### Color Coding
- Use consistent color schemes across your workspace
- Red for bugs/issues (#ef4444)
- Green for features/enhancements (#10b981)
- Blue for documentation (#3b82f6)
- Orange for testing (#f59e0b)
- Purple for design (#8b5cf6)

### Tag Organization
- Create a standard set of tags for your team
- Limit the number of tags per task (3-5 maximum)
- Use hierarchical naming for related tags (e.g., "Frontend-Bug", "Backend-Bug")
- Regularly review and clean up unused tags

### Filtering and Search
- Combine tag filters with other filters for precise results
- Use multiple tags for AND filtering (task must have all tags)
- Save common filter combinations as bookmarks
- Use tag statistics to identify bottlenecks

## Activity Logging

The system automatically logs tag-related activities:
- `tags_added`: When tags are added to a task
- `tags_removed`: When tags are removed from a task

These activities appear in task activity feeds and workspace activity logs.

## Permissions

Tag management follows workspace permissions:
- **Workspace Members**: Can view tags and assign them to tasks
- **Workspace Admins**: Can create, edit, and delete tags
- **Tag Creators**: Can edit and delete their own tags

## Migration

To add the tags feature to an existing system:

1. Run the database migration:
```sql
-- See migrations/create-tags-tables.sql
```

2. Update your application to include the new models and associations

3. Optionally create default tags for existing workspaces

## Performance Considerations

- Tags are indexed for fast filtering and search
- Tag counts are calculated dynamically but can be cached
- Consider pagination for workspaces with many tags
- Use database-level constraints to maintain data integrity

## Future Enhancements

Potential improvements to the tags feature:
- Tag templates for new workspaces
- Tag hierarchies and categories
- Tag-based notifications and automation
- Tag analytics and reporting
- Bulk tag operations
- Tag import/export functionality 