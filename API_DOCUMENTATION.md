# TaskGid API Documentation

## Overview

TaskGid is a task management application featuring workspaces, role-based team collaboration, tasks, and comments. This API documentation provides details on all endpoints, request/response formats, authentication methods, and authorization rules.

## Base URL

```
https://api.taskgid.com/v1 # Assuming v1 prefix based on OpenAPI spec
```

## Authentication

Most endpoints require authentication using JWT Bearer tokens. Obtain tokens via the `/auth/login` or `/auth/register` endpoints. Include the **access token** in the `Authorization` header for subsequent requests:

```
Authorization: Bearer <access_token>
```

Use the **refresh token** with the `/auth/refresh` endpoint to obtain a new set of tokens when the access token expires.

### Authentication Endpoints

#### Register a new user

```
POST /auth/register
```

**Description:** Registers a new user via self-signup. A default workspace is **not** created automatically. The user's `registrationSource` will be set to `self`.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "password": "securepassword"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "accessToken": {
    "token": "access_jwt_token_here",
    "expires": "iso_date_string_for_expiry"
  },
  "refreshToken": {
    "token": "refresh_jwt_token_here",
    "expires": "iso_date_string_for_expiry"
  },
  "user": {
    "id": "user_uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "profilePicture": "url_to_default_avatar",
    "registrationSource": "self",
    "createdAt": "datetime",
    "updatedAt": "datetime"
    // Note: Sensitive fields like password, tokens are excluded
  }
}
```

#### Login

```
POST /auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword"
}
```

**Response (200 OK):** (Includes access and refresh tokens)
```json
{
  "success": true,
  "accessToken": { ... as above ... },
  "refreshToken": { ... as above ... },
  "user": { ... user details as above ... }
}
```

#### Logout

```
POST /auth/logout
```

**Description:** Invalidates the user's current access token server-side (by clearing the stored token hash).
**Auth Required**: Yes

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### Refresh Token

```
POST /auth/refresh
```

**Description:** Exchanges a valid refresh token for a new pair of access and refresh tokens.
**Auth Required**: Yes (Requires both expired `Authorization: Bearer <access_token>` header AND `refreshToken` in body for validation)

**Request Body:**
```json
{
  "refreshToken": "valid_refresh_token_here"
}
```

**Response (200 OK):** (Includes new access and refresh tokens)
```json
{
  "success": true,
  "accessToken": { ... new token info ... },
  "refreshToken": { ... new token info ... }
}
```

## User Management

### Get User Profile

```
GET /users/profile
```

**Description:** Retrieves the profile of the currently authenticated user.
**Auth Required**: Yes

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "user_uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "username": "johndoe",
    "profilePicture": "url_to_picture",
    "registrationSource": "self", // or "invite"
    "createdAt": "datetime",
    "updatedAt": "datetime"
  }
}
```

### Update User Profile

```
PUT /users/profile
```

**Description:** Updates the authenticated user's profile information (name, username). Can also update the password.
**Auth Required**: Yes

**Request Body:**
```json
{
  "firstName": "Johnny",
  "lastName": "Doel",
  "username": "johnnyd",
  "password": "newSecurePassword" // Optional: Include only if changing password
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": { ... updated user profile (excluding password) ... }
}
```

### Update Profile Picture

```
PUT /users/profile/picture
```

**Description:** Updates the authenticated user's profile picture URL.
**Auth Required**: Yes

**Request Body:** (Note: Field name is `profile_picture`)
```json
{
  "profile_picture": "https://new-picture-url.com/image.jpg"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile picture updated successfully"
}
```

## Workspace Roles

Access to workspace management actions is controlled by roles assigned to users within each workspace via the `WorkspaceTeam` association. The roles are:

-   **`creator`**: The user who initially created the workspace. Has full control, including deleting the workspace and managing admin roles.
-   **`admin`**: Users promoted by the Creator. Can manage team members (add/remove members) and perform other administrative tasks, but cannot delete the workspace, manage other admins, or remove the Creator.
-   **`member`**: Default role for users added or invited to the workspace. Can access workspace content (tasks, comments, etc.) based on workspace settings, but has no administrative privileges over the workspace or team.

## Workspace Management

### Get User's Workspaces (Paginated)

```
GET /workspaces
```

**Description:** Retrieves a paginated list of workspaces where the authenticated user has any role (`creator`, `admin`, or `member`).
**Auth Required**: Yes
**Query Parameters**:
- `page` (integer, default: 1)
- `limit` (integer, default: 10)

