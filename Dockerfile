# Use the official Node.js image as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Migrations run before the server, not after it. sequelize.sync() creates
# missing tables but never missing columns, so a boot-first order leaves the
# schema half-applied and fails on the first query for the new column.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
