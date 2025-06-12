# To-Do List Backend

This is the backend for a To-Do List application built with Express.js and PostgreSQL. The application provides a RESTful API for managing to-do items, allowing users to create, read, update, and delete tasks.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Database Migration](#database-migration)
- [Environment Variables](#environment-variables)
- [License](#license)

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd to-do-list-backend
   ```

2. Install the dependencies:
   ```
   npm install
   ```

3. Set up your PostgreSQL database and update the `.env` file with your database connection details.

## Usage

To start the server, run:
```
npm start
```
The server will run on `http://localhost:3000`.

## API Endpoints

- `POST /todos` - Create a new to-do item
- `GET /todos` - Retrieve all to-do items
- `GET /todos/:id` - Retrieve a specific to-do item by ID
- `PUT /todos/:id` - Update a specific to-do item by ID
- `DELETE /todos/:id` - Delete a specific to-do item by ID

## Database Migration

To create the necessary database tables, run the SQL migration file located in the `migrations` directory:
```
psql -U <username> -d <database_name> -f migrations/001_create_todos_table.sql
```

## Environment Variables

Create a `.env` file in the root directory based on the `.env.example` file and fill in the required values:
```
DATABASE_HOST=localhost
DATABASE_USER=your_username
DATABASE_PASSWORD=your_password
DATABASE_NAME=your_database
```

## License

This project is licensed under the MIT License.