**Response (200 OK)**: Paginated list of workspaces. Team members are **not** included in this list view.
```json
{
  "success": true,
  "data": [
    {
      "id": "workspace_uuid_1",
      "title": "Project Alpha",
      "slug": "project-alpha",
      "description": "Workspace for Alpha project",
      "createdAt": "datetime",
      "updatedAt": "datetime",
      "userId": "creator_user_uuid", // ID of the creator
      "user": { // Creator details (basic info)
         "id": "creator_user_uuid",
         "firstName": "Alice",
         "lastName": "Smith",
         "email": "alice@example.com",
         "profilePicture": "url_to_picture"
       }
    }
    // ... more workspaces
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "limit": 10,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Create Workspace

```
POST /workspaces
```

**Description:** Creates a new workspace. The requesting user automatically becomes the **`creator`** of the workspace and is added to the `WorkspaceTeam` with that role.
**Auth Required**: Yes

**Request Body:**
```json
{
  "title": "New Project Omega",
  "slug": "project-omega", // Optional, unique slug. Auto-generated if missing.
  "description": "Workspace for the Omega project"
}
```

**Response (201 Created)**: Details of the newly created workspace.
```json
{
  "success": true,
  "workspace": {
    "id": "new_workspace_uuid",
    "title": "New Project Omega",
    "slug": "project-omega-or-generated",
    "description": "Workspace for the Omega project",
    "createdAt": "datetime",
    "updatedAt": "datetime",
    "userId": "requesting_user_uuid", // Creator ID
    "user": { ... requesting user details (basic info) ... }
  }
}
```

### Get Workspace Details

```
GET /workspaces/{id}
```

**Description:** Retrieves details for a specific workspace by its ID. Requires the user to have any role (`creator`, `admin`, or `member`) in the workspace.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.

**Response (200 OK)**: Workspace details (team members are **not** included).
```json
{
  "id": "workspace_uuid",
  "title": "Project Alpha",
  "slug": "project-alpha",
  "description": "Workspace for Alpha project",
  "createdAt": "datetime",
  "updatedAt": "datetime",
  "userId": "creator_user_uuid",
  "user": { ... creator details (basic info) ... }
}
```

### Update Workspace Details

```
PUT /workspaces/{id}
```

**Description:** Updates the title, slug, or description of a workspace. Requires **`creator`** role.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.

**Request Body:**
```json
{
  "title": "Updated Project Alpha",
  "description": "Updated description."
}
```

**Response (200 OK)**: Updated workspace details.
```json
{
  "success": true,
  "workspace": { ... updated workspace details ... }
}
```

### Delete Workspace

```
DELETE /workspaces/{id}
```

**Description:** Permanently deletes a workspace and all associated data (tasks, team memberships, comments, etc.). Requires **`creator`** role.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.

**Response (200 OK)**: Success message.
```json
{
  "success": true,
  "message": "Workspace deleted successfully"
}
```

## Team Management

### Get Workspace Team (Paginated)

```
GET /workspaces/{id}/team
```

**Description:** Retrieves a paginated list of team members (including their workspace-specific roles) for a specific workspace. Requires the user to have any role (`creator`, `admin`, or `member`) in the workspace.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.
**Query Parameters**:
- `page` (integer, default: 1)
- `limit` (integer, default: 10)

**Response (200 OK)**: Paginated list of team members with their roles.
```json
{
  "success": true,
  "data": [
    {
      "id": "user_uuid_1",
      "firstName": "Alice",
      "lastName": "Smith",
      "email": "alice@example.com",
      "username": "alice",
      "profilePicture": "url_to_picture",
      "role": "creator" // Role within this workspace
    },
    {
      "id": "user_uuid_2",
      "firstName": "Bob",
      "lastName": "Jones",
      "email": "bob@example.com",
      "username": "bobj",
      "profilePicture": "url_to_picture",
      "role": "admin"
    },
    {
      "id": "user_uuid_3",
      "firstName": "Charlie",
      "lastName": "Brown",
      "email": "charlie@example.com",
      "username": "cbrown",
      "profilePicture": "url_to_picture",
      "role": "member"
    }
    // ... more members
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

### Add Team Member

```
POST /workspaces/{id}/team
```

**Description:** Adds an *existing* TaskGid user (specified by email) to the workspace team with the default `member` role. Requires **`creator`** or **`admin`** role in the workspace. For adding users who are not yet registered on TaskGid, use the Invite system.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.

**Request Body:**
```json
{
  "email": "existing_user@example.com"
}
```

**Response (201 Created)**: Success message.
```json
{
  "success": true,
  "message": "Team member added successfully"
}
```

### Remove Team Member

```
DELETE /workspaces/{id}/team/{userIdToRemove}
```

**Description:** Removes a user from the workspace team. Requires **`creator`** or **`admin`** role. Note: Admins cannot remove other Admins or the Creator. The Creator cannot be removed.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.
- `userIdToRemove` (string, uuid): The ID of the user to remove from the team.

**Response (200 OK)**: Success message.
```json
{
  "success": true,
  "message": "Team member removed successfully"
}
```

## Admin Role Management

### Promote Member to Admin

```
POST /workspaces/{id}/admins/{userId}
```

**Description:** Changes a team member's role from `member` to `admin`. Requires **`creator`** role.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.
- `userId` (string, uuid): The ID of the `member` user to promote.

**Response (200 OK)**: Success message.
```json
{
  "success": true,
  "message": "Member promoted to admin successfully"
}
```

### Demote Admin to Member

```
DELETE /workspaces/{id}/admins/{userId}
```

**Description:** Changes a team member's role from `admin` back to `member`. Requires **`creator`** role. Cannot be used on the Creator.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace.
- `userId` (string, uuid): The ID of the `admin` user to demote.

**Response (200 OK)**: Success message.
```json
{
  "success": true,
  "message": "Admin demoted to member successfully"
}
```

## Invite Management

### Invite User to Workspace

```
POST /invites/workspace/{id}
```

**Description:** Sends an invitation email (containing a unique, time-limited token) to the specified email address, inviting them to join the workspace. Requires **`creator`** or **`admin`** role in the workspace.
**Auth Required**: Yes
**Path Parameters**:
- `id` (string, uuid): The ID of the workspace to invite the user to.

**Request Body:**
```json
{
  "email": "new_or_existing_user@example.com"
}
```

**Response (201 Created)**: Success message.
```json
{
  "success": true,
  "message": "User invited successfully"
}
```

### Accept Invite

```
POST /invites/accept
```

**Description:** Accepts a workspace invitation using the token received via email. 
- If the invited email belongs to an existing user, they are added to the workspace team with the `member` role.
- If the email does not belong to an existing user, a new placeholder user account is created (with `registrationSource` set to `invite`, a generated username, and a temporary password), and this new user is added to the workspace team with the `member` role. 
- Placeholder users will need to complete their profile (set first name, last name, and a permanent password) through the `/users/profile` endpoint later.
**Auth Required**: No (Token serves as authentication)

**Request Body:**
```json
{
  "token": "invite_token_from_email"
}
```

**Response (200 OK)**: Indicates success and whether a new user account was created.
```json
{
  "success": true,
  "message": "Invite accepted successfully",
  "isNewUser": false // or true if a placeholder account was created
}
```

## Task Management

*(Endpoints follow the pattern: `/workspaces/{id}/tasks` and `/workspaces/{id}/tasks/{taskId}`)*

- **GET `/workspaces/{id}/tasks`**: List tasks (paginated). Requires workspace membership.
- **POST `/workspaces/{id}/tasks`**: Create a task. Requires workspace membership.
- **GET `/workspaces/{id}/tasks/{taskId}`**: Get task details. Requires workspace membership.
- **PUT `/workspaces/{id}/tasks/{taskId}`**: Update task. Requires workspace membership (further restrictions like assignee/creator possible).
- **DELETE `/workspaces/{id}/tasks/{taskId}`**: Delete task. Requires workspace membership (further restrictions possible).

**Authorization Note:** Access to tasks generally requires the user to have any role (`creator`, `admin`, or `member`) in the parent workspace (`{id}`). Specific actions might be restricted further based on roles or user association (e.g., only assignees or creator can update status), although current implementation may allow broader access for simplicity.

## Comment Management

*(Endpoints follow the pattern: `/workspaces/{id}/tasks/{taskId}/comments` and `/workspaces/{id}/tasks/{taskId}/comments/{commentId}`)*

- **GET `/workspaces/{id}/tasks/{taskId}/comments`**: List comments (paginated). Requires workspace membership.
- **POST `/workspaces/{id}/tasks/{taskId}/comments`**: Add a comment. Requires workspace membership.
- **PUT `/workspaces/{id}/tasks/{taskId}/comments/{commentId}`**: Update a comment. Requires user to be the author.
- **DELETE `/workspaces/{id}/tasks/{taskId}/comments/{commentId}`**: Delete a comment. Requires user to be the author or workspace admin/creator.

**Mentions:**
- When creating or updating comments, you can mention other users who are members of the same workspace by using the `@username` syntax (e.g., `"Hey @bobj, take a look!"`).
- Mentioned users (excluding the comment author) will receive a real-time notification via Pusher on the `private-user-{userId}` channel with the event name `comment-mention`.
- The notification payload includes details about the comment, author, task, and workspace.

**Authorization Note:** Access to view comments generally requires the user to have any role in the parent workspace. Editing/Deleting is typically restricted to the comment author.

## Attachment Management

*(Endpoints allow uploading, viewing, and deleting files associated with tasks or comments.)*

### Get Task Attachments

```
GET /workspaces/{id}/tasks/{taskId}/attachments
```

**Description:** Retrieves a list of attachments associated with a specific task.
**Auth Required**: Yes (User must be a member/admin/creator of the workspace)
**Path Parameters**:
- `id` (string, uuid): Workspace ID.
- `taskId` (string, uuid): Task ID.

**Response (200 OK):**
```json
{
  "success": true,
  "attachments": [
    {
      "id": "attachment_uuid_1",
      "filename": "storage_provider_key_1.jpg",
      "originalname": "screenshot.jpg",
      "mimetype": "image/jpeg",
      "size": 153020,
      "url": "public_url_to_file_1",
      "storageType": "s3",
      "taskId": "task_uuid",
      "commentId": null,
      "userId": "uploader_uuid",
      "user": { "id": "uploader_uuid", "username": "alice", "firstName": "Alice" },
      "createdAt": "datetime",
      "updatedAt": "datetime"
    }
    // ... more attachments ...
  ]
}
```

### Upload Task Attachment

```
POST /workspaces/{id}/tasks/{taskId}/attachments
```

**Description:** Uploads a file and attaches it to a specific task.
**Auth Required**: Yes (User must be a member/admin/creator of the workspace)
**Path Parameters**:
- `id` (string, uuid): Workspace ID.
- `taskId` (string, uuid): Task ID.
**Request Body:** `multipart/form-data` with a single field:
- `file`: The file to upload.

**Response (201 Created):**
```json
{
  "success": true,
  "attachment": { ... details of the created attachment record ... }
}
```

### Get Comment Attachments

```
GET /workspaces/{id}/comments/{commentId}/attachments
```

**Description:** Retrieves a list of attachments associated with a specific comment.
**Auth Required**: Yes (User must be a member/admin/creator of the workspace)
**Path Parameters**:
- `id` (string, uuid): Workspace ID (inferred from comment).
- `commentId` (string, uuid): Comment ID.

**Response (200 OK):** (Similar structure to Get Task Attachments, but `taskId` will be null and `commentId` populated)
```json
{
  "success": true,
  "attachments": [ ... ]
}
```

### Upload Comment Attachment

```
POST /workspaces/{id}/comments/{commentId}/attachments
```

**Description:** Uploads a file and attaches it to a specific comment.
**Auth Required**: Yes (User must be a member/admin/creator of the workspace)
**Path Parameters**:
- `id` (string, uuid): Workspace ID (inferred from comment).
- `commentId` (string, uuid): Comment ID.
**Request Body:** `multipart/form-data` with a single field:
- `file`: The file to upload.

**Response (201 Created):**
```json
{
  "success": true,
  "attachment": { ... details of the created attachment record ... }
}
```

### Delete Attachment

```
DELETE /attachments/{attachmentId}
```

**Description:** Deletes an attachment record from the database and the corresponding file from the storage provider. Requires the user to be the original uploader OR a workspace `creator` or `admin`.
**Auth Required**: Yes
**Path Parameters**:
- `attachmentId` (string, uuid): The ID of the attachment to delete.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Attachment deleted successfully"
}
```

## Notification Management

*(Assume endpoints exist: `GET /notifications`, `PUT /notifications/{id}`, `DELETE /notifications/{id}`)*

**Authorization Note:** Users can only access and manage their own notifications.

## Error Responses

Standard HTTP status codes are used. Common error responses include:

**400 Bad Request**: Invalid input, validation error, conflicting data.
```json
{ "error": "Specific error message (e.g., Email already exists)", "success": false }
```

**401 Unauthorized**: Missing, invalid, or expired JWT access token.
```json
{ "error": "Unauthorized", "success": false }
```

**403 Forbidden**: Authenticated user does not have the necessary role/permission for the action.
```json
{ "error": "Access denied" or "Only workspace creators can perform this action", "success": false }
```

**404 Not Found**: The requested resource (workspace, user, task, etc.) does not exist.
```json
{ "error": "Workspace not found", "success": false }
```

**500 Internal Server Error**: An unexpected error occurred on the server.
```json
{ "error": "Server error occurred", "success": false }
```

## Data Models (Examples in Responses)

*(These show the typical structure of data returned in responses. Sensitive fields are excluded.)*

### User
```json
{
  "id": "uuid",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "profilePicture": "url_to_picture",
  "registrationSource": "self", // or "invite"
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Workspace
```json
{
  "id": "uuid",
  "title": "Project Alpha",
  "slug": "project-alpha",
  "description": "Description of the workspace",
  "userId": "creator_user_uuid", // Creator's ID
  "user": { // Basic creator info
    "id": "creator_user_uuid",
    "firstName": "Alice",
    "lastName": "Smith",
    "email": "alice@example.com",
    "profilePicture": "url_to_picture"
  },
  "createdAt": "datetime",
  "updatedAt": "datetime"
  // Note: Team list is fetched separately via /workspaces/{id}/team
}
```

### WorkspaceTeamMember (as seen in GET /workspaces/{id}/team)
```json
{
  "id": "user_uuid",
  "firstName": "Bob",
  "lastName": "Jones",
  "email": "bob@example.com",
  "username": "bobj",
  "profilePicture": "url_to_picture",
  "role": "admin" // Role specific to this workspace
}
```

### Task
```json
{
  "id": "uuid",
  "title": "Task Title",
  "description": "Task description",
  "status": "TODO", // e.g., TODO, IN_PROGRESS, DONE
  "priority": "MEDIUM", // e.g., LOW, MEDIUM, HIGH
  "dueDate": "iso_date_string_or_null",
  "workspaceId": "parent_workspace_uuid",
  "createdById": "creator_user_uuid",
  "creator": { // Basic info of task creator
     "id": "creator_user_uuid",
     "username": "johndoe",
     // ... other basic fields
  },
  "assignees": [ // Array of assigned users (basic info)
    {
       "id": "assignee_user_uuid",
       "username": "bobj",
       // ... other basic fields
    }
  ],
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Comment
```json
{
  "id": "uuid",
  "content": "This is a comment.",
  "taskId": "parent_task_uuid",
  "userId": "commenter_user_uuid",
  "user": { // Basic info of commenter
    "id": "commenter_user_uuid",
    "username": "johndoe",
    // ... other basic fields
  },
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Attachment
```json
{
  "id": "uuid",
  "filename": "storage_provider_key.ext",
  "originalname": "original_filename.ext",
  "mimetype": "mime/type",
  "size": 123456, // bytes
  "url": "public_url_to_file",
  "storageType": "s3", // e.g., local, s3, r2, cloudinary
  "taskId": "task_uuid_or_null",
  "commentId": "comment_uuid_or_null",
  "userId": "uploader_uuid",
  "user": { // Populated on GET requests
      "id": "uploader_uuid",
      "username": "uploader_username",
      "firstName": "UploaderFirstName"
   },
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

## Implementation Notes

1.  **Authentication**: Use JWT Bearer tokens for protected endpoints.
2.  **Authorization**: Permissions are based on workspace roles (`creator`, `admin`, `member`). Check endpoint descriptions for specific role requirements.
3.  **Error Handling**: Expect standard HTTP status codes and JSON error bodies.
4.  **Pagination**: Use `page` and `limit` query parameters for list endpoints. Responses include pagination metadata.
5.  **Invites**: Use the invite flow to add new users to the platform *and* a workspace simultaneously. Use the add team member endpoint for adding *existing* users.
6.  **File Uploads**: Use multipart/form-data for uploads. Note server-side processing (like image compression) may occur.

This documentation provides a comprehensive overview of the TaskGid API reflecting the current implementation. For further details, refer to the OpenAPI specification or contact the development team. 