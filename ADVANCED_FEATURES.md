# Advanced Features Documentation

This document describes the advanced search and export features implemented in the task management API.

## Advanced Search & Filtering

### Overview
The advanced search functionality provides powerful filtering and querying capabilities for tasks within a workspace.

### Endpoint
```
GET /api/workspaces/{workspaceSlug}/tasks/search
```

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `search` | string | Search term for task title, description, and optionally comments | `"urgent bug"` |
| `assignee` | string | Filter by assignee username, 'me', or 'unassigned' | `"john_doe"`, `"me"`, `"unassigned"` |
| `creator` | string | Filter by task creator username | `"jane_smith"` |
| `status` | string/array | Filter by task status | `"todo"` or `["todo","in_progress"]` |
| `priority` | string/array | Filter by task priority | `"high"` or `["high","medium"]` |
| `dueDateFrom` | ISO date | Filter tasks due after this date | `"2024-01-01T00:00:00Z"` |
| `dueDateTo` | ISO date | Filter tasks due before this date | `"2024-12-31T23:59:59Z"` |
| `createdFrom` | ISO date | Filter tasks created after this date | `"2024-01-01T00:00:00Z"` |
| `createdTo` | ISO date | Filter tasks created before this date | `"2024-12-31T23:59:59Z"` |
| `sortBy` | string | Sort by field | `"title"`, `"dueDate"`, `"priority"`, `"createdAt"`, `"updatedAt"`, `"status"` |
| `sortOrder` | string | Sort order | `"ASC"` or `"DESC"` |
| `includeComments` | boolean | Include comment content in search | `true` or `false` |
| `page` | number | Page number for pagination | `1` |
| `limit` | number | Number of items per page | `10` |

### Example Requests

**Find all high-priority tasks assigned to me:**
```
GET /api/workspaces/my-workspace/tasks/search?assignee=me&priority=high&status=todo,in_progress
```

**Find overdue tasks:**
```
GET /api/workspaces/my-workspace/tasks/search?dueDateTo=2024-01-15T00:00:00Z&status=todo,in_progress
```

**Search with comment content:**
```
GET /api/workspaces/my-workspace/tasks/search?search=database&includeComments=true
```

### Response Format
```json
{
  "success": true,
  "data": {
    "data": [...], // Array of tasks
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 47,
      "itemsPerPage": 10
    },
    "searchMetadata": {
      "searchTerm": "urgent bug",
      "filters": {
        "status": ["todo", "in_progress"],
        "priority": ["high"],
        "assignee": "me",
        "creator": null,
        "dueDateRange": null,
        "createdDateRange": null
      },
      "sorting": {
        "field": "createdAt",
        "order": "DESC"
      },
      "includeComments": false
    }
  }
}
```

## Export Functionality

### Task Export

#### CSV Export
```
GET /api/workspaces/{workspaceSlug}/tasks/export/csv
```

**Supports all the same filtering parameters as advanced search**

**Response**: CSV file download with columns:
- ID, Title, Description, Status, Priority, Due Date, Creator, Assignees, Comment Count, Created At, Updated At

#### PDF Export (HTML Format)
```
GET /api/workspaces/{workspaceSlug}/tasks/export/pdf
```

**Supports all the same filtering parameters as advanced search**

**Response**: HTML file formatted for printing/PDF conversion

### Workspace Export

#### Comprehensive Workspace Data Export
```
GET /api/workspaces/{workspaceSlug}/export/csv
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `includeTasks` | boolean | `true` | Include tasks in export |
| `includeMembers` | boolean | `true` | Include team members in export |
| `includeActivities` | boolean | `false` | Include recent activities in export |

**Response**: Multi-section CSV file containing:
- Workspace overview
- Tasks (if includeTasks=true)
- Team members with task statistics (if includeMembers=true)
- Recent activities (if includeActivities=true, limited to 100 most recent)

### Example Export Requests

**Export all high-priority tasks:**
```
GET /api/workspaces/my-workspace/tasks/export/csv?priority=high
```

**Export tasks created this month:**
```
GET /api/workspaces/my-workspace/tasks/export/csv?createdFrom=2024-01-01T00:00:00Z
```

**Export complete workspace data:**
```
GET /api/workspaces/my-workspace/export/csv?includeTasks=true&includeMembers=true&includeActivities=true
```

## Authentication & Authorization

All advanced search and export endpoints require:
- Valid authentication token
- Workspace membership (verified by `checkMemberMiddleware`)

## Performance Considerations

1. **Search Performance**: Complex queries with multiple filters may take longer. Consider implementing caching for frequently used searches.

2. **Export Limits**: Large exports may consume significant server resources. Consider implementing:
   - Background job processing for large exports
   - Rate limiting on export endpoints
   - Maximum record limits

3. **Database Optimization**: Ensure proper indexes on commonly filtered fields:
   - `tasks.status`
   - `tasks.priority`
   - `tasks.dueDate`
   - `tasks.createdAt`
   - `task_assignees.userId`

## Future Enhancements

2. **Real PDF Generation**: Integrate puppeteer or similar library for actual PDF generation
3. **Excel Export**: Add XLSX export format
5. **Full-Text Search**: Implement Elasticsearch or similar for advanced text search capabilities
6. **Background Exports**: Queue large exports for background processing
7. **Export Scheduling**: Allow users to schedule recurring exports 