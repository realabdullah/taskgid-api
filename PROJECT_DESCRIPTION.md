# TaskGid API - Project Description

## Overview
TaskGid API is a comprehensive task management backend application built with Node.js, Express, and PostgreSQL. It provides a robust platform for individuals and teams to organize, track, and collaborate on tasks and projects effectively.

## Core Features

### User Management
- Secure authentication with email/password and WebAuthn support
- User profiles with customizable information and profile pictures
- Role-based access control (user, admin)

### Workspace Management
- Create and manage multiple workspaces for different projects or teams
- Each workspace has its own set of tasks, members, and settings
- Descriptive slugs for easy URL access

### Task Management
- Create, update, and delete tasks with rich descriptions
- Task prioritization (low, medium, high)
- Status tracking (todo, in_progress, done)
- Task assignment to team members
- Due date management

### Collaboration Tools
- Comment system for task discussions
- File attachments for tasks and comments
- Team member management within workspaces
- Real-time updates using Pusher

### File Storage
- Multiple storage options (local, Cloudinary, AWS S3)
- File type validation and secure handling
- Image optimization with Sharp

### Statistics and Reporting
- Task status distribution
- Priority distribution
- Completion rate tracking
- Team member activity metrics

## Technical Stack

### Backend Framework
- Node.js with Express.js
- RESTful API design
- OpenAPI/Swagger documentation

### Authentication & Security
- JWT-based authentication
- WebAuthn for passwordless authentication
- Rate limiting for API protection
- Input sanitization and validation

### Database
- PostgreSQL relational database
- Sequelize ORM for data modeling and migrations
- Database synchronization tools

### Integrations
- Email notifications via MailerSend
- File storage with AWS S3 and Cloudinary
- Push notifications with Firebase Admin
- Real-time updates via Pusher

### Development Tools
- ESLint for code quality
- Nodemon for development
- Dockerized deployment option

## Deployment
The application can be deployed as a standalone service or using Docker. It supports different environment configurations for development and production.

## Project Goals
TaskGid API aims to provide a scalable, secure, and feature-rich backend for task management applications, enabling efficient team collaboration and project management with a focus on usability and performance. 