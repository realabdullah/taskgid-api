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

# Not the production deploy path — the API runs on Vercel. Kept for container
# runs, where the ordering still matters: sequelize.sync() creates missing
# tables but never missing columns, so booting first leaves the schema
# half-applied and fails on the first query for the new column.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
